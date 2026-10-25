import { describe, expect, it } from 'vitest';
import { servicesSeed, serviceSeedId, staffSeed } from '../../seed/shop';
import { offeredServices } from '../../src/lib/booking/offered';

const all = servicesSeed.map((s) => ({ id: serviceSeedId(s.key), key: s.key }));
const menuOf = (staffKey: string): string[] =>
  staffSeed.find((s) => s.key === staffKey)?.input.serviceIds ?? [];

describe('offeredServices', () => {
  it('keeps every service when no chair is chosen (first available)', () => {
    expect(offeredServices(all, null)).toEqual(all);
    expect(offeredServices(all, undefined)).toEqual(all);
  });

  it("narrows the list to one chair's own menu", () => {
    const keys = offeredServices(all, menuOf('nelly')).map((s) => s.key);
    expect(keys).toEqual(['haircut', 'kids-cut', 'steam-fade']);
  });

  it('never lists a service the chair does not do, so a printed card cannot dead end', () => {
    // Eyebrows is Drew only: choosing Nelly first must not offer it.
    const nelly = offeredServices(all, menuOf('nelly')).map((s) => s.key);
    expect(nelly).not.toContain('eyebrows');
    expect(offeredServices(all, menuOf('drew')).map((s) => s.key)).toContain('eyebrows');
    // Every listed service is on the menu, for every chair.
    for (const member of staffSeed) {
      const menu = member.input.serviceIds;
      for (const service of offeredServices(all, menu)) expect(menu).toContain(service.id);
    }
  });

  it('lists nothing for a chair with an empty menu, and returns a new array each time', () => {
    expect(offeredServices(all, [])).toEqual([]);
    expect(offeredServices(all, null)).not.toBe(all);
  });
});
