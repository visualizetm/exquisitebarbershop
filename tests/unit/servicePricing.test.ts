import { describe, expect, it } from 'vitest';
import {
  menuPrice,
  offersService,
  overrideFor,
  pruneServicePrices,
  quoteFirstAvailable,
  quoteForStaff,
  quoteMove,
  resolveServiceForStaff,
  servicePriceIssues,
  type PricedService,
  type PricedStaff,
} from '../../shared/lib/servicePricing';

// Ids only need to be distinct strings for the pure helper.
const haircut: PricedService = {
  id: 'haircut',
  priceCents: 4000,
  priceFrom: true,
  durationMinutes: 45,
};
const lineup: PricedService = {
  id: 'lineup',
  priceCents: 2000,
  priceFrom: true,
  durationMinutes: 20,
};
const kids: PricedService = { id: 'kids', priceCents: 2000, priceFrom: true, durationMinutes: 30 };
const beard: PricedService = {
  id: 'beard',
  priceCents: 4500,
  priceFrom: false,
  durationMinutes: 45,
};
const solo: PricedService = { id: 'solo', priceCents: 4000, priceFrom: false, durationMinutes: 60 };

// Shaped like the seed: Dontrise charges more and takes longer, Nelly charges a little more,
// Drew has one kids price, Lee uses the shop's own numbers.
const dontrise: PricedStaff = {
  id: 'dontrise',
  sortOrder: 0,
  serviceIds: ['haircut', 'lineup', 'kids', 'solo'],
  servicePrices: [
    { serviceId: 'haircut', priceCents: 5000, durationMinutes: 75 },
    { serviceId: 'lineup', priceCents: 3000, durationMinutes: 40 },
    { serviceId: 'kids', priceCents: 3000, durationMinutes: 45 },
    { serviceId: 'solo', priceCents: 4000, durationMinutes: 90 },
  ],
};
const lee: PricedStaff = {
  id: 'lee',
  sortOrder: 10,
  serviceIds: ['haircut', 'lineup', 'kids', 'beard'],
};
const drew: PricedStaff = {
  id: 'drew',
  sortOrder: 20,
  serviceIds: ['haircut', 'lineup', 'kids', 'beard'],
  servicePrices: [{ serviceId: 'kids', priceCents: 2500 }],
};
const nelly: PricedStaff = {
  id: 'nelly',
  sortOrder: 30,
  serviceIds: ['haircut', 'kids'],
  servicePrices: [{ serviceId: 'haircut', priceCents: 4500 }],
};

describe('resolveServiceForStaff', () => {
  it('uses the shop price and time when the person has no entry', () => {
    expect(resolveServiceForStaff(haircut, lee)).toEqual({
      serviceId: 'haircut',
      priceCents: 4000,
      durationMinutes: 45,
      priceFrom: false,
      overridden: false,
    });
  });

  it('works for a record from before the field existed', () => {
    const old: PricedStaff = { id: 'old', serviceIds: ['haircut'] };
    expect(resolveServiceForStaff(haircut, old).priceCents).toBe(4000);
    expect(overrideFor(old, 'haircut')).toBeUndefined();
  });

  it('a price on its own keeps the shop time', () => {
    const line = resolveServiceForStaff(haircut, nelly);
    expect(line).toMatchObject({ priceCents: 4500, durationMinutes: 45, overridden: true });
  });

  it('a price and a time replace both', () => {
    const line = resolveServiceForStaff(haircut, dontrise);
    expect(line).toMatchObject({ priceCents: 5000, durationMinutes: 75, overridden: true });
  });

  it('one person\'s price is exact, never "from", even for a service the shop marks "from"', () => {
    // Haircut and Kids Cut are marked "from" on the shop menu.
    expect(resolveServiceForStaff(haircut, dontrise).priceFrom).toBe(false);
    expect(resolveServiceForStaff(haircut, lee).priceFrom).toBe(false);
    expect(resolveServiceForStaff(kids, drew).priceFrom).toBe(false);
    expect(resolveServiceForStaff(beard, lee).priceFrom).toBe(false);
  });

  it('an entry for another service changes nothing', () => {
    expect(resolveServiceForStaff(lineup, nelly)).toMatchObject({
      priceCents: 2000,
      durationMinutes: 20,
      overridden: false,
    });
  });
});

describe('quoteForStaff (an assigned or chosen person)', () => {
  it("sums that person's price and time across several services", () => {
    const quote = quoteForStaff([haircut, lineup], dontrise);
    expect(quote).toMatchObject({
      staffId: 'dontrise',
      totalCents: 8000,
      totalMinutes: 115,
      from: false,
    });
    expect(quote?.lines.map((l) => l.serviceId)).toEqual(['haircut', 'lineup']);
    expect(quote?.lines.every((l) => !l.priceFrom)).toBe(true);
  });

  it('mixed services: an overridden line next to a shop line', () => {
    const quote = quoteForStaff([kids, beard], drew);
    expect(quote?.lines.map((l) => [l.serviceId, l.priceCents, l.overridden])).toEqual([
      ['kids', 2500, true],
      ['beard', 4500, false],
    ]);
    expect(quote?.totalCents).toBe(7000);
    expect(quote?.totalMinutes).toBe(75);
    // Kids Cut is flagged "from" on the shop menu, but Drew's own price is exact.
    expect(quote?.from).toBe(false);
  });

  it('is never "from" for one person, flagged services or not', () => {
    expect(quoteForStaff([beard], lee)?.from).toBe(false);
    expect(quoteForStaff([haircut, kids], nelly)?.from).toBe(false);
  });

  it('is null when the person does not offer every service', () => {
    expect(quoteForStaff([haircut, beard], dontrise)).toBeNull();
    expect(offersService(dontrise, 'beard')).toBe(false);
  });

  it('an empty list is a zero quote', () => {
    expect(quoteForStaff([], lee)).toMatchObject({ totalCents: 0, totalMinutes: 0, from: false });
  });
});

describe('quoteFirstAvailable (no one chosen yet, or anyone available)', () => {
  it('takes the lowest total among the people who do every service, with their own time', () => {
    const quote = quoteFirstAvailable([haircut], [dontrise, lee, drew, nelly]);
    // Lee and Drew both charge 40 for 45 minutes; the lower display order wins the tie.
    expect(quote).toMatchObject({ staffId: 'lee', totalCents: 4000, totalMinutes: 45 });
  });

  it('is a "from" price when the people differ, even for a service the shop does not flag', () => {
    const plainKids = { ...kids, priceFrom: false };
    const quote = quoteFirstAvailable([plainKids], [dontrise, drew, lee, nelly]);
    expect(quote?.from).toBe(true);
    expect(quote?.lines[0]?.priceFrom).toBe(true);
    expect(quote?.totalCents).toBe(2000);
    // One person only: nothing to differ from, so the price is plain.
    expect(quoteFirstAvailable([solo], [dontrise])?.from).toBe(false);
  });

  it('keeps the shop "from" flag for first available, even with one person and one price', () => {
    const quote = quoteFirstAvailable([haircut], [lee]);
    expect(quote?.from).toBe(true);
    expect(quote?.lines[0]?.priceFrom).toBe(true);
    // The same person chosen by name: the exact price.
    expect(quoteForStaff([haircut], lee)?.from).toBe(false);
  });

  it('is a plain price when everyone offering it charges the same and the shop does not say from', () => {
    const quote = quoteFirstAvailable([beard], [lee, drew]);
    expect(quote).toMatchObject({ totalCents: 4500, from: false });
  });

  it('prices the combination, not each service alone', () => {
    // Nelly does not do the lineup, so only the people who do both are compared.
    const quote = quoteFirstAvailable([kids, lineup], [nelly, dontrise, drew, lee]);
    expect(quote?.staffId).toBe('lee');
    expect(quote?.totalCents).toBe(4000);
    expect(quote?.totalMinutes).toBe(50);
  });

  it('leaves out people who do not offer every service, and is null when nobody does', () => {
    expect(quoteFirstAvailable([beard], [dontrise, nelly])).toBeNull();
    expect(quoteFirstAvailable([beard], [])).toBeNull();
  });

  it('breaks a price tie by the shorter time, then display order', () => {
    const slow: PricedStaff = {
      id: 'slow',
      sortOrder: 0,
      serviceIds: ['haircut'],
      servicePrices: [{ serviceId: 'haircut', priceCents: 4000, durationMinutes: 60 }],
    };
    const quick: PricedStaff = { id: 'quick', sortOrder: 5, serviceIds: ['haircut'] };
    expect(quoteFirstAvailable([haircut], [slow, quick])?.staffId).toBe('quick');
    const same: PricedStaff = { id: 'same', sortOrder: 1, serviceIds: ['haircut'] };
    expect(quoteFirstAvailable([haircut], [quick, same])?.staffId).toBe('same');
  });
});

describe('quoteMove (the owner moves a booking to another chair)', () => {
  // Dontrise's own haircut as a booking stores it.
  const booked = [{ serviceId: 'haircut', priceCents: 5000, durationMinutes: 75 }];
  const shop = (id: string) => [haircut, lineup, kids, beard].find((s) => s.id === id);

  it("takes the new chair's own price and time, exact", () => {
    expect(quoteMove(booked, shop, nelly)).toMatchObject({
      staffId: 'nelly',
      totalCents: 4500,
      totalMinutes: 45,
      from: false,
    });
  });

  it("takes the shop's current price and time for a chair without its own", () => {
    expect(quoteMove(booked, shop, lee)).toMatchObject({ totalCents: 4000, totalMinutes: 45 });
  });

  it('the reverse: a shop priced booking moved to the chair with an override', () => {
    const atShop = [{ serviceId: 'haircut', priceCents: 4000, durationMinutes: 45 }];
    expect(quoteMove(atShop, shop, dontrise)).toMatchObject({ totalCents: 5000, totalMinutes: 75 });
  });

  it('falls back to the booked line when the service record no longer loads', () => {
    expect(quoteMove(booked, () => undefined, lee)).toMatchObject({
      totalCents: 5000,
      totalMinutes: 75,
    });
  });

  it('is null when the chair does not do every service', () => {
    expect(
      quoteMove([{ serviceId: 'beard', priceCents: 4500, durationMinutes: 45 }], shop, nelly),
    ).toBeNull();
  });
});

describe('menuPrice (the price list)', () => {
  it('shows the lowest price as "from" where the people differ, with that person\'s time', () => {
    expect(menuPrice(lineup, [dontrise, lee, drew])).toMatchObject({
      priceCents: 2000,
      durationMinutes: 20,
      priceFrom: true,
    });
  });

  it('shows a plain price where one person does it and the shop does not say from', () => {
    expect(menuPrice(solo, [dontrise, lee])).toMatchObject({
      priceCents: 4000,
      durationMinutes: 90,
      priceFrom: false,
      overridden: true,
    });
  });

  it('honours the shop from flag even when everyone charges the same', () => {
    expect(menuPrice(haircut, [lee])).toMatchObject({ priceCents: 4000, priceFrom: true });
  });

  it('a service nobody offers keeps the shop price and time', () => {
    expect(menuPrice(beard, [dontrise])).toEqual({
      serviceId: 'beard',
      priceCents: 4500,
      durationMinutes: 45,
      priceFrom: false,
      overridden: false,
    });
    expect(menuPrice(beard, [])).toMatchObject({ priceCents: 4500 });
  });
});

describe('invalid input', () => {
  it('ignores an entry that cannot be a price and falls back to the shop price', () => {
    const damaged: PricedStaff = {
      id: 'x',
      serviceIds: ['haircut', 'lineup', 'kids'],
      servicePrices: [
        { serviceId: 'haircut', priceCents: -100 },
        { serviceId: 'lineup', priceCents: 12.5 },
        { serviceId: 'kids', priceCents: Number.NaN },
      ],
    };
    expect(resolveServiceForStaff(haircut, damaged)).toMatchObject({ priceCents: 4000 });
    expect(resolveServiceForStaff(lineup, damaged)).toMatchObject({ priceCents: 2000 });
    expect(resolveServiceForStaff(kids, damaged)).toMatchObject({
      priceCents: 2000,
      overridden: false,
    });
  });

  it('ignores a time that cannot be minutes and keeps the entry price', () => {
    const odd: PricedStaff = {
      id: 'x',
      serviceIds: ['haircut'],
      servicePrices: [{ serviceId: 'haircut', priceCents: 5000, durationMinutes: 0 }],
    };
    expect(resolveServiceForStaff(haircut, odd)).toMatchObject({
      priceCents: 5000,
      durationMinutes: 45,
    });
  });

  it('with two entries for one service the first wins', () => {
    const twice: PricedStaff = {
      id: 'x',
      serviceIds: ['haircut'],
      servicePrices: [
        { serviceId: 'haircut', priceCents: 5000 },
        { serviceId: 'haircut', priceCents: 9000 },
      ],
    };
    expect(resolveServiceForStaff(haircut, twice).priceCents).toBe(5000);
  });

  it('reports duplicates and services the person does not offer', () => {
    expect(servicePriceIssues(['haircut'], [{ serviceId: 'haircut', priceCents: 1 }])).toEqual([]);
    expect(
      servicePriceIssues(
        ['haircut'],
        [
          { serviceId: 'haircut', priceCents: 1 },
          { serviceId: 'haircut', priceCents: 2 },
        ],
      ),
    ).toEqual([{ path: [1, 'serviceId'], message: 'Only one price per service' }]);
    expect(servicePriceIssues(['haircut'], [{ serviceId: 'beard', priceCents: 1 }])).toEqual([
      { path: [0, 'serviceId'], message: 'This person does not offer that service' },
    ]);
  });

  it('prunes the prices of services that left the menu', () => {
    const kept = pruneServicePrices(['haircut', 'kids'], dontrise.servicePrices ?? []);
    expect(kept.map((p) => p.serviceId)).toEqual(['haircut', 'kids']);
  });
});
