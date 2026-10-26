import { describe, expect, it } from 'vitest';
import { servicesSeed, serviceSeedId, staffSeed, staffSeedId } from '../../seed/shop';
import type { PublicService, PublicStaff } from '../../shared/api/public';
import { priceLabel } from '../../shared/lib/money';
import { bookingQuote, chairServices, menuServices } from '../../src/lib/menuPrices';

/*
 * The price text the pages print, from the real seed (seed/shop.ts). A barber's own page, and a
 * barber chosen in booking, print that barber's exact price: never "From", whatever the shop menu's
 * "from" flag says. "From" belongs to the shop-wide list (/services, the Home teaser) and to first
 * available.
 */
const services: PublicService[] = servicesSeed.map((s) => ({
  id: serviceSeedId(s.key),
  name: s.input.name,
  group: s.input.group,
  description: s.input.description,
  priceCents: s.input.priceCents,
  priceFrom: s.input.priceFrom,
  durationMinutes: s.input.durationMinutes,
  sortOrder: s.input.sortOrder,
}));
const staff: PublicStaff[] = staffSeed.map((m) => ({
  id: staffSeedId(m.key),
  slug: m.input.slug,
  name: m.input.name,
  role: m.input.role,
  title: m.input.title,
  specialty: m.input.specialty,
  bio: m.input.bio,
  chairNumber: m.input.chairNumber,
  serviceIds: m.input.serviceIds,
  servicePrices: m.input.servicePrices ?? [],
  photoUrl: m.input.photoUrl,
  instagramHandle: m.input.instagramHandle,
  acceptsOnlineBooking: m.input.acceptsOnlineBooking,
  sortOrder: m.input.sortOrder,
}));
const person = (slug: string): PublicStaff => {
  const found = staff.find((s) => s.slug === slug);
  if (!found) throw new Error(slug);
  return found;
};
const byName = (list: PublicService[], name: string): PublicService => {
  const found = list.find((s) => s.name === name);
  if (!found) throw new Error(name);
  return found;
};
/** The row text of a chair page: "<name>, <minutes> min, <price>". */
const chairRows = (slug: string) =>
  chairServices(services, person(slug)).map(
    (s) => `${s.name}, ${String(s.durationMinutes)} min, ${priceLabel(s)}`,
  );

describe('the chair page price text (/chairs/:slug)', () => {
  it("prints Drew's own flat prices, never From, though the shop menu marks them from", () => {
    const rows = chairRows('drew');
    expect(rows).toContain('Haircut, 45 min, $40');
    expect(rows).toContain('Kids Cut, 30 min, $25');
    expect(rows).toContain('Lineup, 20 min, $20');
    expect(rows).toContain('Color and Cut, 90 min, $65');
    expect(rows.join('\n')).not.toMatch(/From/);
  });

  it("prints Dontrise's overrides with his own times, exact", () => {
    const rows = chairRows('dontrise');
    expect(rows).toContain('Haircut, 75 min, $50');
    expect(rows).toContain('Color and Cut, 180 min, $100');
    expect(rows.join('\n')).not.toMatch(/From/);
  });

  it('is exact for every chair', () => {
    for (const member of staff) {
      for (const s of chairServices(services, member)) {
        expect(s.priceFrom, `${member.slug} ${s.name}`).toBe(false);
        expect(priceLabel(s)).not.toMatch(/^From/);
      }
    }
  });
});

describe('"From" stays on the shop-wide list and on first available', () => {
  it('/services: the lowest price, "From" where the shop says so or the barbers differ', () => {
    const menu = menuServices(services, staff);
    expect(priceLabel(byName(menu, 'Haircut'))).toBe('From $40');
    expect(priceLabel(byName(menu, 'Kids Cut'))).toBe('From $20');
    expect(priceLabel(byName(menu, 'Haircut and Beard'))).toBe('$45');
  });

  it('booking: a chosen barber is exact, first available is "From"', () => {
    const haircut = byName(services, 'Haircut');
    const bookable = staff.filter((s) => s.acceptsOnlineBooking);
    const chosen = bookingQuote([haircut], person('nelly'), bookable);
    expect(chosen.quote).toMatchObject({ totalCents: 4500, from: false });
    expect(priceLabel(chosen.services[0] ?? haircut)).toBe('$45');
    const anyone = bookingQuote([haircut], null, bookable);
    expect(anyone.quote).toMatchObject({ totalCents: 4000, from: true });
    expect(priceLabel(anyone.services[0] ?? haircut)).toBe('From $40');
  });
});
