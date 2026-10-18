import { useState } from 'react';
import type { GalleryPhoto } from '@shared/api/photos';
import { Lightbox, Reveal } from '@/components/ui';
import { photoSources } from '@/lib/photoSources';

/**
 * Gallery photos in a grid, each opening the Lightbox. Tiles are square, carry their dimensions and
 * lazy load, so the grid never shifts; each tile rises in once and its photo wipes up.
 */
export function PhotoGrid({
  photos,
  columns = 'gallery',
  firstPriority = false,
}: {
  photos: GalleryPhoto[];
  /** "work": 2 by 3 on phones, 3 by 2 on desktop. "gallery": 2 then 3 columns. */
  columns?: 'work' | 'gallery';
  firstPriority?: boolean;
}) {
  const [index, setIndex] = useState<number | null>(null);
  return (
    <>
      <ul
        className="exq-photo-grid exq-bare"
        data-layout={columns}
        data-state={index === null ? 'idle' : 'open'}
      >
        {photos.map((photo, i) => {
          const sources = photoSources(photo, '1:1');
          return (
            <Reveal as="li" key={photo.id} className="exq-photo-grid__item">
              <button
                type="button"
                className="exq-photo-grid__button"
                aria-label={`Open photo: ${photo.alt}`}
                onClick={() => {
                  setIndex(i);
                }}
              >
                <Reveal as="span" kind="wipe" className="exq-photoframe" data-ratio="1:1">
                  <img
                    className="exq-photoframe__img"
                    src={sources.src}
                    srcSet={sources.srcSet}
                    width={photo.width}
                    height={photo.height}
                    alt={photo.alt}
                    loading={firstPriority && i === 0 ? 'eager' : 'lazy'}
                    fetchPriority={firstPriority && i === 0 ? 'high' : undefined}
                    decoding="async"
                    sizes="(min-width: 1024px) 380px, 50vw"
                  />
                </Reveal>
              </button>
            </Reveal>
          );
        })}
      </ul>
      <Lightbox
        photos={photos.map((p) => ({ ...p, barber: p.staff ?? undefined }))}
        index={index}
        onClose={() => {
          setIndex(null);
        }}
        onIndex={setIndex}
      />
    </>
  );
}
