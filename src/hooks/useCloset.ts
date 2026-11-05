import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import samples from '../lib/sample-photos.json';
import type { ClosetItem, ItemPatch, NewClosetItem } from '../types';

export type ClosetStatus = 'loading' | 'ready' | 'offline';

export function useCloset() {
  const [items, setItems] = useState<ClosetItem[]>([]);
  const [status, setStatus] = useState<ClosetStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  // Runs on mount and when the person presses Try again. Never on a timer.
  const reload = useCallback(async () => {
    setStatus('loading');
    try {
      const next = await api.listCloset();
      setItems(next);
      setStatus('ready');
      setError(null);
    } catch (e) {
      setItems(samples as ClosetItem[]);
      setStatus('offline');
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = useCallback(async (item: NewClosetItem) => {
    const created = await api.addItem(item);
    setItems((current) => [...current, created]);
    return created;
  }, []);

  const update = useCallback(async (id: string, patch: ItemPatch) => {
    const updated = await api.updateItem(id, patch);
    setItems((current) => current.map((item) => (item.id === id ? updated : item)));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.deleteItem(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  return { items, status, error, reload, add, update, remove, readOnly: status !== 'ready' };
}
