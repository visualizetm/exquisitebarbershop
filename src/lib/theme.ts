export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

/** localStorage key, read by the pre-paint script in index.html as well. */
export const THEME_KEY = 'exq-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const THEME_COLOR: Record<Theme, string> = { light: '#FFFFFF', dark: '#111111' };

const listeners = new Set<() => void>();

export function readTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function effectiveTheme(choice: ThemeChoice = readTheme()): Theme {
  if (choice !== 'system') return choice;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function updateThemeColor(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLOR[effectiveTheme()];
}

/** Sets data-theme on <html> (none for System) and keeps the browser chrome color in step. */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  updateThemeColor();
}

export function setTheme(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Private mode or blocked storage: the choice still applies for this page.
  }
  // A short color transition while the swap happens; base.css scopes it to this attribute.
  const root = document.documentElement;
  root.setAttribute('data-theme-switching', '');
  applyTheme(choice);
  window.setTimeout(() => {
    root.removeAttribute('data-theme-switching');
  }, 200);
  for (const listener of listeners) listener();
}

/** For useSyncExternalStore: fires on a change here, in another tab, or in the system scheme. */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY) {
      applyTheme(readTheme());
      listener();
    }
  };
  const media = window.matchMedia(DARK_QUERY);
  const onScheme = () => {
    updateThemeColor();
    listener();
  };
  window.addEventListener('storage', onStorage);
  media.addEventListener('change', onScheme);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
    media.removeEventListener('change', onScheme);
  };
}

export const THEME_LABELS: Record<ThemeChoice, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];
