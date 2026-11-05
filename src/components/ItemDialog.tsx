import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Camera, ImageUp, Wand2 } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { readImageFile } from '../lib/capture';
import { Modal } from './Modal';
import { CATEGORIES, CATEGORY_LABEL } from '../types';
import type { AppConfig, Category, ClosetItem, ItemPatch, NewClosetItem } from '../types';

export interface ItemDialogRequest {
  mode: 'add' | 'edit';
  image?: string;
  item?: ClosetItem;
  defaultCategory: Category;
  intent?: 'preview';
}

interface Props {
  request: ItemDialogRequest;
  vision: AppConfig['vision'] | undefined;
  cameraLive: boolean;
  onStartCamera: () => void;
  onCaptureFromCamera: () => string;
  onAdd: (item: NewClosetItem) => Promise<void>;
  onPreview: (item: NewClosetItem) => Promise<void>;
  onEdit: (id: string, patch: ItemPatch) => Promise<void>;
  onClose: () => void;
}

type Suggestion =
  | { state: 'idle' }
  | { state: 'working' }
  | { state: 'manual'; message?: string }
  | { state: 'meta'; message?: string }
  | { state: 'error'; message: string };

export function ItemDialog({ request, vision, cameraLive, onStartCamera, onCaptureFromCamera, onAdd, onPreview, onEdit, onClose }: Props) {
  const editing = request.mode === 'edit' ? request.item : undefined;
  const tryOnly = request.intent === 'preview';
  const [image, setImage] = useState<string | null>(request.image ?? null);
  const [name, setName] = useState(editing?.name ?? '');
  const [category, setCategory] = useState<Category>(editing?.category ?? request.defaultCategory);
  const [color, setColor] = useState(editing?.color ?? '');
  const [removeBackground, setRemoveBackground] = useState(!tryOnly);
  const [suggestion, setSuggestion] = useState<Suggestion>({ state: 'idle' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggestRun = useRef<AbortController | null>(null);
  const touched = useRef(false);

  const usesRemoteVision = vision?.provider === 'meta' && vision.ready;

  const suggest = async (dataUrl: string) => {
    suggestRun.current?.abort();
    const controller = new AbortController();
    suggestRun.current = controller;
    setSuggestion({ state: 'working' });
    try {
      const result = await api.classify(dataUrl, controller.signal);
      if (controller.signal.aborted) return;
      if (!touched.current) {
        setName(result.name);
        setCategory(result.category);
        setColor(result.color);
      }
      setSuggestion({ state: result.provider, message: result.message });
    } catch (e) {
      if (controller.signal.aborted) return;
      setSuggestion({ state: 'error', message: errorMessage(e) });
    }
  };

  // The local classifier never leaves this computer, so it can run by itself.
  // Meta vision only runs when the person presses Suggest details.
  useEffect(() => {
    if (image && !editing && !tryOnly && !usesRemoteVision) void suggest(image);
    return () => suggestRun.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  const onField = <T,>(setter: (value: T) => void) => (value: T) => {
    touched.current = true;
    setter(value);
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    try {
      setImage(await readImageFile(file));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const capture = () => {
    setError(null);
    try {
      setImage(onCaptureFromCamera());
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Give this piece a name first.');
      return;
    }
    if (!editing && !image) {
      setError('Capture or choose a picture first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) await onEdit(editing.id, { name: cleanName, category, color: color.trim() });
      else await onAdd({ name: cleanName, category, color: color.trim() || undefined, imageDataUrl: image as string, removeBackground });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  const previewSrc = editing ? editing.imageUrl : image;

  const preview = async () => {
    if (!image) return;
    setSaving(true);
    setError(null);
    try {
      await onPreview({ name: name.trim() || 'Held garment', category, color: color.trim(), imageDataUrl: image, removeBackground });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? `Edit ${editing.name}` : request.intent === 'preview' ? 'Try a garment' : 'Add to closet'} onClose={onClose} width="wide" testId="item-dialog">
      <form className="item-form" onSubmit={submit}>
        <div className="item-form__preview" data-testid="item-preview">
          {previewSrc ? <img src={previewSrc} alt="Preview of this piece" /> : <p>Hold the garment in the centre of the camera against a plain wall, or choose a photo.</p>}
          {!editing && (
            <div className="item-form__sources">
              {cameraLive ? (
                <button type="button" className="button button--small" onClick={capture} data-testid="item-capture">
                  <Camera aria-hidden="true" />
                  {image ? 'Capture again' : 'Capture'}
                </button>
              ) : tryOnly ? (
                <button type="button" className="button button--small" onClick={onStartCamera}>
                  <Camera aria-hidden="true" /> Start camera
                </button>
              ) : null}
              <label className="button button--small">
                <ImageUp aria-hidden="true" />
                Choose a photo
                <input className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} data-testid="item-file" />
              </label>
            </div>
          )}
        </div>

        <div className="item-form__fields">
          {!tryOnly && <label className="field">
            <span>Name</span>
            <input data-autofocus value={name} onChange={(e) => onField(setName)(e.target.value)} maxLength={80} required data-testid="item-name" />
          </label>}
          <label className="field">
            <span>Category</span>
            <select value={category} onChange={(e) => onField(setCategory)(e.target.value as Category)} data-testid="item-category">
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
          {!tryOnly && <label className="field">
            <span>Colour</span>
            <input value={color} onChange={(e) => onField(setColor)(e.target.value)} maxLength={40} data-testid="item-color" />
          </label>}

          {!editing && (!tryOnly || image) && (
            <label className="check">
              <input type="checkbox" checked={removeBackground} onChange={(e) => setRemoveBackground(e.target.checked)} data-testid="item-remove-bg" />
              <span>Remove a plain background</span>
            </label>
          )}
          {!editing && !tryOnly && (
              <div className="item-form__suggest" data-testid="classify-status" role="status">
                {suggestion.state === 'working' && <p>Checking this picture</p>}
                {suggestion.state === 'manual' && <p>{suggestion.message ?? 'Nothing has identified this piece. These are starting values, so please confirm them yourself.'}</p>}
                {suggestion.state === 'meta' && <p>{suggestion.message ?? 'Suggested by Meta vision. Please check before saving.'}</p>}
                {suggestion.state === 'error' && <p>Details could not be suggested: {suggestion.message} Fill them in yourself.</p>}
                {usesRemoteVision && image && suggestion.state !== 'working' && (
                  <button type="button" className="text-button" onClick={() => void suggest(image)} data-testid="item-suggest">
                    <Wand2 aria-hidden="true" />
                    Suggest details with Meta vision
                  </button>
                )}
              </div>
          )}

          {error && (
            <p className="form-error" role="alert" data-testid="item-error">
              {error}
            </p>
          )}

          <div className="item-form__actions">
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
            {!editing && image && <button type="button" className={`button${request.intent === 'preview' ? ' button--primary' : ''}`} disabled={saving} onClick={() => void preview()} data-testid="item-preview-only">Try without saving</button>}
            {!tryOnly && <button type="submit" className="button button--primary" disabled={saving} data-testid="item-save">
              {saving ? 'Saving' : editing ? 'Save changes' : 'Save to closet'}
            </button>}
          </div>
        </div>
      </form>
    </Modal>
  );
}
