import { useState } from 'react';
import type { GalleryPhoto } from '@shared/api/photos';
import { Lightbox } from '@/components/ui';

/**
 * Gallery photos in a grid, each opening the Lightbox. Images carry their
 * dimensions and lazy load, so the grid never shifts as they arrive.
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
        className="exq-photo-grid"
        data-layout={columns}
        data-state={index === null ? 'idle' : 'open'}
      >
        {photos.map((photo, i) => (
          <li key={photo.id} className="exq-photo-grid__item">
            <button
              type="button"
              className="exq-photo-grid__button"
              aria-label={`Open photo: ${photo.alt}`}
              onClick={() => {
                setIndex(i);
              }}
            >
              <img
                src={photo.url}
                width={photo.width}
                height={photo.height}
                alt={photo.alt}
                loading={firstPriority && i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                sizes="(min-width: 1024px) 380px, 50vw"
              />
            </button>
          </li>
        ))}
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
