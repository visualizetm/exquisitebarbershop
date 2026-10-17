import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

const NOT_TYPED = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'file']);

/** True for controls that open the keyboard; a checkbox or radio never does. */
function isTextControl(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return tag === 'INPUT' && !NOT_TYPED.has((el as HTMLInputElement).type);
}

/**
 * A bar pinned to the bottom of the phone screen. It hides while a text field
 * has focus so the keyboard never pushes it over the input being typed in.
 */
export function StickyCTA({
  primary,
  secondary,
  children,
  desktop = 'hide',
}: {
  primary?: ReactNode;
  secondary?: ReactNode;
  children: ReactNode;
  /** Hidden on wide screens by default, where the inline button is visible anyway. */
  desktop?: 'hide' | 'show';
}) {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const onFocus = () => {
      setTyping(isTextControl(document.activeElement));
    };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onFocus);
    return () => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onFocus);
    };
  }, []);
  return (
    <>
      <div className="exq-sticky-space" data-desktop={desktop} aria-hidden="true" />
      <div className="exq-sticky" data-state={typing ? 'hidden' : 'shown'} data-desktop={desktop}>
        {primary !== undefined || secondary !== undefined ? (
          <div className="exq-sticky__info">
            {primary !== undefined ? <span className="exq-sticky__primary">{primary}</span> : null}
            {secondary !== undefined ? (
              <span className="exq-sticky__secondary">{secondary}</span>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </>
  );
}
