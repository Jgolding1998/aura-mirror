import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const testData = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-e2e-'));
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 30_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5178', channel: 'chrome', headless: true, trace: 'retain-on-failure', launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
  webServer: [
    { command: 'node server/index.mjs', url: 'http://127.0.0.1:8877/api/health', reuseExistingServer: false, timeout: 30_000, env: { DATA_DIR: testData, PORT: '8877', ALLOWED_ORIGINS: 'http://127.0.0.1:5178', START_LOCAL_VOICE: 'false', START_LOCAL_TRYON: 'false', AURA_WAKE_MUSIC: '', LOCAL_TTS_URL: '', ELEVENLABS_API_KEY: '', MODEL_API_KEY: '', META_API_KEY: '', TRYON_SERVICE_URL: '', CAMERA_STREAM_URL: '', WHISPER_URL: '' } },
    { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1', url: 'http://127.0.0.1:5178', reuseExistingServer: false, timeout: 30_000, env: { AURA_API_PORT: '8877', AURA_WEB_PORT: '5178' } },
  ],
  globalTeardown: './tests/e2e/teardown.ts',
});
