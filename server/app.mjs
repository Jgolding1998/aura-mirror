import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createStore, validateItem } from './store.mjs';
import { fail, normalizeImage, parseDataUrl } from './images.mjs';
import { publicConfig } from './config.mjs';
import { assistant, classify, speech } from './providers.mjs';
import { requestCpuTryOn } from './tryon-request.mjs';
import { currentWeather } from './weather.mjs';

export async function createApp(c) {
  const store = await createStore(c.dataDir), app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    if (req.headers.origin && !c.origins.includes(req.headers.origin)) return res.status(403).json({ error: 'Origin is not allowed. Configure ALLOWED_ORIGINS explicitly for your device.' });
    if (req.headers.origin) { res.setHeader('Access-Control-Allow-Origin', req.headers.origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use('/api/tryon', express.json({ limit: '34mb' }));
  app.use(express.json({ limit: '18mb' }));
  const limits = new Map();
  app.use('/api', (req, res, next) => {
    if (!['/assistant', '/classify', '/voice', '/tryon', '/transcribe'].includes(req.path) || req.method !== 'POST') return next();
    const key = `${req.ip}:${req.path}`, now = Date.now();
    const entry = limits.get(key) || { count: 0, reset: now + 60_000 };
    if (entry.reset < now) { entry.count = 0; entry.reset = now + 60_000; }
    if (++entry.count > (req.path === '/tryon' ? 5 : 30)) return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
    limits.set(key, entry);
    if (limits.size > 1000) for (const [k, v] of limits) if (v.reset < now) limits.delete(k);
    next();
  });
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.get('/api/config', (req, res) => res.json(publicConfig(c)));
  app.get('/api/weather', async (req, res) => res.json(await currentWeather(c.weather)));
  app.get('/api/wake-music', (req, res, next) => {
    if (!c.wakeMusic || !/\.(?:mp3|wav|ogg|m4a)$/i.test(c.wakeMusic)) return res.sendStatus(404);
    res.sendFile(path.resolve(c.wakeMusic), error => { if (error) next(error); });
  });
  app.get('/api/closet', (req, res) => res.json({ items: store.list() }));
  app.post('/api/closet', async (req, res) => {
    const fields = validateItem(req.body || {}), id = randomUUID();
    const image = await normalizeImage(req.body.imageDataUrl, req.body.removeBackground === true);
    const filename = path.join(c.dataDir, 'media', `${id}.png`);
    await fs.writeFile(filename, image);
    try {
      const item = await store.add({ ...fields, id, imageUrl: `/media/${id}.png`, source: 'camera', createdAt: new Date().toISOString() });
      res.status(201).json({ item });
    } catch (e) { await fs.unlink(filename).catch(() => {}); throw e; }
  });
  app.patch('/api/closet/:id', async (req, res) => res.json({ item: await store.patch(req.params.id, validateItem(req.body || {}, true)) }));
  app.delete('/api/closet/:id', async (req, res) => {
    const item = await store.remove(req.params.id);
    if (/^\/media\/[0-9a-f-]+\.png$/.test(item.imageUrl)) await fs.unlink(path.join(c.dataDir, 'media', path.basename(item.imageUrl))).catch(() => {});
    res.json({ ok: true });
  });
  app.post('/api/classify', async (req, res) => res.json(await classify(c, req.body?.imageDataUrl)));
  app.post('/api/garment-preview', async (req, res) => {
    const image = await normalizeImage(req.body?.imageDataUrl, req.body?.removeBackground === true);
    res.json({ imageDataUrl: `data:image/png;base64,${image.toString('base64')}` });
  });
  app.post('/api/assistant', async (req, res) => {
    const { message, selectedItemId, imageDataUrl } = req.body || {};
    if (typeof message !== 'string' || !message.trim() || message.length > 2000) throw fail(400, 'Message must contain 1–2000 characters.');
    res.json(await assistant(c, message, selectedItemId ? store.get(selectedItemId) : null, imageDataUrl));
  });
  app.post('/api/voice', async (req, res) => {
    const { text } = req.body || {};
    if (typeof text !== 'string' || !text.trim() || text.length > 1500) throw fail(400, 'Speech text must contain 1–1500 characters.');
    const result = await speech(c, text);
    res.type(result.contentType).send(result.audio);
  });
  app.post('/api/tryon', async (req, res) => {
    if (!c.tryonUrl) throw fail(503, 'Generated try-on needs a FASHN service. See docs/SETUP.md for local CPU and GPU setup.');
    const { itemId, garmentImageDataUrl, category: previewCategory } = req.body ?? {};
    const item = itemId ? store.get(itemId) : null;
    const category = item?.category ?? previewCategory;
    if (!['shirts', 'pants', 'jackets'].includes(category)) throw fail(400, 'Select a garment category first.');
    const person = await normalizeImage(req.body.personImageDataUrl);
    const garment = item
      ? await fs.readFile(path.join(item.source === 'sample' ? path.join(c.root, 'public', 'demo') : path.join(c.dataDir, 'media'), path.basename(item.imageUrl)))
      : await normalizeImage(garmentImageDataUrl);
    let response;
    try {
      const request = c.tryonCpu ? requestCpuTryOn : fetch;
      response = await request(`${c.tryonUrl.replace(/\/$/, '')}/tryon`, {
        method: 'POST', signal: AbortSignal.timeout(c.tryonCpu ? 900_000 : 180_000),
        headers: { 'Content-Type': 'application/json', ...(c.tryonToken ? { Authorization: `Bearer ${c.tryonToken}` } : {}) },
        body: JSON.stringify({ person: person.toString('base64'), garment: garment.toString('base64'), category: category === 'pants' ? 'bottoms' : 'tops' }),
      });
    } catch (error) {
      if (error.name === 'TimeoutError') throw fail(504, 'The try-on took too long. Try again after the worker finishes.');
      throw fail(503, 'Aura could not reach the try-on service.');
    }
    if (response.status === 429) throw fail(429, 'The try-on service is still working on another image.');
    if (!response.ok) throw fail(502, `Try-on service returned HTTP ${response.status}. Check the try-on service logs.`);
    const result = await response.json();
    const image = await normalizeImage(`data:image/png;base64,${result.imageBase64}`);
    const name = `tryon-${randomUUID()}.png`;
    await fs.writeFile(path.join(c.dataDir, 'media', name), image);
    res.json({ imageUrl: `/media/${name}`, provider: 'fashn-local', label: 'AI-generated try-on — appearance and fit are approximate' });
  });
  app.post('/api/transcribe', async (req, res) => {
    if (!c.whisperUrl) throw fail(503, 'Whisper is not configured. Enable browser voice or set WHISPER_URL to whisper.cpp /inference.');
    const { bytes, mime } = parseDataUrl(req.body?.audioDataUrl, 'audio');
    const form = new FormData();
    const extensions = { 'audio/webm': 'webm', 'audio/wav': 'wav', 'audio/wave': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' };
    form.append('file', new Blob([bytes], { type: mime }), `recording.${extensions[mime] || 'wav'}`);
    form.append('response_format', 'json'); form.append('language', 'en');
    const response = await fetch(c.whisperUrl, { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw fail(502, `Whisper returned HTTP ${response.status}.`);
    const result = await response.json();
    res.json({ text: String(result.text || '').trim(), provider: 'whisper' });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use('/media', express.static(path.join(c.dataDir, 'media'), { dotfiles: 'deny', setHeaders: res => res.setHeader('Cache-Control', 'private, max-age=3600') }));
  app.use('/demo', express.static(path.join(c.root, 'public', 'demo')));
  app.use('/models', express.static(path.join(c.root, 'public', 'models')));
  app.use(express.static(path.join(c.root, 'dist')));
  app.get('/{*path}', (req, res, next) => res.sendFile(path.join(c.root, 'dist', 'index.html'), err => err && next(err)));
  app.use((err, req, res, next) => {
    const status = err.status || (err.name === 'TimeoutError' ? 504 : 500);
    // Do not log upstream bodies or headers: they could contain keys or private imagery.
    if (status >= 500) console.error(`[aura] ${req.method} ${req.path}: ${err.name}`);
    res.status(status).json({ error: status === 500 ? 'The server could not complete this request. Check the local server console.' : err.message });
  });
  return app;
}
