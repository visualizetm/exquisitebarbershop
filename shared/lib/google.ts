/**
 * Links built from the shop's Google place id. Plain links, no embed and no API key: the place
 * id is public information and the links open in the Google Maps app or site.
 */

/** Used when a caller has no shop name to hand. The shop settings name wins when it is known. */
const DEFAULT_QUERY_NAME = 'Exquisite Barber & Beauty Lounge';

/** The shop's Google Maps page. Every Directions button uses this link. */
export function googleMapsUrl(placeId: string, shopName: string = DEFAULT_QUERY_NAME): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shopName)}&query_place_id=${encodeURIComponent(placeId)}`;
}

/** Opens the "write a review" box for the shop on Google. */
export function googleReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}
