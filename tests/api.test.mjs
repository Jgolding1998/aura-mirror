import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../server/app.mjs';
import { readConfig, publicConfig } from '../server/config.mjs';
import { createStore } from '../server/store.mjs';
import { normalizeImage } from '../server/images.mjs';

let app, server, base, dataDir, imageDataUrl, config;
before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-api-test-'));
  config = readConfig({ DATA_DIR: dataDir });
  app = await createApp(config);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  imageDataUrl = `data:image/png;base64,${(await sharp({ create: { width: 20, height: 20, channels: 4, background: '#222255' } }).png().toBuffer()).toString('base64')}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  await fs.rm(dataDir, { recursive: true, force: true });
});
async function req(route, method = 'GET', body, headers = {}) {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
test('reports accurate provider availability without leaking keys', async () => {
  const result = await req('/api/config');
  assert.equal(result.status, 200);
  assert.equal(result.body.vision.provider, 'local');
  assert.equal(result.body.tryon.ready, false);
  const publicValue = JSON.stringify(publicConfig(readConfig({ MODEL_API_KEY: 'secret-meta-value', ELEVENLABS_API_KEY: 'secret-voice-value', TRYON_SERVICE_TOKEN: 'secret-token' })));
  assert.equal(publicValue.includes('secret-'), false);
});
test('persists an uploaded garment and its image through reopening the store', async () => {
  const added = await req('/api/closet', 'POST', { name: 'Test trousers', category: 'pants', color: 'Navy', imageDataUrl });
  assert.equal(added.status, 201);
  assert.equal(added.body.item.category, 'pants');
  const savedImage = await fetch(base + added.body.item.imageUrl);
  assert.equal(savedImage.headers.get('content-type'), 'image/png');
  assert.equal((await sharp(Buffer.from(await savedImage.arrayBuffer())).metadata()).width, 20);
  const reopened = await createStore(dataDir);
  assert.ok(reopened.list().some(i => i.id === added.body.item.id));
  await req(`/api/closet/${added.body.item.id}`, 'DELETE');
});
test('concurrent wardrobe additions do not lose updates', async () => {
  const added = await Promise.all(Array.from({ length: 6 }, (_, i) => req('/api/closet', 'POST', { name: `Concurrent ${i}`, category: 'shirts', imageDataUrl })));
  assert.ok(added.every(x => x.status === 201));
  const list = (await req('/api/closet')).body.items;
  for (const result of added) assert.ok(list.some(x => x.id === result.body.item.id));
  await Promise.all(added.map(x => req(`/api/closet/${x.body.item.id}`, 'DELETE')));
});
test('rejects invalid images and categories before modifying closet', async () => {
  const count = (await req('/api/closet')).body.items.length;
  assert.equal((await req('/api/closet', 'POST', { name: 'Wrong', category: 'shoes', imageDataUrl })).status, 400);
  assert.equal((await req('/api/closet', 'POST', { name: 'Wrong', category: 'shirts', imageDataUrl: 'data:image/png;base64,SGVsbG8=' })).status, 400);
  assert.equal((await req('/api/closet', 'POST', { name: 'Wrong', category: 'shirts', imageDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' })).status, 400);
  assert.equal((await req('/api/closet')).body.items.length, count);
});
test('manual classification is explicitly disclosed without claiming AI', async () => {
  const result = await req('/api/classify', 'POST', { imageDataUrl });
  assert.equal(result.status, 200);
  assert.equal(result.body.provider, 'manual');
  assert.match(result.body.message, /not configured/);
});
test('unconfigured AI services return an actionable error, never a fake result', async () => {
  for (const [route, body] of [
    ['/api/tryon', { personImageDataUrl: imageDataUrl, itemId: 'demo-shirt-1' }],
    ['/api/voice', { text: 'Good morning.' }],
    ['/api/transcribe', { audioDataUrl: 'data:audio/wav;base64,SGVsbG8=' }],
  ]) {
    const result = await req(route, 'POST', body);
    assert.equal(result.status, 503);
    assert.ok(result.body.error.length > 15);
    assert.equal(result.body.imageUrl, undefined);
  }
});
test('local assistant does not claim to see the user', async () => {
  const result = await req('/api/assistant', 'POST', { message: 'How do I look?', selectedItemId: 'sample-charcoal-tee' });
  assert.equal(result.body.provider, 'local');
  assert.match(result.body.text, /can't assess/);
});
test('rejects unexpected browser origins and nonexistent items', async () => {
  assert.equal((await req('/api/closet', 'GET', undefined, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await req('/api/closet/missing', 'PATCH', { name: 'No' })).status, 404);
  assert.equal((await req('/api/closet/missing', 'DELETE')).status, 404);
});
test('plain-background removal clears connected border and preserves contrasting garment', async () => {
  const image = await sharp({ create: { width: 40, height: 40, channels: 4, background: '#ffffff' } })
    .composite([{ input: await sharp({ create: { width: 20, height: 20, channels: 4, background: '#000055' } }).png().toBuffer(), top: 10, left: 10 }]).png().toBuffer();
  const result = await normalizeImage(`data:image/png;base64,${image.toString('base64')}`, true);
  const pixels = await sharp(result).raw().toBuffer();
  assert.equal(pixels[3], 0);
  assert.equal(pixels[(20 * 40 + 20) * 4 + 3], 255);
});
test('corrupt existing database fails rather than resetting the user closet', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-corrupt-'));
  try {
    await fs.writeFile(path.join(dir, 'closet.json'), '{broken');
    await assert.rejects(createStore(dir), /restore from a backup/);
    assert.equal(await fs.readFile(path.join(dir, 'closet.json'), 'utf8'), '{broken');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
