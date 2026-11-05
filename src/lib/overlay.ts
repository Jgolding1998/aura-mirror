import { mapCover } from './gesture.ts';
import type { CoverMapInput, Point2 } from './gesture.ts';

export interface PoseLandmark extends Point2 {
  visibility?: number;
}

export interface GarmentBox {
  left: number;
  top: number;
  width: number;
}

/** Where the fitting line of each sample drawing sits, as fractions of its 800x1000 artboard. */
const FIT: Record<string, { span: number; lineY: number }> = {
  shirts: { span: 0.41, lineY: 0.14 },
  jackets: { span: 0.49, lineY: 0.14 },
  pants: { span: 0.335, lineY: 0.09 },
};

const POSE = { L_SHOULDER: 11, R_SHOULDER: 12, L_HIP: 23, R_HIP: 24 } as const;
const MIN_VISIBILITY = 0.55;

/**
 * Places a flat garment drawing from pose landmarks: shoulders for tops, hips
 * for pants. Returns null unless both anchor points are clearly visible, so the
 * overlay falls back to manual alignment rather than guessing.
 */
export function garmentBoxFromPose(
  landmarks: readonly PoseLandmark[] | null | undefined,
  category: string,
  map: CoverMapInput,
): GarmentBox | null {
  if (!landmarks || landmarks.length < 25) return null;
  const isPants = category === 'pants';
  const a = landmarks[isPants ? POSE.L_HIP : POSE.L_SHOULDER];
  const b = landmarks[isPants ? POSE.R_HIP : POSE.R_SHOULDER];
  if ((a.visibility ?? 0) < MIN_VISIBILITY || (b.visibility ?? 0) < MIN_VISIBILITY) return null;
  const pa = mapCover(a, map);
  const pb = mapCover(b, map);
  const span = Math.hypot(pa.x - pb.x, pa.y - pb.y);
  if (span < 24) return null;
  const fit = FIT[category] ?? FIT.shirts;
  // Hip joints sit inside the body and shoulder joints near its edge, so each gets its own allowance.
  const bodySpan = span * (isPants ? 1.5 : 1.16);
  const width = bodySpan / fit.span;
  const height = width * 1.25;
  const centreX = (pa.x + pb.x) / 2;
  const lineY = (pa.y + pb.y) / 2 - (isPants ? span * 0.2 : 0);
  return { left: centreX - width / 2, top: lineY - height * fit.lineY, width };
}
