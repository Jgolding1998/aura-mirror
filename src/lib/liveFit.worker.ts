import type { ImageSegmenter, PoseLandmarker } from '@mediapipe/tasks-vision';
import { paintShirtMask } from './liveFit';
import { createClothingSegmenter, createPoseLandmarker } from './vision';

export type FitFrame = ReturnType<typeof paintShirtMask>;
export type FitRequest =
  | { type: 'init'; wasmPath: string; poseModelUrl?: string }
  | { type: 'frame'; frame: ImageBitmap; time: number };
export type FitResponse =
  | { type: 'ready' }
  | { type: 'fit'; fit: FitFrame; mask?: ImageData; time: number }
  | { type: 'error'; message: string };

let segmenter: ImageSegmenter;
let pose: PoseLandmarker | undefined;

self.onmessage = async (event: MessageEvent<FitRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'init') {
      segmenter = await createClothingSegmenter(request.wasmPath);
      self.postMessage({ type: 'ready' } satisfies FitResponse);
      if (request.poseModelUrl) {
        pose = await createPoseLandmarker(request.poseModelUrl, request.wasmPath, false).catch(() => undefined);
      }
      return;
    }
    const { frame, time } = request;
    try {
      const landmarks = pose?.detectForVideo(frame, time).landmarks[0];
      segmenter.segmentForVideo(frame, time, result => {
        const labels = result.categoryMask;
        const mask = labels && new ImageData(labels.width, labels.height);
        const fit = labels && mask
          ? paintShirtMask(labels.getAsUint8Array(), mask, landmarks, frame.width / frame.height)
          : null;
        self.postMessage({ type: 'fit', time, fit, mask: fit ? mask : undefined } satisfies FitResponse);
      });
    } finally {
      frame.close();
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error) } satisfies FitResponse);
  }
};
