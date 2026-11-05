import { useEffect, useRef, useState } from 'react';
import { mediaSize } from '../lib/capture';
import type { MediaEl } from '../lib/capture';
import { prepareShirt } from '../lib/liveFit';
import { motionAnchors, readMotionFrame, trackMotion } from '../lib/fitMotion';
import type { MotionFrame } from '../lib/fitMotion';
import { sleeveEdges, sleevePatches } from '../lib/sleeveCoverage';
import { paintDrapedShirt } from '../lib/paintDrapedShirt';
import type { FitFrame, FitRequest, FitResponse } from '../lib/liveFit.worker';
import fitWorkerUrl from '../lib/liveFit.worker?worker&url';

interface Props {
  imageUrl: string;
  crewNeck: boolean;
  getMedia: () => MediaEl | null;
  poseModelUrl: string | undefined;
  wasmPath: string;
}

export function LiveFit({ imageUrl, crewNeck, getMedia, poseModelUrl, wasmPath }: Props) {
  const output = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'searching' | 'fitting' | 'error'>('loading');

  useEffect(() => {
    const canvas = output.current;
    const context = canvas?.getContext('2d');
    const tracking = document.createElement('canvas');
    const trackingContext = tracking.getContext('2d', { willReadFrequently: true });
    const mask = document.createElement('canvas');
    const maskContext = mask.getContext('2d');
    const drape = document.createElement('canvas');
    const drapeContext = drape.getContext('2d');
    if (!canvas || !context || !trackingContext || !maskContext || !drapeContext) return;
    const padding = 32;

    let stopped = false;
    let animation = 0;
    let worker: Worker | undefined;
    let ready = false;
    let texture: ReturnType<typeof prepareShirt>;
    let pending: MotionFrame | undefined;
    let reference: {
      fit: NonNullable<FitFrame>;
      motion: MotionFrame;
      anchors: ReturnType<typeof motionAnchors>;
      sleeves: ReturnType<typeof sleeveEdges>;
      time: number;
    } | undefined;
    let lastFrame = 0;
    let lastPaint = -Infinity;
    let lastVideoTime = -1;
    let previousStatus = 'loading';
    setStatus('loading');
    canvas.style.visibility = 'hidden';

    const report = (next: typeof status) => {
      if (next === previousStatus) return;
      previousStatus = next;
      setStatus(next);
      canvas.style.visibility = next === 'fitting' ? 'visible' : 'hidden';
    };

    const tick = (time: number) => {
      animation = requestAnimationFrame(tick);
      const media = getMedia();
      const { width, height } = mediaSize(media);
      if (!ready || !media || !width || !height || time - lastFrame < 28) return;
      if (media instanceof HTMLVideoElement) {
        if (media.readyState < 2 || media.currentTime === lastVideoTime) return;
        lastVideoTime = media.currentTime;
      }
      lastFrame = time;
      const scale = Math.min(1, 576 / Math.max(width, height));
      const w = Math.round(width * scale);
      const h = Math.round(height * scale);
      if (canvas.width !== w || canvas.height !== h || !tracking.width) {
        canvas.width = w;
        canvas.height = h;
        drape.width = w + 2 * padding;
        drape.height = h + 2 * padding;
        tracking.width = Math.max(1, Math.round(192 * w / Math.max(w, h)));
        tracking.height = Math.max(1, Math.round(192 * h / Math.max(w, h)));
        reference = undefined;
      }
      try {
        trackingContext.drawImage(media, 0, 0, tracking.width, tracking.height);
        const current = readMotionFrame(trackingContext);
        if (!pending) {
          pending = current;
          void createImageBitmap(media, { resizeWidth: w, resizeHeight: h }).then(bitmap => {
            if (stopped || !worker) return bitmap.close();
            worker.postMessage({ type: 'frame', frame: bitmap, time } satisfies FitRequest, [bitmap]);
          }).catch(fail);
        }
        const offset = reference && time - reference.time <= 850
          ? trackMotion(reference.motion, current, reference.anchors)
          : null;
        if (!reference || !offset) {
          if (time - lastPaint > 240) report('searching');
          return;
        }
        const x = offset.x * w / current.width;
        const y = offset.y * h / current.height;
        const { fit } = reference;
        context.clearRect(0, 0, w, h);
        context.fillStyle = texture.color;
        context.fillRect(0, 0, w, h);
        context.drawImage(drape, x - padding, y - padding);
        const span = fit.shoulderSpan * w;
        if (crewNeck && fit.neckline.length >= 7) {
          context.beginPath();
          fit.neckline.forEach((point, index) => {
            const px = point.x * w + x;
            const py = point.y * h + y + span * 0.014;
            if (index === 0) context.moveTo(px, py);
            else context.lineTo(px, py);
          });
          context.lineWidth = Math.max(1, span * 0.015);
          context.lineJoin = 'round';
          context.lineCap = 'round';
          context.strokeStyle = 'rgb(0 0 0 / 0.23)';
          context.stroke();
        }
        context.globalCompositeOperation = 'destination-in';
        context.imageSmoothingEnabled = false;
        context.drawImage(mask, x, y, w, h);
        context.imageSmoothingEnabled = true;
        context.globalCompositeOperation = 'source-over';
        context.fillStyle = texture.color;
        const pixelWidth = w / current.width;
        const pixelHeight = h / current.height;
        context.beginPath();
        sleevePatches(reference.sleeves, reference.motion, current, offset, (left, row, columns, rows) => {
          const y0 = Math.floor(row * pixelHeight);
          const y1 = Math.ceil((row + rows) * pixelHeight);
          const x0 = Math.floor(left * pixelWidth);
          const x1 = Math.ceil((left + columns) * pixelWidth);
          context.rect(x0, y0, x1 - x0, y1 - y0);
        });
        context.fill();
        context.globalCompositeOperation = 'destination-over';
        context.drawImage(media, 0, 0, w, h);
        context.globalCompositeOperation = 'source-over';
        lastPaint = time;
        report('fitting');
      } catch {
        fail();
      }
    };

    const fail = () => {
      if (stopped) return;
      ready = false;
      cancelAnimationFrame(animation);
      worker?.terminate();
      report('error');
    };

    const load = async () => {
      const image = new Image();
      image.src = imageUrl;
      await image.decode();
      if (stopped) return;
      texture = prepareShirt(image);
      worker = new Worker('/models/live-fit-bootstrap.js');
      worker.onerror = fail;
      worker.onmessage = ({ data }: MessageEvent<FitResponse>) => {
        if (data.type === 'error') return fail();
        if (data.type === 'ready') {
          ready = true;
          report('searching');
          animation = requestAnimationFrame(tick);
          return;
        }
        const motion = pending;
        pending = undefined;
        const { fit, mask: shirtMask, time } = data;
        if (!motion || !fit || !shirtMask || motion.width !== tracking.width || motion.height !== tracking.height) {
          return;
        }
        const chestY = Math.min(fit.top + (fit.bottom - fit.top) * 0.47, 0.83);
        const anchors = motionAnchors(motion, [
          { x: fit.center - fit.shoulderSpan * 0.48, y: fit.shoulderY },
          { x: fit.center + fit.shoulderSpan * 0.48, y: fit.shoulderY },
          { x: fit.center - fit.shoulderSpan * 0.34, y: chestY },
          { x: fit.center + fit.shoulderSpan * 0.34, y: chestY },
        ]);
        if (!anchors.length) return;
        mask.width = shirtMask.width;
        mask.height = shirtMask.height;
        maskContext.putImageData(shirtMask, 0, 0);
        const prior = reference;
        const shift = prior && trackMotion(prior.motion, motion, prior.anchors);
        if (prior && shift) {
          const blend = (old: number, next: number) => old * 0.35 + next * 0.65;
          const shiftX = shift.x / motion.width;
          const shiftY = shift.y / motion.height;
          fit.center = blend(prior.fit.center + shiftX, fit.center);
          fit.waistCenter = blend(prior.fit.waistCenter + shiftX, fit.waistCenter);
          fit.shoulderSpan = blend(prior.fit.shoulderSpan, fit.shoulderSpan);
          fit.angle = blend(prior.fit.angle, fit.angle);
          fit.top = blend(prior.fit.top + shiftY, fit.top);
          fit.bottom = blend(prior.fit.bottom + shiftY, fit.bottom);
        }
        // The fabric shape only changes when a new pose arrives. Reuse it while tracking motion.
        drapeContext.clearRect(0, 0, drape.width, drape.height);
        paintDrapedShirt(drapeContext, texture.fabric, fit, canvas.width, canvas.height, padding, padding);
        reference = { fit, motion, anchors, sleeves: sleeveEdges(shirtMask, motion, fit), time };
      };
      worker.postMessage({ type: 'init', moduleUrl: new URL(fitWorkerUrl, window.location.href).href, wasmPath, poseModelUrl });
    };
    void load().catch(fail);
    return () => {
      stopped = true;
      cancelAnimationFrame(animation);
      worker?.terminate();
    };
  }, [imageUrl, crewNeck, getMedia, poseModelUrl, wasmPath]);

  return (
    <>
      <canvas ref={output} className="stage__media live-fit" data-visible="true" data-mirrored="true"
        aria-hidden="true" data-testid="live-fit-canvas" />
      <span className="live-fit__status" role="status" data-testid="live-fit-status" data-state={status}>
        {status === 'loading' && 'Loading live try-on…'}
        {status === 'searching' && 'Keep your face, shoulders and chest in view.'}
        {status === 'fitting' && 'Live try-on'}
        {status === 'error' && 'Live try-on could not start.'}
      </span>
    </>
  );
}
