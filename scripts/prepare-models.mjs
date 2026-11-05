import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public', 'models');
await fs.mkdir(path.join(dir, 'wasm'), { recursive: true });
await fs.mkdir(path.join(dir, 'licenses'), { recursive: true });
const licenseUrl = 'https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE';
const licensePath = path.join(dir, 'licenses', 'mediapipe-LICENSE.txt');
try { await fs.access(licensePath); } catch {
  const response = await fetch(licenseUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`MediaPipe license download failed: ${response.status}`);
  await fs.writeFile(licensePath, await response.text());
}
const source = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const file = path.join(dir, 'hand_landmarker.task');
try { await fs.access(file); } catch {
  const result = await fetch(source, { signal: AbortSignal.timeout(120_000) });
  if (!result.ok) throw new Error(`Hand model download failed: ${result.status}`);
  const data = Buffer.from(await result.arrayBuffer());
  if (data.length < 1_000_000) throw new Error('Unexpected hand model download.');
  await fs.writeFile(file, data);
}
const wasmDir = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const manifest = [];
for (const name of await fs.readdir(wasmDir)) {
  if (!/\.(?:js|wasm)$/.test(name)) continue;
  await fs.copyFile(path.join(wasmDir, name), path.join(dir, 'wasm', name));
  manifest.push({ file: `wasm/${name}`, sha256: createHash('sha256').update(await fs.readFile(path.join(dir, 'wasm', name))).digest('hex'), source: '@mediapipe/tasks-vision 0.10.32' });
}
manifest.push({ file: 'hand_landmarker.task', sha256: createHash('sha256').update(await fs.readFile(file)).digest('hex'), source });
const poseSource = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const poseFile = path.join(dir, 'pose_landmarker_lite.task');
try { await fs.access(poseFile); } catch {
  const result = await fetch(poseSource, { signal: AbortSignal.timeout(120_000) });
  if (!result.ok) throw new Error(`Pose model download failed: ${result.status}`);
  const data = Buffer.from(await result.arrayBuffer());
  if (data.length < 1_000_000) throw new Error('Unexpected pose model download.');
  await fs.writeFile(poseFile, data);
}
manifest.push({ file: 'pose_landmarker_lite.task', sha256: createHash('sha256').update(await fs.readFile(poseFile)).digest('hex'), source: poseSource });
const clothingSource = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite';
const clothingFile = path.join(dir, 'selfie_multiclass.tflite');
const clothingHash = 'c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0';
const digest = data => createHash('sha256').update(data).digest('hex');
const existing = await fs.readFile(clothingFile).catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return null;
});
if (!existing || digest(existing) !== clothingHash) {
  const response = await fetch(clothingSource, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Clothing segmentation model download failed: ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (digest(data) !== clothingHash) throw new Error('Unexpected clothing segmentation model checksum.');
  await fs.writeFile(clothingFile, data);
}
manifest.push({ file: 'selfie_multiclass.tflite', sha256: clothingHash, source: clothingSource });
await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Hand, pose and clothing models plus WASM bundled locally.');
