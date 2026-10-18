import { useSearchParams } from 'react-router';
import { galleryResponseSchema, type GalleryPhoto, type GalleryResponse } from '@shared/api/photos';
import { PhotoGrid } from '@/components/site/PhotoGrid';
import { Button, ButtonAnchor, ChipLink, Chips, EmptyState, ErrorState } from '@/components/ui';
import { Status } from '@/components/Status';
import { usePagedList } from '@/lib/usePagedList';
import { usePageMeta } from '@/lib/usePageTitle';

const pickPhotos = (page: GalleryResponse) => page.photos;

export function GalleryPage() {
  usePageMeta({
    title: 'The work',
    description:
      'Recent cuts and styles from the chairs at Exquisite Barber & Beauty Lounge in Brookhaven, PA.',
  });
  const [params] = useSearchParams();
  const staff = params.get('staff') ?? '';
  const query = new URLSearchParams({ limit: '30' });
  if (staff) query.set('staff', staff);
  const list = usePagedList<GalleryPhoto, GalleryResponse>(
    '/api/gallery',
    query.toString(),
    galleryResponseSchema,
    pickPhotos,
  );
  const first = list.page;

  return (
    <article
      className="exq-gallery exq-wrap exq-section"
      data-state={list.status === 'ready' && list.rows.length === 0 ? 'empty' : list.status}
    >
      <p className="exq-label">Gallery</p>
      <h1 className="exq-gallery__title">The work</h1>
      {first && first.counts.length > 0 ? (
        <Chips label="Filter by chair" scroll>
          <ChipLink to="/gallery" selected={staff === ''} count={first.total + (staff ? 0 : 0)}>
            All
          </ChipLink>
          {first.counts.map((c) => (
            <ChipLink
              key={c.staffId}
              to={`/gallery?staff=${encodeURIComponent(c.slug)}`}
              selected={staff === c.slug}
              count={c.count}
            >
              {c.name}
            </ChipLink>
          ))}
        </Chips>
      ) : null}
      {list.status === 'loading' ? <Status state="loading" /> : null}
      {list.status === 'error' ? (
        <ErrorState>We could not load the photos. Please try again.</ErrorState>
      ) : null}
      {list.status === 'ready' && list.rows.length === 0 ? (
        <EmptyState
          title="Photos are coming soon"
          action={
            <ButtonAnchor
              href="https://instagram.com/exquisitebarberbeauty"
              variant="outline"
              target="_blank"
              rel="noopener noreferrer"
            >
              See the latest on Instagram
            </ButtonAnchor>
          }
        >
          Follow @exquisitebarberbeauty for the latest work.
        </EmptyState>
      ) : null}
      {list.rows.length > 0 ? <PhotoGrid photos={list.rows} firstPriority /> : null}
      {list.hasMore ? (
        <p className="exq-gallery__more">
          <Button variant="outline" onClick={() => void list.loadMore()}>
            Load more
          </Button>
        </p>
      ) : null}
    </article>
  );
}
