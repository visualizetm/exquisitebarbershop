import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import {
  NO_BAR_PREFIXES,
  defaultBar,
  getBar,
  subscribeBar,
  type BarAction,
  type BarConfig,
} from './barStore';
import { Link } from './Link';

const NOT_TYPED = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'file']);

/** True for controls that open the keyboard; a checkbox or radio never does. */
function isTextControl(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return tag === 'INPUT' && !NOT_TYPED.has((el as HTMLInputElement).type);
}

/**
 * True while the on-screen keyboard is up: a text field has focus, or the visual viewport has shrunk
 * well below the layout viewport (what iOS and Android report when the keyboard opens).
 */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const update = () => {
      const vv = window.visualViewport;
      const shrunk = vv ? window.innerHeight - vv.height > 150 : false;
      setOpen(shrunk || isTextControl(document.activeElement));
    };
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);
  return open;
}

function Half({ action }: { action: BarAction }) {
  const props = {
    className: 'exq-bar__half',
    'data-tone': action.tone,
    'data-state': action.disabled ? 'disabled' : 'default',
  };
  if (action.to && !action.disabled) {
    return (
      <Link to={action.to} {...props}>
        {action.label}
      </Link>
    );
  }
  if (action.href && !action.disabled) {
    return (
      <a href={action.href} {...props}>
        {action.label}
      </a>
    );
  }
  return (
    <button
      type={action.form ? 'submit' : 'button'}
      form={action.form}
      disabled={action.disabled}
      onClick={action.onClick}
      {...props}
    >
      {action.label}
    </button>
  );
}

/** The bar itself, without behavior. The kit page renders it in every state. */
export function BarView({
  config,
  state,
  barRef,
  style,
}: {
  config: BarConfig;
  state: 'shown' | 'hidden';
  barRef?: React.Ref<HTMLDivElement>;
  style?: React.CSSProperties;
}) {
  return (
    <div
      ref={barRef}
      style={style}
      className="exq-bar"
      role="region"
      aria-label="Quick actions"
      data-mode={config.mode ?? 'default'}
      data-state={state}
      data-menu-inert
    >
      {config.summary ? <div className="exq-bar__summary">{config.summary}</div> : null}
      <div className="exq-bar__actions">
        <Half action={config.left} />
        <Half action={config.right} />
      </div>
    </div>
  );
}

/**
 * The phone bottom bar: CALL and BOOK NOW, two equal halves, a 2px red rule on top. Below 1024px
 * only (CSS). It publishes its own height as --bar-h so pages leave room for it and toasts sit above
 * it, and it slides away while the keyboard is open.
 */
export function BottomBar({ phone }: { phone: string }) {
  const { pathname } = useLocation();
  const custom = useSyncExternalStore(subscribeBar, getBar, getBar);
  const keyboard = useKeyboardOpen();
  const ref = useRef<HTMLDivElement>(null);
  const hidden = NO_BAR_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (hidden || !el) {
      root.style.removeProperty('--bar-h');
      return;
    }
    const publish = () => {
      root.style.setProperty('--bar-h', `${String(el.offsetHeight)}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--bar-h');
    };
  }, [hidden]);

  if (hidden) return null;
  return (
    <BarView
      barRef={ref}
      config={custom ?? defaultBar(phone)}
      state={keyboard ? 'hidden' : 'shown'}
    />
  );
}
