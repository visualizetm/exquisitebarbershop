/**
 * The timer behind the Today's chairs carousel, kept apart from the DOM so it can be tested with
 * fake timers. It advances once per interval while it is enabled (a narrow screen, motion allowed),
 * nothing holds it (a finger down, hover, focus inside, off screen, a hidden tab) and nobody has
 * stopped it. A hold restarts the full interval when it is released. A stop is for good: the first
 * swipe or dot tap ends auto-advance until the page is loaded again.
 */
export type AutoplayHold = 'pointer' | 'hover' | 'focus' | 'offscreen' | 'hidden';
export type AutoplayState = 'off' | 'running' | 'paused' | 'stopped';

export interface Autoplay {
  /** Allowed at all (narrow screen and motion not reduced). */
  setEnabled(enabled: boolean): void;
  hold(reason: AutoplayHold): void;
  release(reason: AutoplayHold): void;
  /** Ends auto-advance for good. */
  stop(): void;
  state(): AutoplayState;
  dispose(): void;
}

export function createAutoplay({
  interval,
  onAdvance,
}: {
  interval: number;
  onAdvance: () => void;
}): Autoplay {
  const holds = new Set<AutoplayHold>();
  let enabled = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const shouldRun = () => enabled && !stopped && holds.size === 0;
  const sync = () => {
    if (shouldRun()) {
      timer ??= setTimeout(tick, interval);
    } else if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const tick = () => {
    timer = null;
    if (!shouldRun()) return;
    onAdvance();
    sync();
  };

  return {
    setEnabled(next) {
      enabled = next;
      sync();
    },
    hold(reason) {
      holds.add(reason);
      sync();
    },
    release(reason) {
      holds.delete(reason);
      sync();
    },
    stop() {
      stopped = true;
      sync();
    },
    state() {
      if (stopped) return 'stopped';
      if (!enabled) return 'off';
      return holds.size > 0 ? 'paused' : 'running';
    },
    dispose() {
      stopped = true;
      sync();
    },
  };
}
