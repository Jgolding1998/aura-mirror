import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fail } from './images.mjs';
import samples from '../src/lib/sample-photos.json' with { type: 'json' };
export const CATEGORIES = ['shirts', 'pants', 'jackets'];
export function validateItem(input, partial = false) {
  const out = {};
  if (!partial || input.name !== undefined) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100) throw fail(400, 'Name must contain 1–100 characters.');
    out.name = input.name.trim();
  }
  if (!partial || input.category !== undefined) {
    if (!CATEGORIES.includes(input.category)) throw fail(400, 'Choose shirts, pants or jackets.');
    out.category = input.category;
  }
  if (!partial || input.color !== undefined) {
    if (input.color !== undefined && (typeof input.color !== 'string' || input.color.length > 50)) throw fail(400, 'Colour must be 50 characters or fewer.');
    out.color = input.color?.trim() || 'Unspecified';
  }
  return out;
}
export async function createStore(dataDir) {
  await fs.mkdir(path.join(dataDir, 'media'), { recursive: true });
  const file = path.join(dataDir, 'closet.json');
  let items;
  try {
    items = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Array.isArray(items)) throw new Error('Invalid closet database.');
  } catch (e) {
    if (e.code !== 'ENOENT') throw new Error('Closet data could not be read. Preserve .data/closet.json and restore from a backup.', { cause: e });
    items = [];
    await fs.writeFile(file, JSON.stringify(items, null, 2));
  }
  let pending = Promise.resolve();
  const mutate = fn => {
    const result = pending.then(async () => {
      const next = structuredClone(items);
      const result = fn(next);
      const tmp = `${file}.${randomUUID()}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(next, null, 2));
      await fs.rename(tmp, file);
      items = next;
      return result;
    });
    pending = result.catch(() => {});
    return result;
  };
  return {
    list: () => structuredClone([...items.filter(item => item.source !== 'demo'), ...samples]),
    get: id => {
      const item = items.find(x => x.id === id && x.source !== 'demo') ?? samples.find(x => x.id === id);
      if (!item) throw fail(404, 'Closet item not found.');
      return { ...item };
    },
    add: item => mutate(next => { next.push(item); return item; }),
    patch: (id, fields) => mutate(next => { const item = next.find(x => x.id === id); if (!item) throw fail(404, 'Closet item not found.'); Object.assign(item, fields); return item; }),
    remove: id => mutate(next => { const i = next.findIndex(x => x.id === id); if (i < 0) throw fail(404, 'Closet item not found.'); return next.splice(i, 1)[0]; }),
  };
}
