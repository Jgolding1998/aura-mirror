import { test, expect } from '@playwright/test';
import sharp from 'sharp';

async function fixtureImage() {
  const shirt = Buffer.from('<svg width="400" height="500"><rect width="400" height="500" fill="white"/><path d="M100 80L40 130L80 230L120 210V430H280V210L320 230L360 130L300 80L240 110H160Z" fill="#216a78"/></svg>');
  return { name: 'test-garment.png', mimeType: 'image/png', buffer: await sharp(shirt).png().toBuffer() };
}
async function explore(page) {
  await page.goto('/');
  await page.getByTestId('explore-demo').click();
  await expect(page.getByTestId('closet-panel')).toBeVisible();
}
async function command(page, text) {
  await page.getByTestId('command-input').fill(text);
  await page.getByTestId('command-send').click();
}
test.beforeEach(async ({ page }) => {
  // Prevent any real speaker output. The app still executes its playback lifecycle.
  await page.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = utterance => { setTimeout(() => utterance.onend?.(new Event('end') as SpeechSynthesisEvent), 0); };
  });
});
test('loads with devices off and shows selectable sample wardrobe', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__cameraCalls = 0;
    navigator.mediaDevices.getUserMedia = async () => { (window as any).__cameraCalls++; throw new DOMException('Test denied', 'NotAllowedError'); };
  });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await explore(page);
  await expect(page.getByTestId('closet-card-sample-charcoal-tee')).toBeVisible();
  await page.getByTestId('select-item-sample-blue-tee').click();
  await expect(page.getByTestId('garment-overlay')).toHaveAttribute('data-item-id', 'sample-blue-tee');
  expect(await page.evaluate(() => (window as any).__cameraCalls)).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: '../aura-mirror-preview.png', fullPage: true });
});
test('typed wake phrase and closet navigation select the right garment', async ({ page }) => {
  await explore(page);
  await command(page, 'Hey Meta, show my jackets');
  await expect(page.getByTestId('category-jackets')).toHaveAttribute('aria-selected', 'true');
  await command(page, 'try the Royal Blue Graphic Tee');
  await expect(page.getByTestId('assistant-message')).toContainText('Royal Blue Graphic Tee');
  await expect(page.getByTestId('live-fit-status')).toBeVisible();
});
test('adds and edits a photograph, persists after reload, then deletes only the fixture', async ({ page, request }) => {
  await explore(page);
  await page.getByTestId('closet-add').click();
  await page.getByTestId('item-file').setInputFiles(await fixtureImage());
  await expect(page.getByTestId('classify-status')).toContainText('not configured');
  await page.getByTestId('item-name').fill('E2E blue jacket');
  await page.getByTestId('item-category').selectOption('jackets');
  await page.getByTestId('item-color').fill('Blue');
  await page.getByTestId('item-save').click();
  await expect(page.getByTestId('item-dialog')).toBeHidden();
  const items = (await (await request.get('/api/closet')).json()).items;
  const added = items.find(i => i.name === 'E2E blue jacket');
  expect(added).toBeTruthy();
  try {
    await page.reload();
    if (await page.getByTestId('explore-demo').isVisible()) await page.getByTestId('explore-demo').click();
    await page.getByTestId('category-jackets').click();
    await expect(page.getByTestId(`closet-card-${added.id}`)).toBeVisible();
    await page.getByTestId(`edit-item-${added.id}`).click();
    await page.getByTestId('item-name').fill('E2E renamed jacket');
    await page.getByTestId('item-save').click();
    await expect(page.getByTestId(`closet-card-${added.id}`)).toContainText('E2E renamed jacket');
    await page.getByTestId(`delete-item-${added.id}`).click();
    await page.getByRole('button', { name: /delete piece|delete item|delete$/i }).last().click();
    await expect(page.getByTestId(`closet-card-${added.id}`)).toBeHidden();
  } finally { await request.delete(`/api/closet/${added.id}`); }
});
test('camera permission error is actionable and leaves the closet usable', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Test denied', 'NotAllowedError'); };
  });
  await page.goto('/');
  await page.getByTestId('start-camera').click();
  await expect(page.getByText('Camera access is blocked')).toBeVisible();
  await expect(page.getByTestId('closet-panel')).toBeHidden();
  await page.getByTestId('assistant-hud-closet').click();
  await expect(page.getByTestId('closet-panel')).toBeVisible();
});
test('synthetic camera can capture a photo and report unconfigured try-on honestly', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-camera').click();
  await expect(page.locator('video')).toBeVisible();
  await expect.poll(async () => page.locator('video').evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
  await page.getByTestId('assistant-hud-closet').click();
  await page.getByTestId('select-item-sample-charcoal-tee').click();
  await expect(page.getByTestId('garment-overlay')).toBeHidden();
  await page.getByTestId('take-photo').click();
  await expect(page.getByTestId('tryon-photo')).toBeVisible();
  await page.getByTestId('tryon-submit').click();
  await expect(page.getByTestId('tryon-error')).toContainText('not set up');
  await expect(page.getByTestId('tryon-result')).toHaveCount(0);
});
test('mirror opens without the wardrobe and supports the welcome and try-on commands', async ({ page }) => {
  await page.route('**/api/weather', route => route.fulfill({ json: { city: 'Columbia', temperature: 50, conditions: 'clear' } }));
  await page.goto('/');
  await page.getByTestId('start-camera').click();
  await expect(page.getByTestId('app-stage')).toHaveAttribute('data-camera', 'live');
  await expect(page.getByTestId('closet-panel')).toBeHidden();
  await command(page, "Wake up Meta, daddy's home");
  await expect(page.getByTestId('assistant-hud-weather')).toContainText('Columbia');
  await command(page, "Let's try on some close");
  await expect(page.getByTestId('closet-panel')).toBeVisible();
});
test('speech ignores commands before wake and routes commands after Hey Meta', async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition {
      onresult: any = null; onerror: any = null; onend: any = null;
      start() { (window as any).__recognition = this; }
      abort() { this.onend?.(); }
    }
    (window as any).SpeechRecognition = FakeRecognition;
    (window as any).webkitSpeechRecognition = FakeRecognition;
    (window as any).__say = (transcript: string) => {
      (window as any).__recognition?.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript } }] });
    };
  });
  await explore(page);
  await page.getByTestId('voice-toggle').click();
  await expect(page.getByTestId('voice-hud')).toContainText('Asleep');
  await page.evaluate(() => (window as any).__say('show jackets'));
  await expect(page.getByTestId('category-shirts')).toHaveAttribute('aria-selected', 'true');
  await page.evaluate(() => (window as any).__say('Hey Meta, show jackets'));
  await expect(page.getByTestId('category-jackets')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('voice-toggle').click();
  await expect(page.getByTestId('voice-hud')).toContainText('Voice off');
});
test('mobile layout keeps controls within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await explore(page);
  await expect(page.getByTestId('try-item-sample-charcoal-tee')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/aura-mobile.png', fullPage: true });
  await page.getByTestId('try-item-sample-charcoal-tee').click();
  await expect(page.getByTestId('live-fit-status')).toBeVisible();
  await expect(page.getByTestId('tryon-panel')).toBeHidden();
});

test('local hand and pose models initialise against synthetic video and release the camera', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByTestId('start-camera').click();
  await expect(page.getByTestId('app-stage')).toHaveAttribute('data-camera', 'live');
  await page.getByTestId('hand-toggle').click();
  await expect(page.getByTestId('hand-toggle')).toContainText('No hand in view', { timeout: 30_000 });
  await page.getByTestId('hand-toggle').click();
  await expect(page.getByTestId('hand-toggle')).toContainText('Hand off');
  await page.getByTestId('adjust-toggle').click();
  await page.getByTestId('pose-toggle').click();
  await expect(page.getByTestId('overlay-controls')).toContainText('Keep your shoulders or hips visible', { timeout: 30_000 });
  await page.getByTestId('camera-toggle').click();
  await expect(page.getByTestId('app-stage')).toHaveAttribute('data-camera', 'off');
  expect(await page.getByTestId('camera-video').evaluate((v: HTMLVideoElement) => v.srcObject === null)).toBe(true);
});

test('held garment can generate a try-on without saving to the closet', async ({ page, request }) => {
  const before = (await (await request.get('/api/closet')).json()).items.length;
  await page.route('**/api/config', async route => {
    const response = await route.fetch();
    const config = await response.json();
    await route.fulfill({ json: { ...config, tryon: { provider: 'fashn-local', ready: true, cpu: true } } });
  });
  await page.goto('/');
  await page.getByTestId('start-camera').click();
  await expect.poll(async () => page.getByTestId('camera-video').evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
  await command(page, 'Hey Meta, try what I am holding');
  await expect(page.getByTestId('item-dialog')).toBeVisible();
  await expect(page.getByTestId('item-preview').locator('img')).toBeVisible();
  await page.getByTestId('item-category').selectOption('jackets');
  await page.getByTestId('item-preview-only').click();
  await expect(page.getByTestId('assistant-message')).toContainText('Set the shirt down');
  await expect(page.getByTestId('live-fit-status')).toHaveAttribute('data-state', 'searching', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Render a photo' }).click();
  await expect(page.getByTestId('tryon-panel')).toContainText('Set the garment down.');
  await expect(page.getByTestId('garment-overlay')).toBeHidden();
  await expect(page.getByTestId('selected-caption')).toContainText('preview only');
  await page.route('**/api/tryon', async route => {
    const payload = route.request().postDataJSON();
    expect(payload.category).toBe('jackets');
    expect(payload.itemId).toBeUndefined();
    expect(payload.personImageDataUrl).toMatch(/^data:image\//);
    expect(payload.garmentImageDataUrl).toMatch(/^data:image\//);
    await route.fulfill({ json: { imageUrl: payload.garmentImageDataUrl, provider: 'fashn-local', label: 'Test render' } });
  });
  await page.getByRole('button', { name: 'Take photo and try on' }).click();
  await expect(page.getByTestId('tryon-result')).toBeVisible();
  expect((await (await request.get('/api/closet')).json()).items.length).toBe(before);
});
