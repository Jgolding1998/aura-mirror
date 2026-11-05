import sharp from 'sharp';
export function fail(status, message) { return Object.assign(new Error(message), { status }); }
export function parseDataUrl(value, kind = 'image') {
  const pattern = kind === 'audio'
    ? /^data:(audio\/(?:webm|wav|wave|mpeg|mp4|ogg|x-wav))(?:;codecs=[\w,.-]+)?;base64,([A-Za-z0-9+/=]+)$/
    : /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;
  const m = typeof value === 'string' && value.match(pattern);
  if (!m) throw fail(400, `Provide a valid ${kind} data URL (${kind === 'image' ? 'PNG, JPEG or WebP' : 'WAV, WebM, MP3, MP4 or OGG'}).`);
  const bytes = Buffer.from(m[2], 'base64');
  if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw fail(413, `${kind} must be between 1 byte and 12 MB.`);
  return { bytes, mime: m[1] };
}
// Edge-connected colour removal, deliberately conservative. It is not semantic AI segmentation.
export async function normalizeImage(value, removeBackground = false) {
  const { bytes } = parseDataUrl(value);
  let pipeline;
  try {
    pipeline = sharp(bytes, { limitInputPixels: 24_000_000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).ensureAlpha();
    if (!removeBackground) return await pipeline.png().toBuffer();
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    const samples = [0, w - 1, (h - 1) * w, h * w - 1].map(i => [...data.subarray(i * 4, i * 4 + 3)]);
    const background = [0, 1, 2].map(c => samples.reduce((s, p) => s + p[c], 0) / 4);
    const seen = new Uint8Array(w * h), queue = new Int32Array(w * h);
    let head = 0, tail = 0;
    const visit = i => {
      if (seen[i]) return;
      seen[i] = 1;
      const d = Math.hypot(...background.map((c, j) => data[i * 4 + j] - c));
      if (d < 65 || data[i * 4 + 3] < 15) { data[i * 4 + 3] = 0; queue[tail++] = i; }
    };
    for (let x = 0; x < w; x++) { visit(x); visit((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { visit(y * w); visit(y * w + w - 1); }
    while (head < tail) {
      const i = queue[head++], x = i % w, y = Math.floor(i / w);
      if (x) visit(i - 1); if (x < w - 1) visit(i + 1);
      if (y) visit(i - w); if (y < h - 1) visit(i + w);
    }
    if (tail > w * h * 0.985) return await pipeline.png().toBuffer();
    return await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  } catch (e) {
    if (e.status) throw e;
    throw fail(400, 'This image cannot be decoded. Try a smaller PNG, JPEG or WebP.');
  }
}
