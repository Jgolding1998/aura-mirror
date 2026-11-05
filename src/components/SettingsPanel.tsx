import { Modal } from './Modal';
import type { AppConfig } from '../types';

interface Row {
  name: string;
  state: string;
  detail: string;
  tone?: 'good' | 'warn';
}

interface Props {
  config: AppConfig | null;
  configError: string | null;
  rows: Row[];
  speakTyped: boolean;
  onSpeakTyped: (value: boolean) => void;
  onTestVoice: () => void;
  onUseBrowserCamera: (() => void) | null;
  onReplayIntro: () => void;
  onClose: () => void;
}

const CONTROLS: [string, string][] = [
  ['Up and Down arrows', 'Previous or next piece in this category'],
  ['Left and Right arrows', 'Previous or next category'],
  ['Enter', 'Select the highlighted piece'],
  ['Escape', 'Close the closet or the open window'],
  ['/', 'Jump to the command box'],
  ['Point with your index finger', 'Moves the hand cursor, once Hand pointer is on'],
  ['Pinch thumb and index', 'Clicks under the cursor. Open your fingers between clicks'],
];

const COMMANDS: [string, string][] = [
  ['"Open closet", "Let me see what is in my closet"', 'Opens the closet'],
  ['"Shirts", "Show pants", "Show jackets"', 'Changes category'],
  ['"Next", "Previous"', 'Moves through the category'],
  ['"Select", "Try this on"', 'Puts the highlighted piece on the overlay'],
  ['"How do I look in this"', 'Selects it and asks for a comment'],
  ['"Add this to closet"', 'Captures a frame and opens the add window'],
  ['"Try what I’m holding"', 'Captures a garment for a preview without saving it'],
  ['"Take photo"', 'Captures the mirror view with its overlay'],
  ['"Generate try-on"', 'Sends a frame to your try-on server, if it is set up'],
  ['"Close closet"', 'Hides the closet'],
  ['"Stop listening"', 'Turns the microphone off'],
];

export function SettingsPanel({ configError, rows, speakTyped, onSpeakTyped, onTestVoice, onUseBrowserCamera, onReplayIntro, onClose }: Props) {
  return (
    <Modal title="Settings and help" onClose={onClose} width="wide" testId="settings-panel">
      <div className="settings">
        <section aria-labelledby="settings-adapters">
          <h3 id="settings-adapters">What is connected</h3>
          {configError && (
            <p className="form-error" role="alert">
              The server's setup could not be read: {configError}
            </p>
          )}
          <dl className="adapters">
            {rows.map((row) => (
              <div key={row.name} className="adapter" data-testid={`adapter-${row.name.toLowerCase().replace(/\s+/g, '-')}`}>
                <dt>{row.name}</dt>
                <dd className="adapter__state" data-tone={row.tone}>
                  {row.state}
                </dd>
                <dd className="adapter__detail">{row.detail}</dd>
              </div>
            ))}
          </dl>
          <div className="settings__row">
            <label className="check">
              <input type="checkbox" checked={speakTyped} onChange={(event) => onSpeakTyped(event.target.checked)} data-testid="speak-typed" />
              <span>Speak replies to typed commands too</span>
            </label>
            <button type="button" className="text-button" onClick={onTestVoice} data-testid="voice-test">Hear Aura</button>
            {onUseBrowserCamera && (
              <button type="button" className="text-button" onClick={onUseBrowserCamera}>
                Use this device's camera instead
              </button>
            )}
            <button type="button" className="text-button" onClick={onReplayIntro}>
              Show the intro again
            </button>
          </div>
        </section>

        <section aria-labelledby="settings-controls">
          <h3 id="settings-controls">Controls</h3>
          <dl className="keys">
            {CONTROLS.map(([key, action]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="settings-voice">
          <h3 id="settings-voice">Voice and typed commands</h3>
          <p className="settings__para">
            Press the microphone to listen. Aura stays asleep until it hears "Hey Meta", then stays awake for 20 seconds after you last spoke. You can say the command straight after the wake phrase. All of these work typed too.
          </p>
          <dl className="keys">
            {COMMANDS.map(([phrase, action]) => (
              <div key={phrase}>
                <dt>{phrase}</dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="settings-limits">
          <h3 id="settings-limits">Good to know</h3>
          <ul className="settings__list">
            <li>Live overlay places a flat drawing or photo over the video. It is not a fitted or photorealistic result.</li>
            <li>Follow my body moves and sizes the overlay by your shoulders or hips. It does not bend the garment around your arms.</li>
            <li>Browser speech recognition may send microphone audio to your browser maker's cloud service while listening is on.</li>
            <li>Hand tracking runs in this browser. Video frames are not uploaded for it. A pinch can press anything except the file chooser, which browsers only open from a real click.</li>
            <li>Your closet is stored on this computer by the local server. Delete pieces with the bin icon on each card.</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
