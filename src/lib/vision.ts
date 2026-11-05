import type { HandLandmarker, ImageSegmenter, PoseLandmarker } from '@mediapipe/tasks-vision';

export async function createClothingSegmenter(wasmPath: string): Promise<ImageSegmenter> {
  const { vision, resolver } = await fileset(wasmPath);
  return vision.ImageSegmenter.createFromOptions(resolver, {
    baseOptions: { modelAssetPath: '/models/selfie_multiclass.tflite', delegate: 'CPU' },
    runningMode: 'VIDEO',
    outputCategoryMask: true,
    outputConfidenceMasks: false,
  });
}

/** Google's published Pose Landmarker Lite. Used only if /api/config offers no local copy, and only when switched on. */
export const DEFAULT_POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

async function fileset(wasmPath: string) {
  const vision = await import('@mediapipe/tasks-vision');
  const resolver = await vision.FilesetResolver.forVisionTasks(wasmPath);
  return { vision, resolver };
}

function modelError(what: string, error: unknown): Error {
  const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
  return new Error(`The ${what} model could not be loaded${detail}.`);
}

export async function createHandLandmarker(modelUrl: string, wasmPath: string): Promise<HandLandmarker> {
  if (!modelUrl || !wasmPath) throw new Error('The server did not provide a hand model location.');
  try {
    const { vision, resolver } = await fileset(wasmPath);
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: modelUrl, delegate },
      runningMode: 'VIDEO' as const,
      numHands: 1,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });
    try {
      return await vision.HandLandmarker.createFromOptions(resolver, options('GPU'));
    } catch {
      return await vision.HandLandmarker.createFromOptions(resolver, options('CPU'));
    }
  } catch (error) {
    throw modelError('hand tracking', error);
  }
}

export async function createPoseLandmarker(modelUrl: string, wasmPath: string, tryGpu = true): Promise<PoseLandmarker> {
  if (!wasmPath) throw new Error('The server did not provide a vision runtime location.');
  try {
    const { vision, resolver } = await fileset(wasmPath);
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: modelUrl, delegate },
      runningMode: 'VIDEO' as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.55,
      minTrackingConfidence: 0.5,
    });
    if (!tryGpu) return await vision.PoseLandmarker.createFromOptions(resolver, options('CPU'));
    try {
      return await vision.PoseLandmarker.createFromOptions(resolver, options('GPU'));
    } catch {
      return await vision.PoseLandmarker.createFromOptions(resolver, options('CPU'));
    }
  } catch (error) {
    throw modelError('body tracking', error);
  }
}
