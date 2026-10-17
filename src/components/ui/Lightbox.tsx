import ChevronLeft from '@untitled-ui/icons-react/build/esm/ChevronLeft';
import ChevronRight from '@untitled-ui/icons-react/build/esm/ChevronRight';
import { Button, ButtonLink } from './Button';
import type { Photo } from './PhotoArch';
import { Sheet } from './Sheet';

export interface LightboxPhoto extends Photo {
  id: string;
  /** The barber who did the work, when known. */
  barber?: { name: string; slug: string } | undefined;
}

/** A photo in a Sheet with the barber's name and a Book link. Arrow buttons move through the set. */
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
  const photo = index === null ? null : photos[index];
  const open = photo !== null && photo !== undefined;
  return (
    <Sheet
      open={open}
      size="lg"
      title={photo?.barber ? `By ${photo.barber.name}` : 'The work'}
      onClose={onClose}
    >
      {photo ? (
        <figure className="exq-lightbox__figure" data-state="open">
          <img
            className="exq-lightbox__img"
            src={photo.url}
            width={photo.width}
            height={photo.height}
            alt={photo.alt}
          />
          <figcaption className="exq-lightbox__caption">
            <span className="exq-lightbox__nav">
              <Button
                variant="secondary"
                size="sm"
                aria-label="Previous photo"
                disabled={index === null || index <= 0}
                onClick={() => {
                  if (index !== null) onIndex(index - 1);
                }}
                icon={<ChevronLeft aria-hidden="true" />}
              >
                Prev
              </Button>
              <Button
                variant="secondary"
                size="sm"
                aria-label="Next photo"
                disabled={index === null || index >= photos.length - 1}
                onClick={() => {
                  if (index !== null) onIndex(index + 1);
                }}
                icon={<ChevronRight aria-hidden="true" />}
              >
                Next
              </Button>
            </span>
            {photo.barber ? (
              <ButtonLink to={`/book?barber=${encodeURIComponent(photo.barber.slug)}`} size="sm">
                Book {photo.barber.name}
              </ButtonLink>
            ) : (
              <ButtonLink to="/book" size="sm">
                Book a chair
              </ButtonLink>
            )}
          </figcaption>
        </figure>
      ) : null}
    </Sheet>
  );
}
