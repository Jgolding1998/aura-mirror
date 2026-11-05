export interface MotionFrame {
  pixels: Uint8Array;
  rgba?: Uint8ClampedArray;
  width: number;
  height: number;
}

type Point = { x: number; y: number };

export function readMotionFrame(context: CanvasRenderingContext2D): MotionFrame {
  const { width, height } = context.canvas;
  const rgba = context.getImageData(0, 0, width, height).data;
  const pixels = new Uint8Array(width * height);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = (rgba[4 * i] + 2 * rgba[4 * i + 1] + rgba[4 * i + 2]) >> 2;
  }
  return { pixels, rgba, width, height };
}

const PATCH = 3;
const SEARCH = 9;
const SEARCH_WIDTH = SEARCH * 2 + 1;
const MOVE_PENALTY = Float32Array.from({ length: SEARCH_WIDTH ** 2 }, (_, index) =>
  Math.hypot(index % SEARCH_WIDTH - SEARCH, Math.floor(index / SEARCH_WIDTH) - SEARCH) * 5);

export function motionAnchors(frame: MotionFrame, positions: Point[]): Point[] {
  const { width, height, pixels } = frame;
  return positions.flatMap(position => {
    const middleX = Math.round(position.x * width);
    const middleY = Math.round(position.y * height);
    let best: Point | undefined;
    let bestContrast = 6;
    for (let y = middleY - 5; y <= middleY + 5; y += 5) {
      for (let x = middleX - 5; x <= middleX + 5; x += 5) {
        const margin = SEARCH + PATCH + 1;
        if (x < margin || x >= width - margin || y < margin || y >= height - margin) continue;
        let contrast = 0;
        for (let row = -PATCH; row <= PATCH; row++) {
          for (let col = -PATCH; col <= PATCH; col++) {
            const i = (y + row) * width + x + col;
            contrast += Math.abs(pixels[i] - pixels[i + 1]) + Math.abs(pixels[i] - pixels[i + width]);
          }
        }
        contrast /= (2 * PATCH + 1) ** 2;
        if (contrast <= bestContrast) continue;
        bestContrast = contrast;
        best = { x, y };
      }
    }
    return best ? [best] : [];
  });
}

export function trackMotion(reference: MotionFrame, current: MotionFrame, anchors: Point[]): Point | null {
  if (reference.width !== current.width || reference.height !== current.height) return null;
  const { width, pixels } = reference;
  const matches: Point[] = [];
  for (const anchor of anchors) {
    let best = { x: 0, y: 0 };
    let error = Infinity;
    for (let dy = -SEARCH; dy <= SEARCH; dy++) {
      for (let dx = -SEARCH; dx <= SEARCH; dx++) {
        let score = MOVE_PENALTY[(dy + SEARCH) * SEARCH_WIDTH + dx + SEARCH];
        for (let row = -PATCH; row <= PATCH && score < error; row++) {
          const start = (anchor.y + row) * width + anchor.x - PATCH;
          const shifted = start + dy * width + dx;
          for (let col = 0; col <= PATCH * 2; col++) {
            score += Math.abs(pixels[start + col] - current.pixels[shifted + col]);
          }
        }
        if (score >= error) continue;
        error = score;
        best = { x: dx, y: dy };
      }
    }
    if (error < 580 && Math.max(Math.abs(best.x), Math.abs(best.y)) < SEARCH) matches.push(best);
  }
  if (!matches.length) return null;
  const median = (values: number[]) => {
    values.sort((a, b) => a - b);
    return (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2;
  };
  return { x: median(matches.map(match => match.x)), y: median(matches.map(match => match.y)) };
}
