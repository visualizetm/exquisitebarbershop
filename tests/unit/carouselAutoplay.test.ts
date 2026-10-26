import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutoplay } from '../../src/components/site/carouselAutoplay';

describe('the carousel autoplay controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function make() {
    const onAdvance = vi.fn();
    const play = createAutoplay({ interval: 4000, onAdvance });
    return { play, onAdvance };
  }

  it('does nothing until it is enabled, then advances once per interval', () => {
    const { play, onAdvance } = make();
    expect(play.state()).toBe('off');
    vi.advanceTimersByTime(10_000);
    expect(onAdvance).not.toHaveBeenCalled();
    play.setEnabled(true);
    expect(play.state()).toBe('running');
    vi.advanceTimersByTime(3999);
    expect(onAdvance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onAdvance).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(8000);
    expect(onAdvance).toHaveBeenCalledTimes(3);
  });

  it('pauses while held and restarts the full interval when released', () => {
    const { play, onAdvance } = make();
    play.setEnabled(true);
    vi.advanceTimersByTime(3000);
    play.hold('pointer');
    expect(play.state()).toBe('paused');
    vi.advanceTimersByTime(10_000);
    expect(onAdvance).not.toHaveBeenCalled();
    play.release('pointer');
    expect(play.state()).toBe('running');
    vi.advanceTimersByTime(3999);
    expect(onAdvance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('stays paused until every hold is released', () => {
    const { play, onAdvance } = make();
    play.setEnabled(true);
    play.hold('hover');
    play.hold('offscreen');
    play.release('hover');
    vi.advanceTimersByTime(8000);
    expect(onAdvance).not.toHaveBeenCalled();
    play.release('offscreen');
    vi.advanceTimersByTime(4000);
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('stops for good after the user takes over, whatever happens later', () => {
    const { play, onAdvance } = make();
    play.setEnabled(true);
    vi.advanceTimersByTime(4000);
    expect(onAdvance).toHaveBeenCalledTimes(1);
    play.stop();
    expect(play.state()).toBe('stopped');
    play.release('pointer');
    play.setEnabled(true);
    vi.advanceTimersByTime(20_000);
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('never advances while disabled (reduced motion or a wide screen) and resumes when allowed again', () => {
    const { play, onAdvance } = make();
    play.setEnabled(false);
    vi.advanceTimersByTime(20_000);
    expect(onAdvance).not.toHaveBeenCalled();
    play.setEnabled(true);
    vi.advanceTimersByTime(4000);
    expect(onAdvance).toHaveBeenCalledTimes(1);
    play.setEnabled(false);
    vi.advanceTimersByTime(20_000);
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('dispose clears the timer', () => {
    const { play, onAdvance } = make();
    play.setEnabled(true);
    play.dispose();
    vi.advanceTimersByTime(20_000);
    expect(onAdvance).not.toHaveBeenCalled();
    expect(play.state()).toBe('stopped');
  });
});
