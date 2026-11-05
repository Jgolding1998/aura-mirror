import { CATEGORIES } from '../types';
import type {
  AppConfig,
  AssistantReply,
  Category,
  ClassifyResult,
  ClosetItem,
  ItemPatch,
  NewClosetItem,
  TryOnResult,
} from '../types';

export type ApiErrorKind = 'network' | 'timeout' | 'aborted' | 'http' | 'format';

/** The one error type the client raises. Requests are never retried automatically. */
export class ApiError extends Error {
  kind: ApiErrorKind;
  status: number | null;

  constructor(kind: ApiErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }

  /** The service exists but its provider has not been set up. */
  get notConfigured(): boolean {
    return this.status === 503;
  }
}

export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const { method = 'GET', body, timeoutMs = 15000, signal } = options;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: combined,
    });
  } catch (error) {
    if (signal?.aborted) throw new ApiError('aborted', 'Request cancelled.');
    if (timeout.aborted) throw new ApiError('timeout', 'The local server took too long to answer.');
    void error;
    throw new ApiError('network', 'Could not reach the local Aura server.');
  }
  if (!response.ok) {
    let message = `The server answered with status ${response.status}.`;
    try {
      const data: unknown = await response.json();
      if (isRecord(data) && typeof data.error === 'string' && data.error) message = data.error;
    } catch {
      // Non-JSON error bodies (a proxy failure, for instance) keep the generic message.
      if (response.status >= 500 && response.status !== 503) {
        message = 'The local Aura server is not answering properly. Is it running?';
      }
    }
    throw new ApiError('http', message, response.status);
  }
  return response;
}

async function json<T>(path: string, options: RequestOptions, parse: (data: unknown) => T): Promise<T> {
  const response = await send(path, options);
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError('format', 'The server sent something other than JSON. Is the API running?');
  }
  return parse(data);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function bad(what: string): ApiError {
  return new ApiError('format', `The server sent an unexpected ${what} response.`);
}

function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function parseClosetItem(value: unknown): ClosetItem {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.imageUrl !== 'string' || !isCategory(value.category)) {
    throw bad('closet item');
  }
  return {
    id: value.id,
    name: str(value.name, 'Untitled piece'),
    category: value.category,
    color: str(value.color),
    imageUrl: value.imageUrl,
    createdAt: str(value.createdAt),
    source: value.source === 'sample' ? 'sample' : 'camera',
  };
}

function parseConfig(value: unknown): AppConfig {
  if (!isRecord(value)) throw bad('config');
  const { vision, voice, tryon, camera, speech, gestures } = value;
  if (!isRecord(vision) || !isRecord(voice) || !isRecord(tryon) || !isRecord(camera) || !isRecord(speech) || !isRecord(gestures)) {
    throw bad('config');
  }
  return {
    vision: { provider: vision.provider === 'meta' ? 'meta' : 'local', ready: vision.ready === true },
    welcomeMusic: value.welcomeMusic === true,
    voice: {
      provider: voice.provider === 'elevenlabs' || voice.provider === 'kokoro' ? voice.provider : 'browser',
      ready: voice.ready === true,
      voiceId: typeof voice.voiceId === 'string' ? voice.voiceId : undefined,
    },
    tryon: { provider: tryon.provider === 'fashn-local' ? 'fashn-local' : 'overlay', ready: tryon.ready === true, cpu: tryon.cpu === true },
    camera: {
      source: camera.source === 'stream' ? 'stream' : 'browser',
      streamUrl: typeof camera.streamUrl === 'string' ? camera.streamUrl : undefined,
    },
    speech: { provider: speech.provider === 'whisper' ? 'whisper' : 'browser', ready: speech.ready === true },
    gestures: {
      modelUrl: str(gestures.modelUrl),
      wasmPath: str(gestures.wasmPath),
      poseModelUrl: typeof gestures.poseModelUrl === 'string' ? gestures.poseModelUrl : undefined,
    },
  };
}

export const api = {
  config: () => json('/api/config', {}, parseConfig),

  listCloset: () =>
    json('/api/closet', {}, (data) => {
      if (!isRecord(data) || !Array.isArray(data.items)) throw bad('closet');
      return data.items.map(parseClosetItem);
    }),

  addItem: (item: NewClosetItem) =>
    json('/api/closet', { method: 'POST', body: item, timeoutMs: 60000 }, (data) => {
      if (!isRecord(data)) throw bad('closet');
      return parseClosetItem(data.item);
    }),

  updateItem: (id: string, patch: ItemPatch) =>
    json(`/api/closet/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }, (data) => {
      if (!isRecord(data)) throw bad('closet');
      return parseClosetItem(data.item);
    }),

  deleteItem: async (id: string): Promise<void> => {
    await send(`/api/closet/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  classify: (imageDataUrl: string, signal?: AbortSignal): Promise<ClassifyResult> =>
    json('/api/classify', { method: 'POST', body: { imageDataUrl }, timeoutMs: 45000, signal }, (data) => {
      if (!isRecord(data) || !isCategory(data.category)) throw bad('classify');
      return {
        name: str(data.name),
        category: data.category,
        color: str(data.color),
        provider: data.provider === 'meta' ? 'meta' : 'manual',
        message: typeof data.message === 'string' ? data.message : undefined,
      };
    }),

  assistant: (
    body: { message: string; selectedItemId?: string; imageDataUrl?: string },
    signal?: AbortSignal,
  ): Promise<AssistantReply> =>
    json('/api/assistant', { method: 'POST', body, timeoutMs: 45000, signal }, (data) => {
      if (!isRecord(data) || typeof data.text !== 'string') throw bad('assistant');
      return { text: data.text, provider: data.provider === 'meta' ? 'meta' : 'local' };
    }),

  /** Returns audio, or throws ApiError (503 when ElevenLabs is not configured). */
  voice: async (text: string, signal?: AbortSignal): Promise<Blob> => {
    const response = await send('/api/voice', { method: 'POST', body: { text }, timeoutMs: 30000, signal });
    const type = response.headers.get('content-type') ?? '';
    if (!type.startsWith('audio/')) throw bad('voice');
    return response.blob();
  },

  previewGarment: (imageDataUrl: string, removeBackground: boolean) =>
    json('/api/garment-preview', { method: 'POST', body: { imageDataUrl, removeBackground } }, (data) => {
      if (!isRecord(data) || typeof data.imageDataUrl !== 'string') throw bad('garment preview');
      return data.imageDataUrl;
    }),

  tryOn: (body: { personImageDataUrl: string } & ({ itemId: string } | { garmentImageDataUrl: string; category: string }), signal?: AbortSignal, cpu = false): Promise<TryOnResult> =>
    json('/api/tryon', { method: 'POST', body, timeoutMs: cpu ? 930000 : 240000, signal }, (data) => {
      if (!isRecord(data) || typeof data.imageUrl !== 'string') throw bad('try-on');
      return { imageUrl: data.imageUrl, provider: 'fashn-local', label: str(data.label, 'Generated try-on') };
    }),
};
