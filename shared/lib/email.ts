/**
 * The shop address in `seed/shop.ts` is a stand-in until the client has a real mailbox. A public
 * page must not print an address nobody reads, so the public shop API and the calendar file leave
 * it out while the stored value is still this one. Changing it in Settings makes it show.
 */
export const PLACEHOLDER_SHOP_EMAIL = 'hello@exquisitebarberbeauty.com';

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !email || email.trim().toLowerCase() === PLACEHOLDER_SHOP_EMAIL;
}

/** The address to show on a public page, or an empty string while it is still the stand-in. */
export function publicEmail(email: string | null | undefined): string {
  return isPlaceholderEmail(email) ? '' : (email ?? '').trim();
}
