import { RotateCcw } from 'lucide-react';
import { DEFAULT_OVERLAY } from '../types';
import type { OverlaySettings } from '../types';
import type { PoseStatus } from '../hooks/usePoseAnchor';

interface Props {
  live: boolean;
  settings: OverlaySettings;
  onChange: (settings: OverlaySettings) => void;
  anchorsOn: boolean;
  poseStatus: PoseStatus;
  poseError: string | null;
  onToggleAnchors: () => void;
}

const POSE_TEXT: Record<PoseStatus, string> = {
  off: 'Overlay off',
  loading: 'Loading the body model',
  searching: 'Keep your shoulders or hips visible',
  tracking: 'Following your shoulders or hips',
  error: 'Body tracking unavailable',
};

interface SliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

function Tape({ id, label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <div className="tape">
      <label htmlFor={`overlay-${id}`}>{label}</label>
      <output htmlFor={`overlay-${id}`}>{format(value)}</output>
      <input
        id={`overlay-${id}`}
        data-testid={`overlay-${id}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

const signed = (value: number) => `${value > 0 ? '+' : ''}${value}`;

export function OverlayControls({ live, settings, onChange, anchorsOn, poseStatus, poseError, onToggleAnchors }: Props) {
  const set = (patch: Partial<OverlaySettings>) => onChange({ ...settings, ...patch });

  return (
    <section className="adjust" aria-label="Live overlay controls" data-testid="overlay-controls">
      <header className="adjust__head">
        <h2>Live overlay</h2>
        <label className="switch">
          <input type="checkbox" checked={settings.visible} onChange={(event) => set({ visible: event.target.checked })} data-testid="overlay-visible" />
          <span>Show</span>
        </label>
      </header>

      <Tape id="opacity" label="Opacity" value={Math.round(settings.opacity * 100)} min={20} max={100} step={1} format={(v) => `${v}%`} onChange={(v) => set({ opacity: v / 100 })} />
      <Tape id="scale" label="Size" value={Math.round(settings.scale * 100)} min={50} max={180} step={1} format={(v) => `${v}%`} onChange={(v) => set({ scale: v / 100 })} />
      <Tape id="x" label="Left and right" value={settings.offsetX} min={-40} max={40} step={1} format={signed} onChange={(v) => set({ offsetX: v })} />
      <Tape id="y" label="Up and down" value={settings.offsetY} min={-40} max={40} step={1} format={signed} onChange={(v) => set({ offsetY: v })} />

      <div className="adjust__row">
        <button type="button" className="text-button" onClick={onToggleAnchors} aria-pressed={anchorsOn} disabled={!live} data-testid="pose-toggle">
          {anchorsOn ? 'Turn off tracking' : 'Follow my body'}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => onChange({ ...DEFAULT_OVERLAY, visible: settings.visible })}
          data-testid="overlay-reset"
        >
          <RotateCcw aria-hidden="true" />
          Reset
        </button>
      </div>

      <p className="adjust__note" role="status">
        {poseError ?? (anchorsOn ? POSE_TEXT[poseStatus] : 'Optional live preview for your own garment photos. Use Try on for a fitted photo.')}
      </p>
    </section>
  );
}
