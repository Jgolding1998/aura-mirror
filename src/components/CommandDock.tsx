import { useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import { Aperture, ArrowUp, Mic, MicOff, Shirt, SlidersHorizontal, SquarePlus } from 'lucide-react';
import type { VoiceState } from '../hooks/useVoice';
import { AWAKE_TIMEOUT_MS } from '../hooks/useVoice';

export interface DockMessage {
  id: number;
  heard?: string;
  text: string;
  source?: string;
}

interface Props {
  message: DockMessage;
  thinking: boolean;
  voiceState: VoiceState;
  speaking: boolean;
  interim: string;
  awakeTick: number;
  outputLabel: string;
  inputRef: RefObject<HTMLInputElement | null>;
  hideTryOn: boolean;
  liveTryOn: boolean;
  onSubmit: (text: string) => void;
  onToggleVoice: () => void;
  onPhoto: () => void;
  onAdd: () => void;
  onTryOn: () => void;
  onStopTryOn: () => void;
  onRenderPhoto: () => void;
  onAdjust: () => void;
  adjustOpen: boolean;
}

function hudText(state: VoiceState, speaking: boolean, output: string): string {
  if (speaking) return output;
  switch (state) {
    case 'off':
      return 'Voice off. Typing always works';
    case 'asleep':
      return 'Asleep. Say "Hey Meta"';
    case 'awake':
      return 'Awake, listening';
    case 'error':
      return 'Voice unavailable. Typing still works';
  }
}

export function CommandDock(props: Props) {
  const { message, thinking, voiceState, speaking, interim, awakeTick, outputLabel, inputRef, hideTryOn, liveTryOn, onSubmit, onToggleVoice, onPhoto, onAdd, onTryOn, onStopTryOn, onRenderPhoto, onAdjust, adjustOpen } = props;
  const [value, setValue] = useState('');
  const listening = voiceState === 'asleep' || voiceState === 'awake';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = value.trim();
    if (!text) return;
    setValue('');
    onSubmit(text);
  };

  return (
    <section className="dock" aria-label="Commands">
      <div className="dock__reply" data-testid="assistant-message" aria-live="polite">
        {message.heard && <p className="dock__heard">{message.heard}</p>}
        <p className="dock__text">
          {thinking ? 'One moment' : message.text}
          {!thinking && message.source && <span className="dock__source">{message.source}</span>}
        </p>
      </div>

      <div className="dock__bar">
        <button
          type="button"
          className="dock__mic"
          data-state={speaking ? 'speaking' : voiceState}
          aria-pressed={listening}
          aria-label={listening ? 'Stop listening' : 'Start listening'}
          data-testid="voice-toggle"
          onClick={onToggleVoice}
        >
          {listening ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}
        </button>

        <form className="dock__form" onSubmit={submit} role="search" aria-label="Type a command">
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Show jackets, next, try this on"
            aria-label="Command"
            autoComplete="off"
            enterKeyHint="send"
            data-testid="command-input"
          />
          <button type="submit" className="dock__send" aria-label="Send command" disabled={!value.trim()} data-testid="command-send">
            <ArrowUp aria-hidden="true" />
          </button>
        </form>

        <div className="dock__actions">
          <button type="button" className="tool" onClick={liveTryOn ? onRenderPhoto : onPhoto} aria-label={liveTryOn ? 'Render a photo' : 'Take photo'} data-testid="take-photo">
            <Aperture aria-hidden="true" />
            <span>{liveTryOn ? 'Render a photo' : 'Take photo'}</span>
          </button>
          <button type="button" className="tool" onClick={onAdd} data-testid="add-from-camera">
            <SquarePlus aria-hidden="true" />
            <span>Add this</span>
          </button>
          {!hideTryOn && (
            <button type="button" className="tool tool--tryon" onClick={liveTryOn ? onStopTryOn : onTryOn} data-testid="generate-tryon">
              <Shirt aria-hidden="true" />
              <span>{liveTryOn ? 'Stop try-on' : 'Try on'}</span>
            </button>
          )}
          <button type="button" className="tool tool--adjust" onClick={onAdjust} aria-expanded={adjustOpen} data-testid="adjust-toggle">
            <SlidersHorizontal aria-hidden="true" />
            <span>Adjust</span>
          </button>
        </div>
      </div>

      <div className="hud" data-testid="voice-hud" data-state={speaking ? 'speaking' : voiceState} role="status">
        <span className="hud__state">{hudText(voiceState, speaking, outputLabel)}</span>
        {interim && <span className="hud__interim">{interim}</span>}
        {voiceState === 'awake' && !speaking && (
          <span
            key={awakeTick}
            className="hud__timer"
            style={{ animationDuration: `${AWAKE_TIMEOUT_MS}ms` }}
            aria-hidden="true"
          />
        )}
      </div>
    </section>
  );
}
