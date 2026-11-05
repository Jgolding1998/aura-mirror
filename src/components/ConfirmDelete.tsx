import { useState } from 'react';
import { errorMessage } from '../lib/api';
import { Modal } from './Modal';
import type { ClosetItem } from '../types';

interface Props {
  item: ClosetItem;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmDelete({ item, onConfirm, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Delete ${item.name}`} onClose={onClose} testId="delete-dialog">
      <div className="confirm">
        <img className="confirm__image" src={item.imageUrl} alt="" />
        <p>This removes it from your closet on this computer. It cannot be undone.</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="item-form__actions">
          <button type="button" className="button" data-autofocus onClick={onClose}>
            Keep it
          </button>
          <button type="button" className="button button--danger" onClick={() => void confirm()} disabled={busy} data-testid="confirm-delete">
            {busy ? 'Deleting' : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
