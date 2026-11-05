import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWake, parseCommand } from '../src/lib/commands.ts';
import { mapCover, pinchRatio, stepPinch, INITIAL_PINCH, rangeValueAt } from '../src/lib/gesture.ts';
import { garmentBoxFromPose } from '../src/lib/overlay.ts';
import { motionAnchors, trackMotion } from '../src/lib/fitMotion.ts';
import { paintShirtMask } from '../src/lib/liveFit.ts';
import { sleeveEdges, sleevePatches } from '../src/lib/sleeveCoverage.ts';

test('wake phrase preserves the following command and does not wake on unrelated words', () => {
  const result = parseWake('Hey Meta, let me see what is in my closet');
  assert.equal(result.woke, true);
  assert.deepEqual(parseCommand(result.rest), { type: 'open-closet' });
  assert.equal(parseWake('That metallic shirt is nice').woke, false);
  assert.equal(parseWake('hey metamorphosis').woke, false);
});
test('closet commands distinguish navigation, holding a garment and broader advice', () => {
  assert.deepEqual(parseCommand('show my trousers'), { type: 'category', category: 'pants' });
  assert.deepEqual(parseCommand('let me see my jackets'), { type: 'category', category: 'jackets' });
  assert.deepEqual(parseCommand('I want to try this on'), { type: 'select' });
  assert.deepEqual(parseCommand('add this to my closet'), { type: 'add-to-closet' });
  assert.deepEqual(parseCommand('how do I look in this'), { type: 'look' });
  assert.deepEqual(parseCommand('generate a try-on'), { type: 'generate-tryon' });
  assert.equal(parseCommand('what should I wear next week to a wedding'), null);
});
test('mirrored pointer mapping compensates for cover crop and viewport offsets', () => {
  const input = { sourceWidth: 1920, sourceHeight: 1080, viewWidth: 1000, viewHeight: 1000, viewLeft: 10, viewTop: 20, mirrored: true };
  assert.deepEqual(mapCover({ x: 0.5, y: 0.5 }, input), { x: 510, y: 520 });
  assert.ok(mapCover({ x: 0.25, y: 0.5 }, input).x > 510);
  assert.ok(mapCover({ x: 0.25, y: 0.5 }, { ...input, mirrored: false }).x < 510);
});
test('pinch emits once after a hold, requires release and ignores low confidence', () => {
  const frame = (state, ratio, now, confidence = 0.99) => stepPinch(state, { ratio, now, confidence });
  const armed = frame(INITIAL_PINCH, 0.1, 10);
  assert.equal(armed.clicked, false);
  const clicked = frame(armed.state, 0.1, 90);
  assert.equal(clicked.clicked, true);
  assert.equal(frame(clicked.state, 0.1, 900).clicked, false);
  const open = frame(clicked.state, 0.8, 1000);
  const again = frame(open.state, 0.1, 1100);
  assert.equal(frame(again.state, 0.1, 1200).clicked, true);
  assert.equal(frame(INITIAL_PINCH, 0.1, 10, 0.1).pinching, false);
  assert.equal(pinchRatio(null), null);
});
test('pose anchor requires visible body landmarks and maps to a finite garment box', () => {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  points[11] = { x: 0.35, y: 0.3, visibility: 0.9 }; points[12] = { x: 0.65, y: 0.3, visibility: 0.9 };
  const view = { sourceWidth: 1280, sourceHeight: 720, viewWidth: 1280, viewHeight: 720 };
  const box = garmentBoxFromPose(points, 'shirts', view);
  assert.ok(box && box.width > 100 && Number.isFinite(box.left));
  points[11].visibility = 0.1;
  assert.equal(garmentBoxFromPose(points, 'shirts', view), null);
  assert.equal(garmentBoxFromPose([], 'shirts', view), null);
  assert.equal(rangeValueAt(50, 0, 100, 0, 1, 0.1), 0.5);
});

test('live fitting tracks movement between masks and rejects a lost subject', () => {
  const width = 64, height = 64;
  let seed = 19;
  const pixels = Uint8Array.from({ length: width * height }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 24;
  });
  const shifted = new Uint8Array(pixels.length);
  for (let y = 3; y < height; y++) {
    for (let x = 0; x < width - 5; x++) shifted[(y - 3) * width + x + 5] = pixels[y * width + x];
  }
  const original = { width, height, pixels };
  const anchors = motionAnchors(original, [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }]);
  assert.deepEqual(trackMotion(original, { width, height, pixels: shifted }, anchors), { x: 5, y: -3 });
  assert.equal(trackMotion(original, { width, height, pixels: new Uint8Array(pixels.length) }, anchors), null);
});

test('live shirt coverage is opaque and preserves a hand in front of the shirt', () => {
  const width = 50, height = 50;
  const labels = new Uint8Array(width * height);
  for (let y = 8; y < 19; y++) labels.fill(3, y * width + 20, y * width + 30);
  for (let y = 21; y < 47; y++) labels.fill(4, y * width + 9, y * width + 41);
  labels[29 * width + 24] = 2;
  const data = new Uint8ClampedArray(width * height * 4);
  assert.ok(paintShirtMask(labels, { width, height, data }, undefined, 1));
  const alpha = (x, y) => data[(y * width + x) * 4 + 3];
  assert.equal(alpha(25, 33), 255);
  assert.equal(alpha(24, 29), 0);
  assert.equal(alpha(25, 15), 0);
  assert.equal(alpha(5, 30), 0);
});

test('sleeve cleanup covers matching fabric and stops where a hand or background begins', () => {
  const width = 24, height = 20;
  const data = new Uint8ClampedArray(width * height * 4);
  const rgba = new Uint8ClampedArray(data.length);
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const covered = x >= 7 && x <= 16 && y >= 10;
      if (covered) data[i + 3] = 255;
      rgba.set(covered ? [235, 230, 224, 255] : [120, 122, 126, 255], i);
    }
  }
  const current = rgba.slice();
  current.set([232, 230, 223, 255], (14 * width + 6) * 4);
  current.set([177, 133, 110, 255], (14 * width + 5) * 4);
  current.set([180, 133, 110, 255], (14 * width + 17) * 4);
  const reference = { width, height, pixels, rgba };
  const edges = sleeveEdges({ width, height, data }, reference, { center: 0.5, shoulderSpan: 0.4, top: 0.5, bottom: 1 });
  const patches = [];
  sleevePatches(edges, reference, { ...reference, rgba: current }, { x: 0, y: 0 },
    (left, row, columns) => patches.push({ left, row, columns }));
  assert.deepEqual(patches, [{ left: 6, row: 14, columns: 2 }]);
});
