import { useId, useState } from 'react';
import type { SyntheticEvent } from 'react';
import ArrowDown from '@untitled-ui/icons-react/build/esm/ArrowDown';
import ArrowUp from '@untitled-ui/icons-react/build/esm/ArrowUp';
import type { ReviewsRequest } from '@shared/api/admin';
import {
  googleRatingText,
  HOME_REVIEWS,
  reviewMonth,
  reviewSourceLabel,
  shownReviews,
} from '@shared/lib/reviews';
import type { GoogleSettings, ReviewItem } from '@shared/schemas/shopSettings';
import { Button, Checkbox, EmptyState, IconButton, Input } from '@/components/ui';
import { ErrorNote } from '../components/ErrorNote';

/** Saves one change. `done` is the line the caller shows in the toast once it is saved. */
export type ReviewsSave = (change: ReviewsRequest, done: string) => Promise<void>;

/**
 * Website, Reviews: the switch for the whole section, the Google rating copied by hand, and every
 * review with Show or Hide and the arrows to order them. Reviews are never typed here: they come
 * with the shop's data, word for word, so every quote on the site stays real. `onSave` does the
 * saving (the Website tab sends it, the kit fakes it).
 */
export function ReviewsEditor({
  enabled,
  google,
  items,
  staffNames = {},
  onSave,
}: {
  enabled: boolean;
  google: GoogleSettings;
  items: readonly ReviewItem[];
  /** Chair names by id, for "about Drew". */
  staffNames?: Record<string, string>;
  onSave: ReviewsSave;
}) {
  return (
    <div className="exq-reviewsedit">
      <SiteForm
        // A new key after a save starts the form from what is stored.
        key={JSON.stringify([enabled, google.rating, google.reviewCount, google.ratingCheckedOn])}
        enabled={enabled}
        google={google}
        onSave={onSave}
      />
      <ReviewRows enabled={enabled} items={items} staffNames={staffNames} onSave={onSave} />
    </div>
  );
}

interface SiteDraft {
  enabled: boolean;
  rating: string;
  count: string;
  checkedOn: string;
}

function parseSite(draft: SiteDraft) {
  const errors: { rating?: string; count?: string } = {};
  const ratingText = draft.rating.trim();
  const rating = ratingText === '' ? 0 : Number(ratingText);
  if (
    !Number.isFinite(rating) ||
    rating < 0 ||
    rating > 5 ||
    Math.abs(rating * 10 - Math.round(rating * 10)) > 1e-9
  ) {
    errors.rating = 'A number from 1 to 5 with at most one decimal, for example 4.7';
  }
  const countText = draft.count.trim();
  const reviewCount = countText === '' ? 0 : Number(countText);
  if (!Number.isInteger(reviewCount) || reviewCount < 0 || reviewCount > 100_000) {
    errors.count = 'A whole number, 0 or more';
  }
  if (!errors.rating && !errors.count && reviewCount > 0 && rating < 1) {
    errors.rating = 'Add the rating, or set the number of reviews to 0';
  }
  return { rating, reviewCount, errors };
}

function SiteForm({
  enabled,
  google,
  onSave,
}: {
  enabled: boolean;
  google: GoogleSettings;
  onSave: ReviewsSave;
}) {
  const initial: SiteDraft = {
    enabled,
    rating: google.rating > 0 ? String(google.rating) : '',
    count: google.reviewCount > 0 ? String(google.reviewCount) : '',
    checkedOn: google.ratingCheckedOn,
  };
  const [draft, setDraft] = useState(initial);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const parsed = parseSite(draft);
  const invalid = parsed.errors.rating !== undefined || parsed.errors.count !== undefined;
  const changed =
    draft.enabled !== enabled ||
    parsed.rating !== google.rating ||
    parsed.reviewCount !== google.reviewCount ||
    draft.checkedOn !== google.ratingCheckedOn;
  const preview = invalid ? null : googleRatingText(parsed);
  const headingId = useId();

  const set = <K extends keyof SiteDraft>(key: K, value: SiteDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  async function save(event: SyntheticEvent) {
    event.preventDefault();
    if (invalid || !changed) return;
    setWorking(true);
    setError(null);
    try {
      await onSave(
        {
          enabled: draft.enabled,
          google: {
            rating: parsed.rating,
            reviewCount: parsed.reviewCount,
            ratingCheckedOn: draft.checkedOn,
          },
        },
        draft.enabled
          ? 'Reviews saved. The site shows them right away.'
          : 'Reviews saved and switched off. No review shows on the site.',
      );
    } catch (err) {
      setError(err);
    } finally {
      setWorking(false);
    }
  }

  return (
    <form
      className="exq-panelbody"
      onSubmit={(e) => void save(e)}
      aria-labelledby={headingId}
      data-state={working ? 'saving' : invalid ? 'invalid' : changed ? 'changed' : 'idle'}
    >
      <h2 id={headingId} className="exq-bsheet__h">
        On the site
      </h2>
      <Checkbox
        label="Show reviews on Home and the chair pages"
        checked={draft.enabled}
        disabled={working}
        onChange={(e) => {
          set('enabled', e.target.checked);
        }}
      />
      <p className="exq-muted">
        Copy the rating and the number of reviews from the shop&apos;s Google profile. Google offers
        no free feed, so they change only when they are saved here.
      </p>
      <div className="exq-panelbody__row">
        <Input
          label="Google rating"
          hint="For example 4.7"
          inputMode="decimal"
          autoComplete="off"
          disabled={working}
          value={draft.rating}
          error={parsed.errors.rating}
          onChange={(e) => {
            set('rating', e.target.value);
          }}
        />
        <Input
          label="Number of reviews"
          inputMode="numeric"
          autoComplete="off"
          disabled={working}
          value={draft.count}
          error={parsed.errors.count}
          onChange={(e) => {
            set('count', e.target.value);
          }}
        />
        <Input
          label="Checked on"
          type="date"
          disabled={working}
          value={draft.checkedOn}
          onChange={(e) => {
            set('checkedOn', e.target.value);
          }}
        />
      </div>
      <p className="exq-reviewsedit__preview" data-state={preview ? 'rated' : 'unrated'}>
        {preview
          ? `The site says: ${preview}.`
          : 'No rating line shows until a rating and the number of reviews are set.'}
      </p>
      <ErrorNote error={error} />
      <div>
        <Button
          type="submit"
          loading={working}
          disabled={working ? undefined : !changed || invalid}
        >
          Save
        </Button>
      </div>
    </form>
  );
}

function ReviewRows({
  enabled,
  items,
  staffNames,
  onSave,
}: {
  enabled: boolean;
  items: readonly ReviewItem[];
  staffNames: Record<string, string>;
  onSave: ReviewsSave;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const headingId = useId();
  const ordered = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  // The ones Home shows: the first three shown, while the section is on.
  const onHome = new Set(
    shownReviews({ enabled, items: ordered })
      .slice(0, HOME_REVIEWS)
      .map((r) => r.id),
  );

  async function send(next: readonly ReviewItem[], done: string) {
    setBusy(true);
    setError(null);
    try {
      await onSave({ items: next.map((r) => ({ id: r.id, show: r.show })) }, done);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, by: -1 | 1) {
    const next = [...ordered];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + by, 0, item);
    void send(next, 'Order saved. The site uses it right away.');
  }

  function toggle(review: ReviewItem) {
    const next = ordered.map((r) => (r.id === review.id ? { ...r, show: !r.show } : r));
    void send(
      next,
      review.show
        ? `The review by ${review.name} is hidden from the site.`
        : `The review by ${review.name} is back on the site.`,
    );
  }

  return (
    <section
      className="exq-panelbody"
      aria-labelledby={headingId}
      data-state={ordered.length === 0 ? 'empty' : enabled ? 'on' : 'off'}
    >
      <h2 id={headingId} className="exq-bsheet__h">
        Reviews
      </h2>
      {ordered.length === 0 ? (
        <EmptyState title="No reviews yet">
          Reviews come with the shop&apos;s data, word for word from Google and theCut. They cannot
          be typed in here, so every quote on the site stays real.
        </EmptyState>
      ) : (
        <>
          <p className="exq-muted">
            Word for word from Google and theCut, and they cannot be edited here. Home shows the
            first three that are shown; a chair page shows up to three about that chair.
            {enabled ? '' : ' The section is off, so none of them shows on the site right now.'}
          </p>
          <ol
            className="exq-reviewlist exq-bare"
            aria-label="Reviews, in the order the site shows them"
            data-busy={busy ? 'true' : 'false'}
          >
            {ordered.map((review, index) => {
              const month = reviewMonth(review.date);
              const about = review.staffId ? staffNames[review.staffId] : undefined;
              const meta = [
                reviewSourceLabel(review.source),
                month,
                about ? `about ${about}` : null,
              ].filter(Boolean);
              return (
                <li
                  key={review.id}
                  className="exq-reviewrow"
                  data-state={review.show ? 'shown' : 'hidden'}
                >
                  <div className="exq-reviewrow__body">
                    <strong>{review.name}</strong>
                    <span className="exq-reviewrow__meta">
                      {meta.join(', ')}, {String(review.stars)} of 5
                    </span>
                    <p className="exq-reviewrow__text">{review.text}</p>
                  </div>
                  <div className="exq-reviewrow__tags">
                    {review.show ? null : (
                      <span className="exq-status-chip" data-tone="muted">
                        Hidden
                      </span>
                    )}
                    {onHome.has(review.id) ? (
                      <span className="exq-status-chip" data-tone="ok">
                        On Home
                      </span>
                    ) : null}
                  </div>
                  <div className="exq-reviewrow__actions">
                    <IconButton
                      label={`Move the review by ${review.name} up`}
                      icon={<ArrowUp aria-hidden="true" />}
                      disabled={index === 0 || busy}
                      onClick={() => {
                        move(index, -1);
                      }}
                    />
                    <IconButton
                      label={`Move the review by ${review.name} down`}
                      icon={<ArrowDown aria-hidden="true" />}
                      disabled={index === ordered.length - 1 || busy}
                      onClick={() => {
                        move(index, 1);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      aria-label={`${review.show ? 'Hide' : 'Show'} the review by ${review.name}`}
                      onClick={() => {
                        toggle(review);
                      }}
                    >
                      {review.show ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
          <ErrorNote error={error} />
        </>
      )}
    </section>
  );
}
