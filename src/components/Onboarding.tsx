import { Camera, Layers } from 'lucide-react';
import { RoomScene } from './RoomScene';

interface Props {
  onStartCamera: () => void;
  onExplore: () => void;
}

export function Onboarding({ onStartCamera, onExplore }: Props) {
  return (
    <main className="intro" data-testid="onboarding">
      <RoomScene />
      <div className="intro__scrim" aria-hidden="true" />
      <div className="intro__copy">
        <p className="brand brand--large">
          <span className="brand__mark" aria-hidden="true" />
          Aura
        </p>
        <h1>Good to see you.</h1>
        <p className="intro__lede">
          Start the mirror, then say “Wake up Meta, daddy’s home.”
        </p>
        <div className="intro__actions">
          <button type="button" className="button button--primary" onClick={onStartCamera} data-testid="start-camera">
            <Camera aria-hidden="true" />
            Start mirror and voice
          </button>
          <button type="button" className="button" onClick={onExplore} data-testid="explore-demo">
            <Layers aria-hidden="true" />
            Browse shirts
          </button>
        </div>
        <p className="intro__note">
          The camera and microphone stay off until you switch them on.
        </p>
      </div>
    </main>
  );
}
