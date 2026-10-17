import { useSyncExternalStore } from 'react';
import { readTheme, setTheme, subscribeTheme, type ThemeChoice } from './theme';

const serverTheme = (): ThemeChoice => 'system';

/** The stored choice (System, Light or Dark) and a setter that applies it everywhere. */
export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const choice = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);
  return [choice, setTheme];
}
