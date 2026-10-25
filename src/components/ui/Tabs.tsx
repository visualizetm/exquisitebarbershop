import { useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: ReactNode;
  count?: number | undefined;
}

/**
 * A row of tabs that switch panels on the same page (not routes). Arrow keys, Home and End
 * move between tabs; the panel is whatever the caller renders for the selected id.
 */
export function Tabs({
  label,
  tabs,
  value,
  onChange,
  children,
}: {
  label: string;
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  children: ReactNode;
}) {
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((t) => t.id === value);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onChange(target.id);
    refs.current[target.id]?.focus();
  }

  return (
    <div className="exq-tabs" data-state="ready">
      <div className="exq-tabs__list" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const selected = tab.id === value;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className="exq-tabs__tab"
              data-state={selected ? 'selected' : 'idle'}
              onClick={() => {
                onChange(tab.id);
              }}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span className="exq-tabs__count">{tab.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div
        className="exq-tabs__panel"
        role="tabpanel"
        id={`${base}-panel-${value}`}
        aria-labelledby={`${base}-tab-${value}`}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
