import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import SearchLg from '@untitled-ui/icons-react/build/esm/SearchLg';

export interface SearchItem {
  key: string;
  title: ReactNode;
  detail?: ReactNode;
  /** Plain text for the screen reader announcement of this option. */
  text: string;
}
export interface SearchGroup {
  label: string;
  items: SearchItem[];
}

/**
 * A search box with a grouped result list (the combobox pattern). The caller fetches: it gets
 * the query after a short pause and passes the groups back. Up and Down move through the
 * results across groups, Enter chooses, Escape closes. With `shortcut`, pressing "/" anywhere
 * (outside a field) focuses the box.
 */
export function SearchBox({
  label,
  placeholder,
  groups,
  status,
  onQuery,
  onChoose,
  shortcut = false,
  emptyText = 'Nothing found',
}: {
  label: string;
  placeholder: string;
  groups: SearchGroup[];
  status: 'idle' | 'loading' | 'error';
  onQuery: (q: string) => void;
  onChoose: (groupLabel: string, key: string) => void;
  shortcut?: boolean;
  emptyText?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const flat = groups.flatMap((g) => g.items.map((item) => ({ group: g.label, item })));
  const listId = `${id}-list`;

  // The query goes out 200ms after the last keystroke.
  useEffect(() => {
    const trimmed = value.trim();
    const handle = window.setTimeout(
      () => {
        onQuery(trimmed);
      },
      trimmed === '' ? 0 : 200,
    );
    return () => {
      window.clearTimeout(handle);
    };
  }, [value, onQuery]);

  useEffect(() => {
    if (!shortcut) return;
    function onKey(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [shortcut]);

  function choose(index: number) {
    const hit = flat[index];
    if (!hit) return;
    onChoose(hit.group, hit.item.key);
    setOpen(false);
    setValue('');
    setActive(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((a) => (flat.length === 0 ? -1 : (a + 1) % flat.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((a) => (flat.length === 0 ? -1 : (a - 1 + flat.length) % flat.length));
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape') {
      if (open) event.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  }

  const showList = open && value.trim() !== '';
  const nothing = showList && status === 'idle' && flat.length === 0;
  let index = -1;
  return (
    <div className="exq-search" data-state={showList ? 'open' : 'closed'}>
      <SearchLg className="exq-search__icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        className="exq-search__input"
        aria-label={label}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
        placeholder={placeholder}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false);
          }, 120);
        }}
        onKeyDown={onKeyDown}
      />
      {shortcut ? (
        <kbd className="exq-search__hint" aria-hidden="true">
          /
        </kbd>
      ) : null}
      <div
        id={listId}
        role="listbox"
        aria-label={`${label} results`}
        className="exq-search__list"
        hidden={!showList}
      >
        {status === 'loading' ? (
          <p className="exq-search__note" role="status">
            Searching
          </p>
        ) : null}
        {status === 'error' ? (
          <p className="exq-search__note" role="alert">
            Search did not load. Try again.
          </p>
        ) : null}
        {nothing ? (
          <p className="exq-search__note" role="status">
            {emptyText}
          </p>
        ) : null}
        {groups.map((group) => (
          <div
            key={group.label}
            role="group"
            aria-label={group.label}
            className="exq-search__group"
          >
            <p className="exq-search__group-label" aria-hidden="true">
              {group.label}
            </p>
            {group.items.map((item) => {
              index += 1;
              const i = index;
              return (
                <div
                  key={item.key}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={active === i}
                  className="exq-search__option"
                  data-state={active === i ? 'active' : 'idle'}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(i);
                  }}
                  onMouseEnter={() => {
                    setActive(i);
                  }}
                >
                  <span className="exq-search__title">{item.title}</span>
                  {item.detail ? <span className="exq-search__detail">{item.detail}</span> : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
