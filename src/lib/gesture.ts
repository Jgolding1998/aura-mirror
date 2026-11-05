/**
 * Pure gesture maths. No DOM, no MediaPipe, no imports, so this file can be
 * unit-tested directly (Node 22.18+ strips the types when importing .ts).
 */

export interface Point2 {
  x: number;
  y: number;
}

export interface CoverMapInput {
  /** Intrinsic size of the camera frame. */
  sourceWidth: number;
  sourceHeight: number;
  /** On-screen box of the media element, which uses object-fit: cover. */
  viewWidth: number;
  viewHeight: number;
  viewLeft?: number;
  viewTop?: number;
  /** True when the element is displayed flipped, as a mirror is. */
  mirrored?: boolean;
}

/**
 * Maps a normalised landmark (0-1 in the raw camera frame) to screen pixels,
 * for a media element shown with object-fit: cover and an optional mirror flip.
 * Points in the cropped-off part of the frame land outside the view box.
 */
export function mapCover(point: Point2, input: CoverMapInput): Point2 {
  const { sourceWidth, sourceHeight, viewWidth, viewHeight, viewLeft = 0, viewTop = 0, mirrored = true } = input;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { x: viewLeft + viewWidth / 2, y: viewTop + viewHeight / 2 };
  }
  const scale = Math.max(viewWidth / sourceWidth, viewHeight / sourceHeight);
  const drawnWidth = sourceWidth * scale;
  const drawnHeight = sourceHeight * scale;
  const offsetX = (viewWidth - drawnWidth) / 2;
  const offsetY = (viewHeight - drawnHeight) / 2;
  const nx = mirrored ? 1 - point.x : point.x;
  return {
    x: viewLeft + offsetX + nx * drawnWidth,
    y: viewTop + offsetY + point.y * drawnHeight,
  };
}

/** Indexes used from MediaPipe's 21-point hand model. */
export const HAND = { WRIST: 0, THUMB_TIP: 4, INDEX_TIP: 8, MIDDLE_MCP: 9 } as const;

/**
 * Thumb-to-index gap divided by palm length, so the same pinch reads the same
 * near to or far from the camera. Lower means more closed. Returns null when
 * landmarks are missing or the palm has no measurable length.
 * `aspect` is sourceWidth / sourceHeight: landmarks are normalised per axis.
 */
export function pinchRatio(landmarks: readonly Point2[] | null | undefined, aspect = 1): number | null {
  if (!landmarks || landmarks.length < 21) return null;
  const distance = (a: Point2, b: Point2) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const palm = distance(landmarks[HAND.WRIST], landmarks[HAND.MIDDLE_MCP]);
  if (palm < 1e-4) return null;
  return distance(landmarks[HAND.THUMB_TIP], landmarks[HAND.INDEX_TIP]) / palm;
}

export interface PinchConfig {
  /** Ratio below which fingers count as pinched. */
  closeBelow: number;
  /** Ratio above which fingers count as released. Larger than closeBelow, so a hovering pinch does not chatter. */
  openAbove: number;
  /** Minimum hand confidence. Below it the hand is treated as absent. */
  minConfidence: number;
  /** How long a pinch must hold before it clicks. */
  holdMs: number;
  /** Minimum time between two clicks. */
  cooldownMs: number;
}

export const DEFAULT_PINCH: PinchConfig = {
  closeBelow: 0.3,
  openAbove: 0.48,
  minConfidence: 0.6,
  holdMs: 70,
  cooldownMs: 450,
};

export interface PinchState {
  phase: 'open' | 'arming' | 'closed';
  armedAt: number;
  lastClickAt: number;
}

export const INITIAL_PINCH: PinchState = { phase: 'open', armedAt: 0, lastClickAt: Number.NEGATIVE_INFINITY };

export interface PinchFrame {
  /** From pinchRatio, or null when there is no hand. */
  ratio: number | null;
  confidence: number;
  now: number;
}

export interface PinchStep {
  state: PinchState;
  /** True on the one frame a click should fire. */
  clicked: boolean;
  /** True while the fingers are held closed, for cursor feedback. */
  pinching: boolean;
}

/**
 * Advances the pinch state machine by one frame. A click fires once per pinch,
 * after holdMs, and the fingers must open past openAbove before another can.
 * A pinch completed inside the cooldown is swallowed instead of queued.
 */
export function stepPinch(state: PinchState, frame: PinchFrame, config: PinchConfig = DEFAULT_PINCH): PinchStep {
  const { ratio, confidence, now } = frame;

  if (ratio === null || confidence < config.minConfidence) {
    return { state: { ...state, phase: 'open' }, clicked: false, pinching: false };
  }

  switch (state.phase) {
    case 'open':
      if (ratio < config.closeBelow) {
        return { state: { ...state, phase: 'arming', armedAt: now }, clicked: false, pinching: true };
      }
      return { state, clicked: false, pinching: false };

    case 'arming':
      if (ratio > config.openAbove) {
        return { state: { ...state, phase: 'open' }, clicked: false, pinching: false };
      }
      if (now - state.armedAt >= config.holdMs) {
        const canClick = now - state.lastClickAt >= config.cooldownMs;
        return {
          state: { ...state, phase: 'closed', lastClickAt: canClick ? now : state.lastClickAt },
          clicked: canClick,
          pinching: true,
        };
      }
      return { state, clicked: false, pinching: true };

    case 'closed':
      if (ratio > config.openAbove) {
        return { state: { ...state, phase: 'open' }, clicked: false, pinching: false };
      }
      return { state, clicked: false, pinching: true };
  }
}

/** Exponential smoothing for the cursor. alpha 1 follows exactly; lower is steadier. */
export function smoothPoint(previous: Point2 | null, next: Point2, alpha = 0.45): Point2 {
  if (!previous) return next;
  return {
    x: previous.x + (next.x - previous.x) * alpha,
    y: previous.y + (next.y - previous.y) * alpha,
  };
}

/** Value for a range input from a screen x position across its track. */
export function rangeValueAt(x: number, left: number, width: number, min: number, max: number, step = 1): number {
  if (width <= 0) return min;
  const ratio = Math.min(1, Math.max(0, (x - left) / width));
  const raw = min + ratio * (max - min);
  const snapped = Math.round(raw / step) * step;
  return Math.min(max, Math.max(min, snapped));
}
