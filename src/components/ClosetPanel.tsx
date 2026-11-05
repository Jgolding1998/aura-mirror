import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { CATEGORIES, CATEGORY_LABEL } from '../types';
import type { Category, ClosetItem } from '../types';

interface Props {
  items: ClosetItem[];
  category: Category;
  focusId: string | null;
  selectedId: string | null;
  loading: boolean;
  readOnly: boolean;
  onCategory: (category: Category) => void;
  onSelect: (item: ClosetItem) => void;
  onTryOn: (item: ClosetItem) => void;
  onTryOwn: () => void;
  onAdd: () => void;
  onEdit: (item: ClosetItem) => void;
  onDelete: (item: ClosetItem) => void;
}

export function ClosetPanel({ items, category, focusId, selectedId, loading, readOnly, onCategory, onSelect, onTryOn, onTryOwn, onAdd, onEdit, onDelete }: Props) {
  const visible = items.filter((item) => item.category === category);
  const hasSamples = items.some((item) => item.source === 'sample');

  return (
    <aside className="closet" aria-label="Closet" data-testid="closet-panel">
      <header className="closet__head">
        <h2 className="closet__title">Closet</h2>
        {hasSamples && <span className="closet__note">Real shirt photos included</span>}
      </header>

      <div className="closet__tabs" role="tablist" aria-label="Categories">
        {CATEGORIES.map((name) => {
          const count = items.filter((item) => item.category === name).length;
          return (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={name === category}
              className="closet__tab"
              data-testid={`category-${name}`}
              onClick={() => onCategory(name)}
            >
              {CATEGORY_LABEL[name]}
              <span className="closet__count" aria-label={`${count} items`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="closet__list" role="tabpanel" aria-label={CATEGORY_LABEL[category]} data-testid="closet-list">
        {loading && <p className="closet__empty">Opening your closet</p>}
        <button type="button" className="closet__add" onClick={onTryOwn} disabled={readOnly} data-testid="try-own-garment">
          Try your own
        </button>
        {!loading && visible.length === 0 && (
          <p className="closet__empty">No {CATEGORY_LABEL[category].toLowerCase()} yet. Add one from the camera or a photo.</p>
        )}
        {visible.map((item) => {
          const selected = item.id === selectedId;
          const focused = item.id === focusId;
          return (
            <article key={item.id} className="card" data-focused={focused} data-selected={selected} data-testid={`closet-card-${item.id}`}>
              <button
                type="button"
                className="card__main"
                aria-pressed={selected}
                aria-label={`${selected ? 'Selected: ' : 'Select '}${item.name}`}
                data-testid={`select-item-${item.id}`}
                data-item-card={item.id}
                onClick={() => onSelect(item)}
              >
                <span className="card__image">
                  <img src={item.imageUrl} alt="" draggable={false} loading="lazy" />
                </span>
                <span className="card__text">
                  <span className="card__name">{item.name}</span>
                  <span className="card__meta">
                    {item.color || CATEGORY_LABEL[item.category]}
                    {item.source === 'sample' ? ' · Sample photo' : ''}
                  </span>
                </span>
                {selected && (
                  <span className="card__tick">
                    <Check aria-hidden="true" />
                    Selected
                  </span>
                )}
              </button>
              <div className="card__tools">
                <button type="button" className="button button--small" onClick={() => onTryOn(item)} aria-label={`Try on ${item.name}`} data-testid={`try-item-${item.id}`}>{item.category === 'pants' ? 'Try on in photo' : 'Try on live'}</button>
                {!readOnly && item.source !== 'sample' && <>
                  <button type="button" className="icon-button" aria-label={`Edit ${item.name}`} data-testid={`edit-item-${item.id}`} onClick={() => onEdit(item)}>
                    <Pencil aria-hidden="true" />
                  </button>
                  <button type="button" className="icon-button" aria-label={`Delete ${item.name}`} data-testid={`delete-item-${item.id}`} onClick={() => onDelete(item)}>
                    <Trash2 aria-hidden="true" />
                  </button>
                </>}
              </div>
            </article>
          );
        })}
        <button type="button" className="closet__add" onClick={onAdd} disabled={readOnly} data-testid="closet-add">
          <Plus aria-hidden="true" />
          Add to closet
        </button>
      </div>
    </aside>
  );
}
