import { spawn } from 'node:child_process';
import path from 'node:path';

export async function startLocalTryOn(config) {
  if (process.env.START_LOCAL_TRYON !== 'true' || !config.tryonUrl) return null;
  const endpoint = new URL(config.tryonUrl);
  if (!['127.0.0.1', 'localhost'].includes(endpoint.hostname)) {
    throw new Error('START_LOCAL_TRYON requires a loopback TRYON_SERVICE_URL.');
  }

  // A manually started Aura worker can be reused across app restarts.
  try {
    const response = await fetch(new URL('/health', endpoint), { signal: AbortSignal.timeout(1500) });
    if (response.ok && (await response.json()).provider === 'fashn-vton-1.5') return null;
  } catch {
    // No worker is listening yet.
  }

  const child = spawn(config.python, [
    '-u', '-m', 'uvicorn', 'service:app', '--host', '127.0.0.1', '--port', endpoint.port || '8793',
  ], {
    cwd: path.join(config.root, 'tryon'),
    windowsHide: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      PYTHONPATH: process.env.FASHN_PYTHONPATH || process.env.PYTHONPATH,
      HF_HOME: process.env.FASHN_CACHE_DIR || process.env.HF_HOME,
      HF_HUB_OFFLINE: config.tryonCpu ? '1' : process.env.HF_HUB_OFFLINE,
    },
  });
  child.on('error', error => console.error('[aura] Could not start local try-on:', error.message));
  child.on('exit', code => { if (code) console.error('[aura] Local try-on worker exited.'); });
  const stop = () => { if (!child.killed) child.kill(); };
  process.once('exit', stop);
  return { stop };
}
