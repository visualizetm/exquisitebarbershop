import { PLACEHOLDER_SHOP_EMAIL } from '../../seed/shop';

/**
 * The shop address in `seed/shop.ts` is a stand-in until the client has a real mailbox. A public
 * page must not print an address nobody reads, so the public shop API and the calendar file leave
 * it out while the stored value is still that one. Changing it in Settings makes it show. The value
 * itself lives in the seed with the other PLACEHOLDER values (hard rule 9); this only compares.
 */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !email || email.trim().toLowerCase() === PLACEHOLDER_SHOP_EMAIL.toLowerCase();
}

/** The address to show on a public page, or an empty string while it is still the stand-in. */
export function publicEmail(email: string | null | undefined): string {
  return isPlaceholderEmail(email) ? '' : (email ?? '').trim();
}
