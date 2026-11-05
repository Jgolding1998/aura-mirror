import type { PoseLandmark } from './overlay';

const FACE = 3;
const CLOTHING = 4;

export function prepareShirt(image: HTMLImageElement) {
  const texture = document.createElement('canvas');
  const scale = Math.min(1, 384 / Math.max(image.naturalWidth, image.naturalHeight));
  texture.width = Math.max(1, Math.round(image.naturalWidth * scale));
  texture.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = texture.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Shirt texture could not be prepared.');
  const { width, height } = texture;
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const background = [0, width - 1, (height - 1) * width, width * height - 1];
  const nearCorner = (offset: number) => background.some(index => {
    const corner = 4 * index;
    return data[corner + 3] > 240 && Math.abs(data[corner] - data[offset])
      + Math.abs(data[corner + 1] - data[offset + 1]) + Math.abs(data[corner + 2] - data[offset + 2]) < 50;
  });
  const transparent = background.some(index => data[index * 4 + 3] < 24);
  let left = width, right = 0, top = height, bottom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3] < 120 || (!transparent && nearCorner(offset))) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right - left < width * 0.2 || bottom - top < height * 0.2) {
    left = 0; right = width; top = 0; bottom = height;
  }
  const boxWidth = right - left;
  const boxHeight = bottom - top;
  const sw = Math.max(1, Math.round(boxWidth * 0.54));
  const sh = Math.max(1, Math.round(boxHeight * 0.74));
  const sx = Math.floor((left + right - sw) / 2);
  const sy = Math.floor(top + boxHeight * 0.21);
  const pixels = context.getImageData(sx, sy, sw, sh).data;
  const channels = [[], [], []] as number[][];
  for (let i = 0; i < pixels.length; i += 16) {
    if (pixels[i + 3] < 220) continue;
    for (let channel = 0; channel < 3; channel++) channels[channel].push(pixels[i + channel]);
  }
  const rgb = channels.map(values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 48);
  const fabric = document.createElement('canvas');
  const wing = Math.max(1, Math.round(sw * 0.4));
  const collar = Math.max(1, Math.round(sh * 0.25));
  fabric.width = sw + wing * 2;
  fabric.height = sh + collar;
  const fabricContext = fabric.getContext('2d');
  if (!fabricContext) throw new Error('Shirt texture could not be prepared.');
  const color = `rgb(${rgb.join(',')})`;
  fabricContext.fillStyle = color;
  fabricContext.fillRect(0, 0, fabric.width, fabric.height);
  fabricContext.drawImage(texture, sx, sy, sw, sh, wing, collar, sw, sh);
  const strip = Math.max(1, Math.round(sw * 0.16));
  fabricContext.save();
  fabricContext.translate(fabric.width, 0);
  fabricContext.scale(-1, 1);
  fabricContext.drawImage(texture, sx, sy, strip, sh, sw + wing, collar, wing, sh);
  fabricContext.drawImage(texture, sx + sw - strip, sy, strip, sh, 0, collar, wing, sh);
  fabricContext.restore();
  // Carry the fabric into the shoulder area above the chest graphic.
  const shoulders = document.createElement('canvas');
  const seam = Math.max(1, Math.round(sh * 0.08));
  shoulders.width = fabric.width;
  shoulders.height = collar + seam;
  const shoulderContext = shoulders.getContext('2d');
  if (!shoulderContext) throw new Error('Shirt texture could not be prepared.');
  shoulderContext.drawImage(fabric, 0, collar + Math.floor(sh * 0.62), fabric.width,
    Math.max(1, Math.floor(sh * 0.22)), 0, 0, shoulders.width, shoulders.height);
  const blend = shoulderContext.createLinearGradient(0, collar, 0, shoulders.height);
  blend.addColorStop(0, '#000');
  blend.addColorStop(1, 'transparent');
  shoulderContext.globalCompositeOperation = 'destination-in';
  shoulderContext.fillStyle = blend;
  shoulderContext.fillRect(0, 0, shoulders.width, shoulders.height);
  fabricContext.drawImage(shoulders, 0, 0);
  return { fabric, color };
}

export function paintShirtMask(
  labels: Uint8Array, mask: ImageData, pose: readonly PoseLandmark[] | undefined, aspect: number,
) {
  const { width, height, data } = mask;
  let faceLeft = width, faceRight = 0, faceBottom = 0;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== FACE) continue;
    const x = i % width;
    faceLeft = Math.min(faceLeft, x);
    faceRight = Math.max(faceRight, x);
    faceBottom = Math.floor(i / width);
  }
  const leftShoulder = pose?.[11], rightShoulder = pose?.[12];
  const hasShoulders = leftShoulder && rightShoulder
    && Math.min(leftShoulder.visibility ?? 0, rightShoulder.visibility ?? 0) > 0.38;
  const faceWidth = (faceRight - faceLeft) / width;
  if (!hasShoulders && faceWidth <= 0.015) return null;
  const center = hasShoulders ? (leftShoulder.x + rightShoulder.x) / 2 : (faceLeft + faceRight) / (2 * width);
  const shoulderSpan = hasShoulders ? Math.abs(leftShoulder.x - rightShoulder.x) : 2.3 * faceWidth;
  const shoulderY = hasShoulders ? (leftShoulder.y + rightShoulder.y) / 2 : faceBottom / height + 0.22 * faceWidth * aspect;
  const hipA = pose?.[23], hipB = pose?.[24];
  const hips = hipA && hipB && Math.min(hipA.visibility ?? 0, hipB.visibility ?? 0) > 0.55
    ? (hipA.y + hipB.y) / 2 : undefined;
  const top = Math.max(0, Math.floor((shoulderY - Math.max(0.10, shoulderSpan * aspect * 0.36)) * height));
  const bottom = Math.min(height - 1, Math.ceil((hips ?? shoulderY + shoulderSpan * aspect * 1.2) * height));
  // A close seated frame can crop through the sleeve, so leave room beyond the shoulders.
  const left = Math.max(0, Math.floor((center - shoulderSpan * 1.45) * width));
  const right = Math.min(width - 1, Math.ceil((center + shoulderSpan * 1.45) * width));
  let pixels = 0, shirtTop = height, shirtBottom = 0;
  data.fill(0);
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const index = y * width + x;
      const label = labels[index];
      const clothEdge = label === 0 && x > left && x < right && y > top && y < bottom
        && (labels[index - 1] === CLOTHING || labels[index + 1] === CLOTHING
          || labels[index - width] === CLOTHING || labels[index + width] === CLOTHING);
      if (label !== CLOTHING && !clothEdge) continue;
      data[index * 4 + 3] = 255;
      pixels++;
      shirtTop = Math.min(shirtTop, y);
      shirtBottom = y;
    }
  }
  if (pixels < width * height * 0.007) return null;
  const angle = hasShoulders ? Math.atan2(
    (rightShoulder.y - leftShoulder.y) * Math.sign(rightShoulder.x - leftShoulder.x),
    shoulderSpan * aspect,
  ) : 0;
  const waistCenter = hips !== undefined && hipA && hipB ? (hipA.x + hipB.x) / 2 : center;
  const neckline: { x: number; y: number }[] = [];
  for (let step = -6; step <= 6; step++) {
    const x = Math.round((center + step * shoulderSpan * 0.045) * width);
    if (x < left || x > right) continue;
    const end = Math.min(shirtBottom, Math.round((shoulderY + 0.2 * shoulderSpan * aspect) * height));
    for (let y = Math.max(top, faceBottom); y <= end; y++) {
      const index = y * width + x;
      if (labels[index] !== CLOTHING) continue;
      if (labels[index - width] === 2 || labels[index - width] === FACE) neckline.push({ x: x / width, y: y / height });
      break;
    }
  }
  return {
    center, shoulderSpan, shoulderY, waistCenter, top: shirtTop / height, bottom: (shirtBottom + 1) / height,
    angle, neckline,
  };
}
