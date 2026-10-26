import type { GoogleSettings } from '@shared/schemas/shopSettings';
import { googleMapsUrl, googleReviewUrl } from '@shared/lib/google';
import { googleRatingText } from '@shared/lib/reviews';
import { Stars } from './Stars';

/**
 * "4.7 on Google from 15 reviews" with the stars, then "Read them on Google" and "Leave a review".
 * Every number comes from the settings the owner keeps (Website, Reviews), never from the code.
 * States: rated (a rating is set), unrated (no rating yet, the links only). With neither a rating
 * nor a place id there is nothing to say, and it renders nothing.
 */
export function RatingLine({ google, shopName }: { google: GoogleSettings; shopName?: string }) {
  const text = googleRatingText(google);
  const placeId = google.placeId;
  if (!text && !placeId) return null;
  return (
    <div className="exq-ratingline" data-state={text ? 'rated' : 'unrated'}>
      {text ? (
        <p className="exq-ratingline__score">
          <Stars value={google.rating} />
          <span className="exq-ratingline__text">{text}</span>
        </p>
      ) : null}
      {placeId ? (
        <p className="exq-ratingline__links">
          <a
            className="exq-link-row"
            href={googleMapsUrl(placeId, shopName)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read them on Google
            <span className="exq-visually-hidden"> (opens in a new tab)</span>
          </a>
          <a
            className="exq-link-row"
            href={googleReviewUrl(placeId)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Leave a review
            <span className="exq-visually-hidden"> (opens in a new tab)</span>
          </a>
        </p>
      ) : null}
    </div>
  );
}
