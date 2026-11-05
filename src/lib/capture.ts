export type MediaEl = HTMLVideoElement | HTMLImageElement;

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

export class CaptureError extends Error {
  code: 'not-ready' | 'cors' | 'unsupported' | 'too-large' | 'type' | 'read';

  constructor(code: CaptureError['code'], message: string) {
    super(message);
    this.name = 'CaptureError';
    this.code = code;
  }
}

export function mediaSize(el: MediaEl | null): { width: number; height: number } {
  if (!el) return { width: 0, height: 0 };
  if (el instanceof HTMLVideoElement) return { width: el.videoWidth, height: el.videoHeight };
  return { width: el.naturalWidth, height: el.naturalHeight };
}

function exportCanvas(canvas: HTMLCanvasElement, type: string, quality: number): string {
  try {
    return canvas.toDataURL(type, quality);
  } catch {
    throw new CaptureError(
      'cors',
      'This camera stream can be viewed but not captured: the Pi stream must send an Access-Control-Allow-Origin header for this site.',
    );
  }
}

export function photoBounds(width: number, height: number, upperBody: boolean) {
  const cropWidth = upperBody ? Math.min(width, height) : width;
  return { left: Math.floor((width - cropWidth) / 2), width: cropWidth, height };
}

/** The unflipped camera frame, as the server should see it. */
export function captureFrame(el: MediaEl | null, maxSide = 1600, upperBody = false): string {
  const { width, height } = mediaSize(el);
  if (!el || !width || !height) throw new CaptureError('not-ready', 'The camera has no picture yet.');
  const crop = photoBounds(width, height, upperBody);
  const scale = Math.min(1, maxSide / Math.max(crop.width, crop.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(crop.width * scale);
  canvas.height = Math.round(crop.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new CaptureError('unsupported', 'This browser could not create a capture canvas.');
  context.drawImage(el, crop.left, 0, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return exportCanvas(canvas, 'image/jpeg', 0.92);
}

/** Centre crop for a garment held up close; keeps the room out of the preview. */
export function captureGarmentFrame(el: MediaEl | null): string {
  const { width, height } = mediaSize(el);
  if (!el || !width || !height) throw new CaptureError('not-ready', 'The camera has no picture yet.');
  const size = Math.floor(Math.min(width * 0.72, height * 0.88));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(1200, size);
  const context = canvas.getContext('2d');
  if (!context) throw new CaptureError('unsupported', 'This browser could not create a capture canvas.');
  context.drawImage(el, (width - size) / 2, (height - size) / 2, size, size, 0, 0, canvas.width, canvas.height);
  return exportCanvas(canvas, 'image/jpeg', 0.92);
}

/**
 * The view as it appears on screen: flipped, cover-cropped, with the Live
 * overlay drawn at its exact on-screen rectangle.
 */
export function composeMirrorPhoto(
  el: MediaEl | null,
  mirrored: boolean,
  overlay: { image: HTMLImageElement; rect: DOMRect; opacity: number } | null,
): string {
  const { width, height } = mediaSize(el);
  if (!el || !width || !height) throw new CaptureError('not-ready', 'The camera has no picture yet.');
  const box = el.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
  const context = canvas.getContext('2d');
  if (!context) throw new CaptureError('unsupported', 'This browser could not create a capture canvas.');
  context.scale(dpr, dpr);

  const scale = Math.max(box.width / width, box.height / height);
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  context.save();
  if (mirrored) {
    context.translate(box.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(el, (box.width - drawnWidth) / 2, (box.height - drawnHeight) / 2, drawnWidth, drawnHeight);
  context.restore();

  if (overlay) {
    const { image, rect, opacity } = overlay;
    // The image uses object-fit: contain inside its box.
    const naturalWidth = image.naturalWidth || rect.width;
    const naturalHeight = image.naturalHeight || rect.height;
    const fit = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
    const w = naturalWidth * fit;
    const h = naturalHeight * fit;
    context.globalAlpha = opacity;
    try {
      context.drawImage(image, rect.left - box.left + (rect.width - w) / 2, rect.top - box.top + (rect.height - h) / 2, w, h);
    } catch {
      // A broken garment image should not lose the photo itself.
    }
    context.globalAlpha = 1;
  }
  return exportCanvas(canvas, 'image/jpeg', 0.92);
}

/** Reads a user-chosen file, enforcing the API's type and size limits before anything is sent. */
export function readImageFile(file: File): Promise<string> {
  if (!ACCEPTED.includes(file.type)) {
    return Promise.reject(new CaptureError('type', 'Please choose a PNG, JPEG or WebP image.'));
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return Promise.reject(new CaptureError('too-large', 'That image is over the 12 MB limit.'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new CaptureError('read', 'That file could not be read.'));
    reader.readAsDataURL(file);
  });
}
