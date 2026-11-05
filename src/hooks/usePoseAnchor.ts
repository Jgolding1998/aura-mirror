import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { mediaSize } from '../lib/capture';
import type { MediaEl } from '../lib/capture';
import { garmentBoxFromPose } from '../lib/overlay';
import type { GarmentBox } from '../lib/overlay';
import { createPoseLandmarker, DEFAULT_POSE_MODEL } from '../lib/vision';

export type PoseStatus = 'off' | 'loading' | 'searching' | 'tracking' | 'error';

const FRAME_INTERVAL_MS = 66;

interface Options {
  enabled: boolean;
  getMedia: () => MediaEl | null;
  mirrored: boolean;
  category: string | null;
  poseModelUrl?: string;
  wasmPath?: string;
  /** Receives the anchor as CSS custom properties, avoiding a re-render per frame. */
  targetRef: RefObject<HTMLElement | null>;
}

/** Optional. Pins the overlay's position and size to shoulders or hips. It does not warp the garment. */
export function usePoseAnchor({ enabled, getMedia, mirrored, category, poseModelUrl, wasmPath, targetRef }: Options) {
  const [status, setStatus] = useState<PoseStatus>('off');
  const [error, setError] = useState<string | null>(null);
  const getMediaRef = useRef(getMedia);
  getMediaRef.current = getMedia;
  const mirroredRef = useRef(mirrored);
  mirroredRef.current = mirrored;
  const categoryRef = useRef(category);
  categoryRef.current = category;

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      setError(null);
      return;
    }
    let cancelled = false;
    let frame = 0;
    let lastRun = 0;
    let landmarker: PoseLandmarker | null = null;
    let box: GarmentBox | null = null;
    let current: PoseStatus = 'loading';

    const report = (next: PoseStatus) => {
      if (next !== current) {
        current = next;
        setStatus(next);
      }
    };

    const clearAnchor = () => {
      const node = targetRef.current;
      if (node) delete node.dataset.anchored;
      box = null;
    };

    const tick = (now: number) => {
      if (cancelled) return;
      frame = requestAnimationFrame(tick);
      if (now - lastRun < FRAME_INTERVAL_MS || !landmarker) return;
      lastRun = now;
      const media = getMediaRef.current();
      const size = mediaSize(media);
      if (!media || !size.width || !categoryRef.current) return;
      if (media instanceof HTMLVideoElement && media.readyState < 2) return;

      let landmarks;
      try {
        landmarks = landmarker.detectForVideo(media, now).landmarks[0];
      } catch {
        cancelled = true;
        clearAnchor();
        setError('Body tracking could not read this camera source.');
        setStatus('error');
        return;
      }

      const rect = media.getBoundingClientRect();
      const next = garmentBoxFromPose(landmarks, categoryRef.current, {
        sourceWidth: size.width,
        sourceHeight: size.height,
        viewWidth: rect.width,
        viewHeight: rect.height,
        viewLeft: rect.left,
        viewTop: rect.top,
        mirrored: mirroredRef.current,
      });
      const node = targetRef.current;
      if (!next || !node) {
        clearAnchor();
        report('searching');
        return;
      }
      const k = box ? 0.35 : 1;
      box = box
        ? { left: box.left + (next.left - box.left) * k, top: box.top + (next.top - box.top) * k, width: box.width + (next.width - box.width) * k }
        : next;
      node.dataset.anchored = 'true';
      node.style.setProperty('--anchor-left', `${box.left}px`);
      node.style.setProperty('--anchor-top', `${box.top}px`);
      node.style.setProperty('--anchor-width', `${box.width}px`);
      report('tracking');
    };

    setError(null);
    setStatus('loading');
    createPoseLandmarker(poseModelUrl ?? DEFAULT_POSE_MODEL, wasmPath ?? '')
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
        setError(e instanceof Error ? e.message : 'The body tracking model could not be loaded.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearAnchor();
      landmarker?.close();
    };
  }, [enabled, poseModelUrl, wasmPath, targetRef]);

  return { status, error };
}
