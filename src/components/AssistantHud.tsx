import { useEffect, useState } from 'react';
import { Mic, MicOff, Shirt, Video, VideoOff } from 'lucide-react';
import './AssistantHud.css';

export interface AssistantHudProps {
  listening: boolean;
  speaking: boolean;
  awake: boolean;
  cameraLive: boolean;
  closetOpen: boolean;
  weather: string | null;
  onToggleListening: () => void;
  onToggleCamera: () => void;
  onOpenCloset: () => void;
}

type VoiceState = 'speaking' | 'listening' | 'standby' | 'muted';

const VOICE_TEXT: Record<VoiceState, string> = {
  speaking: 'Speaking',
  listening: 'Listening',
  standby: 'Standby',
  muted: 'Mic off',
};

function voiceState(listening: boolean, speaking: boolean, awake: boolean): VoiceState {
  if (speaking) return 'speaking';
  if (!listening) return 'muted';
  return awake ? 'listening' : 'standby';
}

function greetingFor(hour: number): string {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function useGreeting(): string {
  const [hour, setHour] = useState(() => new Date().getHours());

  useEffect(() => {
    const timer = window.setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return greetingFor(hour);
}

const TICKS = Array.from({ length: 12 }, (_, index) => index * 30);

function Radar() {
  return (
    <div className="assistant-hud__radar" aria-hidden="true">
      <span className="assistant-hud__sweep" />
      <svg viewBox="0 0 48 48" fill="none">
        <circle className="assistant-hud__ring" cx="24" cy="24" r="22.5" />
        <circle className="assistant-hud__ring assistant-hud__ring--inner" cx="24" cy="24" r="13" />
        {TICKS.map((angle) => (
          <line key={angle} className="assistant-hud__tick" x1="24" y1="1.5" x2="24" y2="4.5" transform={`rotate(${angle} 24 24)`} />
        ))}
      </svg>
      <span className="assistant-hud__core" />
    </div>
  );
}

export function AssistantHud({
  listening,
  speaking,
  awake,
  cameraLive,
  closetOpen,
  weather,
  onToggleListening,
  onToggleCamera,
  onOpenCloset,
}: AssistantHudProps) {
  const greeting = useGreeting();
  const state = voiceState(listening, speaking, awake);

  return (
    <section className="assistant-hud" aria-label="Assistant" data-state={state} data-testid="assistant-hud">
      <div className="assistant-hud__readout">
        <Radar />
        <div className="assistant-hud__text">
          <p className="assistant-hud__greeting">{greeting}</p>
          <p className="assistant-hud__state" role="status" data-testid="assistant-hud-state">
            {VOICE_TEXT[state]}
          </p>
          {weather ? (
            <p className="assistant-hud__weather" title={weather} data-testid="assistant-hud-weather">
              {weather}
            </p>
          ) : null}
        </div>
      </div>

      <div className="assistant-hud__controls" role="group" aria-label="Assistant controls">
        <button
          type="button"
          className="assistant-hud__button"
          onClick={onToggleListening}
          aria-label="Microphone"
          aria-pressed={listening}
          title={listening ? 'Turn microphone off' : 'Turn microphone on'}
          data-testid="assistant-hud-mic"
        >
          {listening ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="assistant-hud__button"
          onClick={onToggleCamera}
          aria-label="Camera"
          aria-pressed={cameraLive}
          title={cameraLive ? 'Turn camera off' : 'Turn camera on'}
          data-testid="assistant-hud-camera"
        >
          {cameraLive ? <Video aria-hidden="true" /> : <VideoOff aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="assistant-hud__button"
          onClick={onOpenCloset}
          aria-label={closetOpen ? 'Close closet' : 'Open closet'}
          aria-expanded={closetOpen}
          title={closetOpen ? 'Close closet' : 'Open closet'}
          data-testid="assistant-hud-closet"
        >
          <Shirt aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
