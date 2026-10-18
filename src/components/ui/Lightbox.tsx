import { useEffect, useRef } from 'react';
import ChevronLeft from '@untitled-ui/icons-react/build/esm/ChevronLeft';
import ChevronRight from '@untitled-ui/icons-react/build/esm/ChevronRight';
import { photoSources } from '@/lib/photoSources';
import { Button, ButtonLink } from './Button';
import { Dialog } from './Dialog';
import type { Photo } from './PhotoFrame';

export interface LightboxPhoto extends Photo {
  id: string;
  /** The barber who did the work, when known. */
  barber?: { name: string; slug: string } | undefined;
}

/**
 * Photos in a dark dialog that scales in. On phones the photos sit in a snap-scrolling row, so a
 * swipe moves between them; the Prev and Next buttons do the same. The caption names the barber
 * and offers Book.
 */
export function Lightbox({
  photos,
  index,
  onClose,
  onIndex,
}: {
  photos: LightboxPhoto[];
  /** Null when closed. */
  index: number | null;
  onClose: () => void;
  onIndex: (next: number) => void;
}) {
  const open = index !== null && photos[index] !== undefined;
  // The last photo stays on screen while the dialog leaves.
  const lastIndex = useRef(0);
  if (index !== null) lastIndex.current = index;
  const shown = index ?? lastIndex.current;
  const photo = photos[shown];
  const track = useRef<HTMLDivElement>(null);
  // The index the track was last scrolled to by code, so the scroll handler can tell a swipe.
  const driven = useRef<number | null>(null);

  useEffect(() => {
    const el = track.current;
    if (!open || !el) return;
    if (driven.current === index) return;
    driven.current = index;
    el.scrollTo({ left: index * el.clientWidth, behavior: 'instant' });
  }, [open, index]);
  useEffect(() => {
    if (!open) driven.current = null;
  }, [open]);

  const onScroll = () => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next !== driven.current && photos[next]) {
      driven.current = next;
      onIndex(next);
    }
  };
  const go = (next: number) => {
    const el = track.current;
    if (!el) return;
    driven.current = next;
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    onIndex(next);
  };

  return (
    <Dialog
      variant="lightbox"
      open={open}
      size="lg"
      title={photo?.barber ? `By ${photo.barber.name}` : 'The work'}
      onClose={onClose}
    >
      {photo ? (
        <figure className="exq-lightbox__figure" data-state="open">
          <div className="exq-lightbox__track" ref={track} onScroll={onScroll}>
            {photos.map((p, i) => {
              const sources = photoSources(p, null);
              return (
                <div className="exq-lightbox__slide" key={p.id} aria-hidden={i !== shown}>
                  <img
                    className="exq-lightbox__img"
                    src={sources.src}
                    srcSet={sources.srcSet}
                    sizes="(min-width: 1024px) 1000px, 100vw"
                    width={p.width}
                    height={p.height}
                    alt={p.alt}
                    loading={Math.abs(i - shown) <= 1 ? 'eager' : 'lazy'}
                    decoding="async"
                  />
                </div>
              );
            })}
          </div>
          <figcaption className="exq-lightbox__caption">
            <span className="exq-lightbox__nav">
              <Button
                variant="onink"
                size="sm"
                aria-label="Previous photo"
                disabled={shown <= 0}
                onClick={() => {
                  go(shown - 1);
                }}
                icon={<ChevronLeft aria-hidden="true" />}
              >
                Prev
              </Button>
              <Button
                variant="onink"
                size="sm"
                aria-label="Next photo"
                disabled={shown >= photos.length - 1}
                onClick={() => {
                  go(shown + 1);
                }}
                icon={<ChevronRight aria-hidden="true" />}
              >
                Next
              </Button>
            </span>
            {photo.barber ? (
              <ButtonLink
                to={`/book?barber=${encodeURIComponent(photo.barber.slug)}`}
                variant="accent"
                size="sm"
              >
                Book {photo.barber.name}
              </ButtonLink>
            ) : (
              <ButtonLink to="/book" variant="accent" size="sm">
                Book a chair
              </ButtonLink>
            )}
          </figcaption>
        </figure>
      ) : null}
    </Dialog>
  );
}
