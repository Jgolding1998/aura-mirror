import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function readConfig(env = process.env) {
  const port = Number(env.PORT || 8787);
  return {
    root: ROOT, dataDir: path.resolve(env.DATA_DIR || path.join(ROOT, '.data')),
    port, host: env.HOST || '127.0.0.1',
    metaKey: env.MODEL_API_KEY || env.META_API_KEY || '',
    metaUrl: env.META_BASE_URL || 'https://api.meta.ai/v1',
    metaModel: env.META_MODEL || 'muse-spark-1.3',
    elevenKey: env.ELEVENLABS_API_KEY || '',
    elevenVoice: env.ELEVENLABS_VOICE_ID || '6WwXjDDEMyNmFG95zycZ',
    elevenModel: env.ELEVENLABS_MODEL || 'eleven_flash_v2_5',
    localTtsUrl: env.LOCAL_TTS_URL || '', localVoiceId: env.KOKORO_VOICE || 'bm_george', startLocalVoice: env.START_LOCAL_VOICE === 'true', python: env.PYTHON || 'python',
    tryonUrl: env.TRYON_SERVICE_URL || '', tryonToken: env.TRYON_SERVICE_TOKEN || '',
    tryonCpu: env.FASHN_DEVICE === 'cpu',
    whisperUrl: env.WHISPER_URL || '',
    cameraStream: env.CAMERA_STREAM_URL || '',
    weather: { city: env.AURA_WEATHER_CITY || '', lat: env.AURA_WEATHER_LAT || '', lon: env.AURA_WEATHER_LON || '' },
    wakeMusic: env.AURA_WAKE_MUSIC || '',
    origins: (env.ALLOWED_ORIGINS || `http://localhost:5173,http://127.0.0.1:5173,http://localhost:${port},http://127.0.0.1:${port}`).split(',').map(x => x.trim()),
  };
}
export function publicConfig(c) {
  return {
    vision: { provider: c.metaKey ? 'meta' : 'local', ready: !!c.metaKey },
    voice: { provider: c.localTtsUrl ? 'kokoro' : c.elevenKey ? 'elevenlabs' : 'browser', ready: !!(c.localTtsUrl || c.elevenKey), voiceId: c.localTtsUrl ? c.localVoiceId : c.elevenVoice },
    tryon: { provider: c.tryonUrl ? 'fashn-local' : 'overlay', ready: !!c.tryonUrl, cpu: c.tryonCpu },
    speech: { provider: c.whisperUrl ? 'whisper' : 'browser', ready: !!c.whisperUrl },
    camera: { source: c.cameraStream ? 'stream' : 'browser', ...(c.cameraStream ? { streamUrl: c.cameraStream } : {}) },
    welcomeMusic: !!c.wakeMusic,
    gestures: { modelUrl: '/models/hand_landmarker.task', poseModelUrl: '/models/pose_landmarker_lite.task', wasmPath: '/models/wasm' },
  };
}
