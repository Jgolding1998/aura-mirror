import type { MotionFrame } from './fitMotion';

type Sleeve = {
  x: number;
  y: number;
  direction: -1 | 1;
  vertical?: boolean;
  cloth: number;
  outside: number | null;
};

type Bounds = { center: number; shoulderSpan: number; top: number; bottom: number };

export function sleeveEdges(mask: ImageData, frame: MotionFrame, fit: Bounds): Sleeve[] {
  const { width, height } = frame;
  const edges: Sleeve[] = [];
  const top = Math.max(0, Math.floor(fit.top * height));
  const bottom = Math.min(height, Math.ceil(fit.bottom * height));
  const center = Math.max(0, Math.min(width - 1, Math.round(fit.center * width)));
  const awayFromNeck = Math.max(1, Math.round(fit.shoulderSpan * width * 0.40));
  const covered = (x: number, y: number) => {
    const row = Math.floor((y + 0.5) * mask.height / height) * mask.width;
    return mask.data[(row + Math.floor((x + 0.5) * mask.width / width)) * 4 + 3] === 255;
  };
  for (let y = top; y < bottom; y++) {
    for (const direction of [-1, 1] as const) {
      const limit = center + awayFromNeck * direction;
      let x = direction === -1 ? 0 : width - 1;
      while ((x - limit) * direction >= 0 && !covered(x, y)) x -= direction;
      if ((x - limit) * direction < 0 || !covered(x - direction, y) || !covered(x - 2 * direction, y)) continue;
      const outsideX = x + direction * 5;
      const cloth = (y * width + x - 2 * direction) * 4;
      let outside = outsideX >= 0 && outsideX < width ? (y * width + outsideX) * 4 : null;
      if (outside !== null && frame.rgba && (x < 10 || x >= width - 10)
        && colorDistance(frame.rgba, cloth, frame.rgba, outside) < 24) outside = null;
      edges.push({
        x, y, direction, cloth, outside,
      });
    }
  }
  // Treat the bottom as an edge only when the camera crops through the shirt.
  if (bottom >= height - 2 && height > 4) {
    for (let x = 0; x < width; x++) {
      const y = bottom - 1;
      if (!covered(x, y) || !covered(x, y - 1) || !covered(x, y - 2)) continue;
      edges.push({ x, y, direction: 1, vertical: true, cloth: ((y - 2) * width + x) * 4, outside: null });
    }
  }
  return edges;
}

function colorDistance(a: Uint8ClampedArray, i: number, b: Uint8ClampedArray, j: number) {
  return Math.abs(a[i] - b[j]) + Math.abs(a[i + 1] - b[j + 1]) + Math.abs(a[i + 2] - b[j + 2]);
}

export function sleevePatches(
  edges: Sleeve[], reference: MotionFrame, current: MotionFrame, offset: { x: number; y: number },
  draw: (x: number, y: number, width: number, height: number) => void,
) {
  const before = reference.rgba, now = current.rgba;
  if (!before || !now) return;
  const { width, height } = current;
  for (const { x, y, direction, vertical, cloth, outside } of edges) {
    const row = Math.round(y + offset.y);
    const column = Math.round(x + offset.x);
    if (row < 0 || row >= height || column < 0 || column >= width) continue;
    let length = 0;
    for (let step = 1; step <= 4; step++) {
      const dx = vertical ? 0 : direction * step;
      const dy = vertical ? direction * step : 0;
      if (column + dx < 0 || column + dx >= width || row + dy >= height) break;
      const pixel = ((row + dy) * width + column + dx) * 4;
      const distance = colorDistance(before, cloth, now, pixel);
      if (distance > 72 || (outside !== null && distance + 18 >= colorDistance(before, outside, now, pixel))) break;
      length = step;
    }
    if (length === 0) continue;
    if (vertical) draw(column, row, 1, length + 1);
    else draw(column + (direction === -1 ? -length : 0), row, length + 1, 1);
  }
}
