export interface DrapeFit {
  center: number;
  shoulderSpan: number;
  shoulderY: number;
  waistCenter: number;
  top: number;
  bottom: number;
  angle: number;
}

/** Fabric width at the chest, in shoulder spans. Matches the scale prepareShirt's crop was framed for. */
const PATCH_SPANS = 2.15;
/** Cubic chest curvature: the print compresses as it wraps toward the sides. */
const BULGE = 0.12;
/** Extra vertical hang of the fabric at the sides of the torso. */
const DROOP = 0.03;
/** Half width of the side shading. Past the 1.45 span clothing mask limit, and transparent at its end. */
const SHADE_SPANS = 1.5;
const MAX_ROWS = 40;
const ROWS_PER_SHADE = 3;

/** Curves in fabric space as x0, y0, control x, control y, x1, y1, darkness. Never vertical or symmetric. */
const FOLDS: readonly (readonly number[])[] = [
  // Drag lines from the underarms toward the chest.
  [0.19, 0.3, 0.27, 0.39, 0.37, 0.43, 0.13],
  [0.2, 0.39, 0.27, 0.47, 0.34, 0.5, 0.08],
  [0.81, 0.27, 0.74, 0.37, 0.64, 0.41, 0.12],
  [0.8, 0.41, 0.73, 0.46, 0.68, 0.52, 0.07],
  // Soft pull from the shoulders.
  [0.3, 0.07, 0.31, 0.15, 0.39, 0.22, 0.06],
  [0.7, 0.09, 0.66, 0.15, 0.62, 0.2, 0.05],
  // Slack gathering above the waist.
  [0.2, 0.68, 0.34, 0.76, 0.5, 0.73, 0.11],
  [0.82, 0.64, 0.68, 0.74, 0.55, 0.79, 0.1],
  [0.23, 0.81, 0.37, 0.87, 0.53, 0.85, 0.09],
  [0.78, 0.82, 0.68, 0.89, 0.58, 0.9, 0.07],
];

const smooth = (from: number, to: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** Torso width relative to the shoulders, at a distance below them measured in shoulder spans. */
const bodyWidth = (spansDown: number) => (0.95 + 0.05 * smooth(-0.3, 0.05, spansDown))
  * (1 - 0.065 * smooth(0.35, 1.35, spansDown) + 0.03 * smooth(1.35, 2.1, spansDown));

function paintFolds(width: number, height: number) {
  const layer = document.createElement('canvas');
  layer.width = Math.max(16, Math.round(width / 4));
  layer.height = Math.max(16, Math.round(height / 4));
  const context = layer.getContext('2d');
  if (!context) return layer;
  const { width: w, height: h } = layer;
  const SEGMENTS = 12;
  context.lineCap = 'butt';
  const strokeFold = (fold: readonly number[], color: string, shiftY: number, strength: number) => {
    const [x0, y0, cx, cy, x1, y1] = fold;
    const at = (t: number) => {
      const a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
      return [(a * x0 + b * cx + c * x1) * w, (a * y0 + b * cy + c * y1 + shiftY) * h];
    };
    // Stacked widths stand in for a blur, and the bilinear upscale softens them further.
    for (const [spread, weight] of [[3.4, 0.3], [2, 0.4], [1, 0.45]]) {
      for (let i = 0; i < SEGMENTS; i++) {
        const taper = Math.sin(Math.PI * (i + 0.5) / SEGMENTS);
        const [ax, ay] = at(i / SEGMENTS);
        const [bx, by] = at((i + 1) / SEGMENTS);
        context.beginPath();
        context.moveTo(ax, ay);
        context.lineTo(bx, by);
        context.lineWidth = Math.max(0.75, h * 0.016) * spread * (0.5 + 0.5 * taper);
        context.strokeStyle = `rgb(${color} / ${strength * weight * taper})`;
        context.stroke();
      }
    }
  };
  for (const fold of FOLDS) {
    strokeFold(fold, '255 255 255', -0.016, fold[6] * 0.4);
    strokeFold(fold, '0 0 0', 0, fold[6]);
  }
  // Keep the folds off the middle of the chest so a graphic there stays readable.
  context.save();
  context.globalCompositeOperation = 'destination-out';
  context.translate(w * 0.5, h * 0.46);
  context.scale(w * 0.34, h * 0.33);
  const calm = context.createRadialGradient(0, 0, 0, 0, 0, 1);
  calm.addColorStop(0, 'rgb(0 0 0 / 0.7)');
  calm.addColorStop(0.65, 'rgb(0 0 0 / 0.55)');
  calm.addColorStop(1, 'rgb(0 0 0 / 0)');
  context.fillStyle = calm;
  context.fillRect(-1, -1, 2, 2);
  context.restore();
  return layer;
}

/** Warps, lights and mirrors the fabric once. All of this is fixed relative to the cloth. */
function bakeDrape(fabric: HTMLCanvasElement) {
  const { width, height } = fabric;
  const drape = document.createElement('canvas');
  drape.width = width;
  drape.height = height;
  const context = drape.getContext('2d');
  if (!context) return null;
  const sourceX = (x: number) => {
    const u = x / width * 2 - 1;
    return (u + BULGE * u * u * u) / (1 + BULGE) * 0.5 * width + 0.5 * width;
  };
  context.save();
  // The camera output is mirrored by CSS, so the fabric is flipped to read correctly on screen.
  context.translate(width, 0);
  context.scale(-1, 1);
  // Whole-pixel columns that never overlap cannot leave seams.
  const COLUMN = 2;
  for (let x = 0; x < width; x += COLUMN) {
    const next = Math.min(width, x + COLUMN);
    const u = (x + next) / width - 1;
    const left = sourceX(x);
    context.drawImage(fabric, left, 0, Math.max(0.01, sourceX(next) - left),
      height / (1 + DROOP * u * u), x, 0, next - x, height);
  }
  context.restore();
  context.drawImage(paintFolds(width, height), 0, 0, width, height);
  // Dissolve every edge so the fabric melts into the caller's garment base.
  context.globalCompositeOperation = 'destination-in';
  const across = context.createLinearGradient(0, 0, width, 0);
  const down = context.createLinearGradient(0, 0, 0, height);
  for (const [gradient, edge] of [[across, 0.1], [down, 0.07]] as const) {
    gradient.addColorStop(0, 'rgb(0 0 0 / 0)');
    gradient.addColorStop(edge * 0.45, 'rgb(0 0 0 / 0.3)');
    gradient.addColorStop(edge, '#000');
    gradient.addColorStop(1 - edge, '#000');
    gradient.addColorStop(1 - edge * 0.45, 'rgb(0 0 0 / 0.3)');
    gradient.addColorStop(1, 'rgb(0 0 0 / 0)');
  }
  context.fillStyle = across;
  context.fillRect(0, 0, width, height);
  context.fillStyle = down;
  context.fillRect(0, 0, width, height);
  return drape;
}

/** One-row lookup of the broad side lighting across the torso and into the arms. */
function bakeShade() {
  const strip = document.createElement('canvas');
  strip.width = 192;
  strip.height = 1;
  const context = strip.getContext('2d');
  if (!context) return null;
  const gradient = context.createLinearGradient(0, 0, strip.width, 0);
  const stops: readonly (readonly [number, string])[] = [
    [-1.5, '0 0 0 / 0'], [-1.15, '0 0 0 / 0.05'], [-0.8, '0 0 0 / 0.14'], [-0.5, '0 0 0 / 0.07'],
    [-0.3, '255 255 255 / 0'], [-0.1, '255 255 255 / 0.035'], [0.14, '255 255 255 / 0'],
    [0.45, '0 0 0 / 0.06'], [0.8, '0 0 0 / 0.16'], [1.15, '0 0 0 / 0.06'], [1.5, '0 0 0 / 0'],
  ];
  for (const [spans, color] of stops) gradient.addColorStop((spans + SHADE_SPANS) / (2 * SHADE_SPANS), `rgb(${color})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, strip.width, 1);
  return strip;
}

const drapes = new WeakMap<HTMLCanvasElement, HTMLCanvasElement | null>();
let shade: HTMLCanvasElement | null | undefined;
let scratch: HTMLCanvasElement | undefined;
let scratchContext: CanvasRenderingContext2D | null = null;

/**
 * Paints the fabric onto a body-shaped drape over an opaque garment base.
 * The caller clips the result to the clothing mask afterwards. The fabric canvas is
 * baked once, so replace it with a new canvas rather than redrawing it in place.
 */
export function paintDrapedShirt(
  context: CanvasRenderingContext2D, fabric: HTMLCanvasElement, fit: DrapeFit,
  width: number, height: number, offsetX: number, offsetY: number,
): void {
  const span = fit.shoulderSpan * width;
  const usable = [fit.center, fit.shoulderY, fit.waistCenter, fit.top, fit.bottom, fit.angle, offsetX, offsetY]
    .every(Number.isFinite);
  if (!usable || !(span > 1) || !fabric.width || !fabric.height) return;

  let drape = drapes.get(fabric);
  if (drape === undefined) {
    drape = bakeDrape(fabric);
    drapes.set(fabric, drape);
  }
  if (shade === undefined) shade = bakeShade();
  if (!scratch) {
    scratch = document.createElement('canvas');
    scratchContext = scratch.getContext('2d');
  }
  if (!drape || !shade || !scratchContext) return;

  // Anything farther than the diagonal from the shoulders is off screen.
  const reachLimit = Math.hypot(width, height);
  const below = (fit.bottom - fit.shoulderY) * height;
  const leanHeight = Math.max(below, span * 1.25);
  const lean = (fit.waistCenter - fit.center) * width;
  // Anchor the collar at the detected shirt top, even in a close crop.
  const mapped = Math.max((fit.bottom - fit.top) * height, span * 1.25);
  const shoulderV = Math.max(0, Math.min(0.4, (fit.shoulderY - fit.top) * height / mapped));
  const halfWidth = PATCH_SPANS * span / (2 * (1 + BULGE));

  const firstY = Math.floor(Math.max(-reachLimit, (fit.top - fit.shoulderY) * height - span * 0.2));
  const lastY = Math.max(firstY + 1, Math.ceil(Math.min(reachLimit, leanHeight + span * 0.12)));
  const reach = Math.min(reachLimit, SHADE_SPANS * span + Math.abs(lean));
  const usedWidth = Math.ceil(reach * 2) + 2;
  const usedHeight = lastY - firstY;
  if (scratch!.width < usedWidth || scratch!.height < usedHeight) {
    // Grow in steps, because resizing a canvas reallocates it.
    scratch!.width = Math.max(scratch!.width, (usedWidth + 63) & ~63);
    scratch!.height = Math.max(scratch!.height, (usedHeight + 63) & ~63);
  }
  const target = scratchContext;
  target.clearRect(0, 0, usedWidth, usedHeight);
  target.imageSmoothingEnabled = true;
  target.globalAlpha = 1;
  const originX = usedWidth / 2;
  const rowHeight = Math.max(4, Math.ceil(usedHeight / MAX_ROWS));
  const scaleY = fabric.height / mapped;

  const shiftAt = (y: number, spansDown: number) => lean * Math.max(-0.2, Math.min(1.2, y / leanHeight))
    // Cloth hangs a little unevenly below the chest and stays true across the graphic.
    + span * 0.012 * smooth(0.9, 2, spansDown) * Math.sin(spansDown * 3.4 + 0.6);

  // Rows sit on whole pixels with no overlap, so semi-transparent cloth cannot band.
  const fabricTop = Math.max(firstY, Math.ceil(-shoulderV * mapped));
  const fabricBottom = Math.min(lastY, Math.floor((1 - shoulderV) * mapped));
  for (let y = fabricTop; y < fabricBottom; y += rowHeight) {
    const end = Math.min(fabricBottom, y + rowHeight);
    const middle = (y + end) / 2;
    const spansDown = middle / span;
    const half = halfWidth * bodyWidth(spansDown);
    target.drawImage(
      drape, 0, (y / mapped + shoulderV) * fabric.height, fabric.width, (end - y) * scaleY,
      originX + shiftAt(middle, spansDown) - half, y - firstY, half * 2, end - y,
    );
  }

  // The shading reaches past the fabric so it stays continuous over the plain base.
  const shadeRow = rowHeight * ROWS_PER_SHADE;
  for (let y = firstY; y < lastY; y += shadeRow) {
    const end = Math.min(lastY, y + shadeRow);
    const middle = (y + end) / 2;
    const spansDown = middle / span;
    const half = SHADE_SPANS * span * bodyWidth(spansDown);
    // Strongest along the ribs and easing off at both ends, so it never reads as a stripe.
    target.globalAlpha = (0.45 + 0.55 * smooth(-0.1, 0.65, spansDown)) * (1 - 0.3 * smooth(1.2, 2.2, spansDown));
    target.drawImage(shade, originX + shiftAt(middle, spansDown) - half, y - firstY, half * 2, end - y);
  }

  context.save();
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.imageSmoothingEnabled = true;
  context.translate(fit.center * width + offsetX, fit.shoulderY * height + offsetY);
  context.rotate(fit.angle);
  context.drawImage(scratch!, 0, 0, usedWidth, usedHeight, -originX, firstY, usedWidth, usedHeight);
  context.restore();
}
