import { describe, expect, it } from 'vitest';
import {
  discountTag,
  launchOfferDiscount,
  launchOfferIsLive,
  totalAfterDiscounts,
} from '../../shared/lib/launchOffer';
import { DEFAULT_LAUNCH_OFFER } from '../../shared/schemas/shopSettings';

const OFFER = DEFAULT_LAUNCH_OFFER;
const first = {
  source: 'online' as const,
  priceCents: 4500,
  shopDate: '2026-10-27',
  alreadyUsed: false,
};

describe('launchOfferDiscount', () => {
  it('gives the first online booking the amount off', () => {
    expect(launchOfferDiscount(OFFER, first)).toEqual({
      code: 'LAUNCH10',
      amountCents: 1000,
      label: '$10 off your first online booking',
    });
  });
  it('a phone that already used it gets nothing', () => {
    expect(launchOfferDiscount(OFFER, { ...first, alreadyUsed: true })).toBeNull();
  });
  it('a cancelled first booking frees it (the caller reports it as unused)', () => {
    expect(launchOfferDiscount(OFFER, { ...first, alreadyUsed: false })).not.toBeNull();
  });
  it('under the minimum gets nothing', () => {
    expect(launchOfferDiscount(OFFER, { ...first, priceCents: 1999 })).toBeNull();
    expect(launchOfferDiscount(OFFER, { ...first, priceCents: 2000 })).not.toBeNull();
  });
  it('off gets nothing', () => {
    expect(launchOfferDiscount({ ...OFFER, enabled: false }, first)).toBeNull();
  });
  it('outside the dates gets nothing', () => {
    expect(launchOfferDiscount({ ...OFFER, startsOn: '2026-11-01' }, first)).toBeNull();
    expect(launchOfferDiscount({ ...OFFER, endsOn: '2026-10-26' }, first)).toBeNull();
    expect(
      launchOfferDiscount({ ...OFFER, startsOn: '2026-10-27', endsOn: '2026-10-27' }, first),
    ).not.toBeNull();
  });
  it('never a walk-in, NOW, or a booking the owner or a barber made', () => {
    for (const source of ['walkIn', 'owner', 'barber', 'phone'] as const) {
      expect(launchOfferDiscount(OFFER, { ...first, source })).toBeNull();
    }
  });
  it('never takes more than the price', () => {
    expect(
      launchOfferDiscount({ ...OFFER, minTotalCents: 0 }, { ...first, priceCents: 500 }),
    ).toMatchObject({ amountCents: 500 });
  });
  it('is live only while on and inside its dates', () => {
    expect(launchOfferIsLive(OFFER, '2026-10-27')).toBe(true);
    expect(launchOfferIsLive({ ...OFFER, amountCents: 0 }, '2026-10-27')).toBe(false);
  });
  it('totals and tags use integer cents', () => {
    const discounts = [{ code: 'LAUNCH10' as const, amountCents: 1000, label: 'x' }];
    expect(totalAfterDiscounts(4500, discounts)).toBe(3500);
    expect(totalAfterDiscounts(500, discounts)).toBe(0);
    expect(discountTag(discounts)).toBe('$10 off online');
    expect(discountTag([])).toBeNull();
    expect(discountTag(undefined)).toBeNull();
  });
});
