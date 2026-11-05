import { useEffect, useRef, useState } from 'react';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { mediaSize } from '../lib/capture';
import type { MediaEl } from '../lib/capture';
import { HAND, INITIAL_PINCH, mapCover, pinchRatio, rangeValueAt, smoothPoint, stepPinch } from '../lib/gesture';
import type { PinchState, Point2 } from '../lib/gesture';
import { createHandLandmarker } from '../lib/vision';

export type HandStatus = 'off' | 'loading' | 'searching' | 'tracking' | 'error';

const FRAME_INTERVAL_MS = 33;
const TARGETS = 'button, a[href], input, select, summary, label, [data-gesture-target]';

function setRangeValue(input: HTMLInputElement, x: number) {
  const rect = input.getBoundingClientRect();
  const value = rangeValueAt(x, rect.left, rect.width, Number(input.min || 0), Number(input.max || 100), Number(input.step || 1));
  // React tracks input values, so the native setter is needed for onChange to fire.
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function clickAt(x: number, y: number) {
  const el = document.elementFromPoint(x, y);
  const target = el?.closest<HTMLElement>(TARGETS);
  if (!target || (target as HTMLButtonElement).disabled) return;
  if (target instanceof HTMLInputElement && target.type === 'range') {
    setRangeValue(target, x);
    return;
  }
  target.focus({ preventScroll: true });
  target.click();
}

interface Options {
  enabled: boolean;
  getMedia: () => MediaEl | null;
  mirrored: boolean;
  modelUrl?: string;
  wasmPath?: string;
}

/**
 * Index fingertip drives an on-screen cursor; thumb-to-index pinch clicks what
 * is under it. Cursor movement writes straight to the DOM to avoid re-rendering
 * the app 30 times a second.
 */
export function useHandPointer({ enabled, getMedia, mirrored, modelUrl, wasmPath }: Options) {
  const [status, setStatus] = useState<HandStatus>('off');
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const getMediaRef = useRef(getMedia);
  getMediaRef.current = getMedia;
  const mirroredRef = useRef(mirrored);
  mirroredRef.current = mirrored;

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      return;
    }
    let cancelled = false;
    let frame = 0;
    let landmarker: HandLandmarker | null = null;
    let lastRun = 0;
    let pinch: PinchState = INITIAL_PINCH;
    let cursor: Point2 | null = null;
    let hovered: HTMLElement | null = null;
    let current: HandStatus = 'loading';

    const report = (next: HandStatus) => {
      if (next !== current) {
        current = next;
        setStatus(next);
      }
    };

    const setHover = (el: HTMLElement | null) => {
      if (el === hovered) return;
      hovered?.classList.remove('is-gesture-hover');
      el?.classList.add('is-gesture-hover');
      hovered = el;
    };

    const hideCursor = () => {
      const node = cursorRef.current;
      if (node) node.dataset.visible = 'false';
      setHover(null);
      cursor = null;
    };

    const tick = (now: number) => {
      if (cancelled) return;
      frame = requestAnimationFrame(tick);
      if (now - lastRun < FRAME_INTERVAL_MS || !landmarker) return;
      lastRun = now;
      const media = getMediaRef.current();
      const size = mediaSize(media);
      if (!media || !size.width) return;
      if (media instanceof HTMLVideoElement && media.readyState < 2) return;

      let result;
      try {
        result = landmarker.detectForVideo(media, now);
      } catch (e) {
        cancelled = true;
        hideCursor();
        const tainted = e instanceof DOMException && e.name === 'SecurityError';
        setError(
          tainted
            ? 'Hand tracking cannot read this camera stream because it sends no CORS header.'
            : 'Hand tracking stopped unexpectedly. Switch it off and on to try again.',
        );
        setStatus('error');
        return;
      }

      const landmarks = result.landmarks[0];
      const score = result.handedness?.[0]?.[0]?.score ?? 0;
      const ratio = landmarks ? pinchRatio(landmarks, size.width / size.height) : null;
      const step = stepPinch(pinch, { ratio, confidence: score, now });
      pinch = step.state;

      if (!landmarks || score < 0.6) {
        hideCursor();
        report('searching');
        return;
      }
      report('tracking');

      const rect = media.getBoundingClientRect();
      const mapped = mapCover(landmarks[HAND.INDEX_TIP], {
        sourceWidth: size.width,
        sourceHeight: size.height,
        viewWidth: rect.width,
        viewHeight: rect.height,
        viewLeft: rect.left,
        viewTop: rect.top,
        mirrored: mirroredRef.current,
      });
      cursor = smoothPoint(cursor, mapped);
      const node = cursorRef.current;
      if (node) {
        node.dataset.visible = 'true';
        node.dataset.pinching = String(step.pinching);
        node.style.transform = `translate3d(${cursor.x}px, ${cursor.y}px, 0)`;
      }
      const under = document.elementFromPoint(cursor.x, cursor.y)?.closest<HTMLElement>(TARGETS) ?? null;
      setHover(under);
      if (step.clicked) clickAt(cursor.x, cursor.y);
    };

    setError(null);
    setStatus('loading');
    createHandLandmarker(modelUrl ?? '', wasmPath ?? '')
      .then((instance) => {
        if (cancelled) {
          instance.close();
          return;
        }
        landmarker = instance;
        report('searching');
        frame = requestAnimationFrame(tick);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'The hand tracking model could not be loaded.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      hideCursor();
      landmarker?.close();
    };
  }, [enabled, modelUrl, wasmPath]);

  return { status, error, cursorRef };
}
