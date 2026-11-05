export const CATEGORIES = ['shirts', 'pants', 'jackets'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  shirts: 'Shirts',
  pants: 'Pants',
  jackets: 'Jackets',
};

export interface ClosetItem {
  id: string;
  name: string;
  category: Category;
  color: string;
  imageUrl: string;
  createdAt: string;
  source: 'sample' | 'camera' | 'preview';
}

export interface AppConfig {
  welcomeMusic?: boolean;
  vision: { provider: 'local' | 'meta'; ready: boolean };
  voice: { provider: 'browser' | 'elevenlabs' | 'kokoro'; ready: boolean; voiceId?: string };
  tryon: { provider: 'overlay' | 'fashn-local'; ready: boolean; cpu?: boolean };
  camera: { source: 'browser' | 'stream'; streamUrl?: string };
  speech: { provider: 'browser' | 'whisper'; ready: boolean };
  gestures: { modelUrl: string; wasmPath: string; poseModelUrl?: string };
}

export interface ClassifyResult {
  name: string;
  category: Category;
  color: string;
  provider: 'manual' | 'meta';
  message?: string;
}

export interface AssistantReply {
  text: string;
  provider: 'local' | 'meta';
}

export interface TryOnResult {
  imageUrl: string;
  provider: 'fashn-local';
  label: string;
}

export interface NewClosetItem {
  name: string;
  category: Category;
  color?: string;
  imageDataUrl: string;
  removeBackground?: boolean;
}

export interface ItemPatch {
  name?: string;
  category?: Category;
  color?: string;
}

export interface OverlaySettings {
  visible: boolean;
  opacity: number; // 0.2 - 1
  scale: number; // 0.5 - 1.8
  offsetX: number; // percent of stage width
  offsetY: number; // percent of stage height
}

export const DEFAULT_OVERLAY: OverlaySettings = {
  visible: true,
  opacity: 0.9,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};
