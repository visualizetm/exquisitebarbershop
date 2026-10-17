import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import Monitor01 from '@untitled-ui/icons-react/build/esm/Monitor01';
import Moon01 from '@untitled-ui/icons-react/build/esm/Moon01';
import Sun from '@untitled-ui/icons-react/build/esm/Sun';
import { THEME_CHOICES, THEME_LABELS, type ThemeChoice } from '@/lib/theme';
import { useTheme } from '@/lib/useTheme';

function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  if (choice === 'light') return <Sun aria-hidden="true" />;
  if (choice === 'dark') return <Moon01 aria-hidden="true" />;
  return <Monitor01 aria-hidden="true" />;
}

/**
 * An icon button that opens a small menu with System, Light and Dark. Arrow
 * keys move, Enter or Space picks, Escape closes and returns focus to the button.
 */
export function ThemeMenu() {
  const [choice, setChoice] = useTheme();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    itemRefs.current[THEME_CHOICES.indexOf(choice)]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, choice]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function pick(next: ThemeChoice) {
    setChoice(next);
    close(true);
  }

  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    const items = itemRefs.current.filter((i): i is HTMLButtonElement => i !== null);
    const index = items.findIndex((i) => i === document.activeElement);
    const move = (to: number) => {
      event.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    };
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(items.length - 1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') close(false);
  }

  return (
    <div ref={rootRef} className="exq-theme" data-state={open ? 'open' : 'closed'}>
      <button
        ref={buttonRef}
        type="button"
        className="exq-theme__button"
        aria-label={`Theme: ${THEME_LABELS[choice]}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setOpen((o) => !o);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <ThemeIcon choice={choice} />
      </button>
      <div
        id={menuId}
        className="exq-theme__menu"
        role="menu"
        aria-label="Theme"
        hidden={!open}
        onKeyDown={onMenuKey}
      >
        {THEME_CHOICES.map((option, i) => (
          <button
            key={option}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            type="button"
            role="menuitemradio"
            aria-checked={option === choice}
            className="exq-theme__item"
            data-state={option === choice ? 'selected' : 'idle'}
            tabIndex={-1}
            onClick={() => {
              pick(option);
            }}
          >
            <ThemeIcon choice={option} />
            {THEME_LABELS[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The same choice as a segmented control, for the mobile menu and the admin Account page. */
export function ThemeSwitch({ label = 'Theme' }: { label?: string }) {
  const [choice, setChoice] = useTheme();
  return (
    <div className="exq-theme-switch">
      <span className="exq-theme-switch__label">{label}</span>
      <div className="exq-seg" role="radiogroup" aria-label={label}>
        {THEME_CHOICES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === choice}
            className="exq-seg__btn exq-theme-switch__option"
            data-state={option === choice ? 'selected' : 'idle'}
            onClick={() => {
              setChoice(option);
            }}
          >
            <ThemeIcon choice={option} />
            {THEME_LABELS[option]}
          </button>
        ))}
      </div>
    </div>
  );
}
