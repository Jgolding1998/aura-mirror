import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readConfig } from '../server/config.mjs';
import { createApp } from '../server/app.mjs';

test('configured Meta vision and FASHN adapters send expected contracts and save results', async () => {
  const pixel = (await sharp({ create: { width: 32, height: 48, channels: 3, background: '#555588' } }).png().toBuffer()).toString('base64');
  const requests = [];
  const mock = http.createServer(async (req, res) => {
    let input = ''; for await (const chunk of req) input += chunk;
    const body = JSON.parse(input);
    requests.push({ path: req.url, authorization: req.headers.authorization, body });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url === '/tryon' ? { imageBase64: pixel } : { choices: [{ message: { content: '{"name":"Navy chinos","category":"pants","color":"Navy"}' } }] }));
  }).listen(0, '127.0.0.1');
  await new Promise(r => mock.once('listening', r));
  const mockUrl = `http://127.0.0.1:${mock.address().port}`;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-provider-test-'));
  const c = { ...readConfig({ DATA_DIR: dataDir }), metaKey: 'test-not-real', metaUrl: mockUrl, tryonUrl: mockUrl, tryonToken: 'local-test-token' };
  const app = await createApp(c), server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (route, body) => { const r = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  try {
    const imageDataUrl = `data:image/png;base64,${pixel}`;
    const classified = await post('/api/classify', { imageDataUrl });
    assert.equal(classified.body.provider, 'meta');
    assert.equal(classified.body.category, 'pants');
    const meta = requests[0];
    assert.equal(meta.path, '/chat/completions');
    assert.equal(meta.authorization, 'Bearer test-not-real');
    assert.equal(meta.body.model, 'muse-spark-1.3');
    assert.equal(meta.body.messages[1].content[1].type, 'image_url');
    const added = await post('/api/closet', { name: 'Real photo', category: 'pants', imageDataUrl });
    const result = await post('/api/tryon', { personImageDataUrl: imageDataUrl, itemId: added.body.item.id });
    assert.equal(result.status, 200);
    assert.equal(result.body.provider, 'fashn-local');
    const tryon = requests.find(x => x.path === '/tryon');
    assert.equal(tryon.authorization, 'Bearer local-test-token');
    assert.equal(tryon.body.category, 'bottoms');
    assert.ok(tryon.body.person.length > 10 && tryon.body.garment.length > 10);
    assert.equal((await fetch(base + result.body.imageUrl)).status, 200);
    c.tryonCpu = true;
    const preview = await post('/api/tryon', { personImageDataUrl: imageDataUrl, garmentImageDataUrl: imageDataUrl, category: 'shirts' });
    assert.equal(preview.status, 200);
    assert.equal(requests.at(-1).body.category, 'tops');
    const sample = await post('/api/tryon', { personImageDataUrl: imageDataUrl, itemId: 'sample-charcoal-tee' });
    assert.equal(sample.status, 200);
    assert.equal((await sharp(Buffer.from(requests.at(-1).body.garment, 'base64')).metadata()).format, 'jpeg');
    assert.equal((await post('/api/tryon', { personImageDataUrl: imageDataUrl, itemId: 'demo-shirt-1' })).status, 404);
  } finally {
    await Promise.all([new Promise(r => mock.close(r)), new Promise(r => server.close(r))]);
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
