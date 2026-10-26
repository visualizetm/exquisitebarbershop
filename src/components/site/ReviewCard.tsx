import type { PublicReview } from '@shared/api/public';
import { reviewMonth, reviewSourceLabel } from '@shared/lib/reviews';
import { Card } from '@/components/ui';
import { Stars } from './Stars';

type ReviewCardData = Pick<PublicReview, 'name' | 'text' | 'stars' | 'source' | 'date'>;

/**
 * One real review: its stars, the quote word for word, the name, where it was posted and, when the
 * source gives one, the month and year. A list item, so it always sits in a ReviewList.
 * States (on the figure): dated, undated (theCut gives no exact date, so none is shown).
 */
export function ReviewCard({ review }: { review: ReviewCardData }) {
  const month = reviewMonth(review.date);
  const source = reviewSourceLabel(review.source);
  return (
    <Card as="li" className="exq-review" data-source={review.source}>
      <figure className="exq-review__figure" data-state={month ? 'dated' : 'undated'}>
        <p className="exq-review__stars">
          <Stars value={review.stars} size="sm" />
          <span className="exq-visually-hidden">Rated {String(review.stars)} out of 5</span>
        </p>
        <blockquote className="exq-review__quote">
          <p>{review.text}</p>
        </blockquote>
        <figcaption className="exq-review__by">
          <span className="exq-review__name">{review.name}</span>
          <span className="exq-review__meta">
            {source}
            {month ? <>, {month}</> : null}
          </span>
        </figcaption>
      </figure>
    </Card>
  );
}

/** Review cards in a row of up to three (one column on phones). */
export function ReviewList({ reviews }: { reviews: readonly (ReviewCardData & { id: string })[] }) {
  return (
    <ul className="exq-reviews exq-bare" data-count={String(reviews.length)}>
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} />
      ))}
    </ul>
  );
}
