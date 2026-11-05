import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Aperture, Camera, Download, ImageUp, Shirt } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { mediaSize, photoBounds, readImageFile } from '../lib/capture';
import type { MediaEl } from '../lib/capture';
import { Modal } from './Modal';
import type { AppConfig, ClosetItem, TryOnResult } from '../types';

export interface PhotoCapture {
  /** Unflipped frame, or a chosen photo. This is what a generated try-on receives. */
  person: string;
  /** Mirrored frame with the Live overlay on top, for looking at and saving. */
  composite?: string;
}

interface Props {
  photo: PhotoCapture | null;
  item: ClosetItem | null;
  tryon: AppConfig['tryon'] | undefined;
  cameraLive: boolean;
  cameraError?: string;
  getMedia: () => MediaEl | null;
  onStartCamera: () => void;
  onCapture: () => PhotoCapture;
  onPhoto: (photo: PhotoCapture) => void;
  onClose: () => void;
}

type Generation =
  | { state: 'idle' }
  | { state: 'working'; since: number }
  | { state: 'done'; result: TryOnResult }
  | { state: 'unavailable'; message: string }
  | { state: 'error'; message: string };

export function TryOnPanel({ photo, item, tryon, cameraLive, cameraError, getMedia, onStartCamera, onCapture, onPhoto, onClose }: Props) {
  const [generation, setGeneration] = useState<Generation>({ state: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const showCamera = cameraLive && !photo;
  const upperBody = item?.category !== 'pants';

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const canvas = previewRef.current;
    const context = canvas?.getContext('2d');
    if (!showCamera || !canvas || !context) return;
    const timer = window.setInterval(() => {
      const media = getMedia();
      const { width, height } = mediaSize(media);
      if (!media || !width || !height || (media instanceof HTMLVideoElement && media.readyState < 2)) return;
      const crop = photoBounds(width, height, upperBody);
      const scaledHeight = Math.round(480 * crop.height / crop.width);
      if (canvas.height !== scaledHeight) canvas.height = scaledHeight;
      context.drawImage(media, crop.left, 0, crop.width, crop.height, 0, 0, 480, scaledHeight);
    }, 100);
    return () => window.clearInterval(timer);
  }, [showCamera, getMedia, upperBody]);

  useEffect(() => {
    if (generation.state !== 'working') return;
    const { since } = generation;
    const timer = window.setInterval(() => setElapsed(Math.round((performance.now() - since) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [generation]);

  const generate = async (person: string) => {
    if (!item) {
      setError('Choose a piece from your closet first.');
      return;
    }
    setError(null);
    setElapsed(0);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setGeneration({ state: 'working', since: performance.now() });
    try {
      const garment = item.source === 'preview'
        ? { garmentImageDataUrl: item.imageUrl, category: item.category }
        : { itemId: item.id };
      const result = await api.tryOn({ personImageDataUrl: person, ...garment }, controller.signal, tryon?.cpu);
      setGeneration({ state: 'done', result });
    } catch (e) {
      if (controller.signal.aborted) return;
      if (e instanceof ApiError && e.notConfigured) setGeneration({ state: 'unavailable', message: e.message });
      else setGeneration({ state: 'error', message: errorMessage(e) });
    }
  };

  const capture = () => {
    setError(null);
    try {
      const next = onCapture();
      onPhoto(next);
      if (item && tryon?.ready) void generate(next.person);
      else setGeneration({ state: 'idle' });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    try {
      onPhoto({ person: await readImageFile(file) });
      setGeneration({ state: 'idle' });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const showingOverlay = generation.state === 'idle' && !!photo?.composite;
  const shown = showingOverlay ? photo?.composite : photo?.person;

  return (
    <Modal title={item ? `Try on ${item.name}` : 'Your photo'} onClose={onClose} width="wide" testId="tryon-panel">
      <p className="tryon__privacy">
        {item?.source === 'preview' && 'Set the garment down. '}
        {item?.category === 'pants' ? 'Keep your hips and legs in view.' : 'You can stay seated. Keep your face, shoulders and chest in view.'}
      </p>
      <div className="tryon">
        <figure className="tryon__frame">
          {shown ? <img src={shown} alt="Your photo" data-testid="tryon-photo" /> : showCamera
            ? <canvas ref={previewRef} className="tryon__camera" width={480} height={270} aria-label="Your camera preview" />
            : <p>Start the camera or upload a photo of yourself.</p>}
          <figcaption>{showCamera ? 'Camera preview' : showingOverlay ? 'Live overlay photo' : 'Your photo'}</figcaption>
        </figure>

        <figure className="tryon__frame" aria-live="polite">
          {generation.state === 'done' ? (
            <img src={generation.result.imageUrl} alt={generation.result.label} data-testid="tryon-result" />
          ) : generation.state === 'working' ? (
            <p>{tryon?.cpu ? 'Generating on this PC. This may take several minutes.' : 'Generating on your try-on server.'} {elapsed} seconds so far.</p>
          ) : (
            item ? <img src={item.imageUrl} alt={item.name} /> : <p>Choose a garment from the closet.</p>
          )}
          <figcaption>{generation.state === 'done' ? generation.result.label : generation.state === 'working' ? 'Creating your try-on' : 'Garment photo'}</figcaption>
        </figure>

        {generation.state === 'unavailable' && (
          <div className="tryon__notice" role="alert" data-testid="tryon-error">
            <h3>Generated try-on is not set up on this computer</h3>
            <p>{generation.message}</p>
            <p>Live overlay keeps working without it, and nothing was generated.</p>
          </div>
        )}
        {generation.state === 'error' && (
          <div className="tryon__notice" role="alert" data-testid="tryon-error">
            <h3>The try-on did not finish</h3>
            <p>{generation.message}</p>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert" data-testid="tryon-input-error">
            {error}
          </p>
        )}
        {!photo && cameraError && <p className="form-error" role="alert">{cameraError}</p>}

        <div className="tryon__actions">
          <div className="tryon__sources">
            {cameraLive ? (
              <button type="button" className={item && tryon?.ready ? 'button button--primary' : 'button button--small'} disabled={generation.state === 'working'} onClick={capture} data-testid="tryon-capture">
                <Aperture aria-hidden="true" />
                {item && tryon?.ready ? (photo ? 'Retake and try on' : 'Take photo and try on') : 'Take photo'}
              </button>
            ) : (
              <button type="button" className="button" onClick={onStartCamera}>
                <Camera aria-hidden="true" /> Start camera
              </button>
            )}
            <label className="button button--small">
              <ImageUp aria-hidden="true" />
              Choose a photo
              <input className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" disabled={generation.state === 'working'} onChange={onFile} data-testid="tryon-file" />
            </label>
            {photo?.composite && (
              <a className="button button--small" href={photo.composite} download="aura-mirror-photo.jpg">
                <Download aria-hidden="true" />
                Save photo
              </a>
            )}
          </div>
          {generation.state === 'working' ? (
            <button type="button" className="button" onClick={() => {
              abortRef.current?.abort();
              setGeneration({ state: 'idle' });
            }}>
              Stop waiting
            </button>
          ) : photo && item && generation.state !== 'done' ? (
            <button
              type="button"
              className="button button--primary"
              onClick={() => photo && void generate(photo.person)}
              data-testid="tryon-submit"
            >
              <Shirt aria-hidden="true" />
              Try on with this photo
            </button>
          ) : null}
        </div>
        <p className="tryon__privacy">
          {tryon?.cpu ? 'Photos stay on this PC. A try-on takes a few minutes.' : 'Try-on uses your configured service.'}
        </p>
      </div>
    </Modal>
  );
}
