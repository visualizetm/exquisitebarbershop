/**
 * Which photos the "work" sections show. Pure, so the rules are unit tested.
 *
 * Home's "the work" asks for the gallery in Home order (the photos the shop picked first). It shows
 * the full six (two by three on phones, three by two from 768px) or, with three to five, one row of
 * three, so the grid never ends on a half row. With fewer than three the section stays out instead
 * of looking half empty, until more photos arrive.
 */
export const HOME_WORK_MIN = 3;
export const HOME_WORK_MAX = 6;
/** How many shop photos a chair page shows, labeled "From the shop", when none are credited to it. */
export const SHOP_WORK_MAX = 3;

export function homeWork<T>(photos: readonly T[]): T[] {
  if (photos.length >= HOME_WORK_MAX) return photos.slice(0, HOME_WORK_MAX);
  return photos.length >= HOME_WORK_MIN ? photos.slice(0, HOME_WORK_MIN) : [];
}

/**
 * A chair page's work strip: the photos credited to that chair; when there are none, up to three
 * shop photos; when the shop has none either, nothing (the section is left out). Null while the
 * chair's own photos are still loading, so the shop photos never flash in first.
 */
export function chairWork<T>(
  own: readonly T[] | null,
  shop: readonly T[] | null,
): { source: 'own' | 'shop'; photos: T[] } | null {
  if (own === null) return null;
  if (own.length > 0) return { source: 'own', photos: [...own] };
  if (!shop || shop.length === 0) return null;
  return { source: 'shop', photos: shop.slice(0, SHOP_WORK_MAX) };
}
