import { describe, expect, it } from 'vitest';
import { chairWork, homeWork } from '../../src/lib/workPhotos';

const photos = (n: number) => Array.from({ length: n }, (_, i) => `p${String(i + 1)}`);

describe('homeWork', () => {
  it('stays out with fewer than three photos, so the section never looks half empty', () => {
    expect(homeWork(photos(0))).toEqual([]);
    expect(homeWork(photos(1))).toEqual([]);
    expect(homeWork(photos(2))).toEqual([]);
  });

  it('shows one row of three with three to five photos, and the full six from six on', () => {
    expect(homeWork(photos(3))).toEqual(['p1', 'p2', 'p3']);
    expect(homeWork(photos(5))).toEqual(['p1', 'p2', 'p3']);
    expect(homeWork(photos(6))).toEqual(photos(6));
    expect(homeWork(photos(9))).toEqual(photos(6));
  });
});

describe('chairWork', () => {
  it('waits for the chair photos before deciding', () => {
    expect(chairWork(null, photos(3))).toBeNull();
  });

  it('shows the chair photos when any are credited', () => {
    expect(chairWork(['own1', 'own2'], photos(3))).toEqual({
      source: 'own',
      photos: ['own1', 'own2'],
    });
  });

  it('falls back to up to three shop photos, and to nothing when the shop has none', () => {
    expect(chairWork([], photos(5))).toEqual({ source: 'shop', photos: ['p1', 'p2', 'p3'] });
    expect(chairWork([], photos(2))).toEqual({ source: 'shop', photos: ['p1', 'p2'] });
    expect(chairWork([], [])).toBeNull();
    expect(chairWork([], null)).toBeNull();
  });
});
