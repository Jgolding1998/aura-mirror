import { spawn } from 'node:child_process';
import path from 'node:path';

// Optional child process, only enabled by START_LOCAL_VOICE=true in .env.
export function startLocalVoice(c) {
  if (!c.startLocalVoice || !c.localTtsUrl) return null;
  const url = new URL(c.localTtsUrl);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('START_LOCAL_VOICE requires a loopback LOCAL_TTS_URL.');
  const child = spawn(c.python, [path.join(c.root, 'voice', 'service.py'), '--port', url.port || '8791'], {
    cwd: c.root, windowsHide: true,
    env: { ...process.env, PYTHONUNBUFFERED: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', b => process.stdout.write(b));
  child.stderr.on('data', b => process.stderr.write(b));
  child.on('error', () => console.error('[aura] Local voice did not start. Check PYTHON and voice setup.'));
  child.on('exit', code => { if (code) console.error('[aura] Local voice exited; browser voice fallback is available.'); });
  const stop = () => { if (!child.killed) child.kill(); };
  process.once('exit', stop);
  return { child, stop };
}
