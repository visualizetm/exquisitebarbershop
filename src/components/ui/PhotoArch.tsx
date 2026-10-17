import { useState } from 'react';
import { initialsOf } from '@/lib/initials';

export interface Photo {
  url: string;
  width: number;
  height: number;
  alt: string;
}

/**
 * The arch photo frame. States: loading (image requested), loaded, and
 * placeholder (no photo: initials on a neutral block). Layout never shifts
 * because the frame has a fixed aspect ratio.
 */
export function PhotoArch({
  photo,
  name,
  tone = 'paper',
  sizes = '(min-width: 1024px) 280px, 72vw',
  priority = false,
}: {
  photo: Photo | null;
  /** Used for the initials placeholder and as a fallback alt. */
  name: string;
  tone?: 'paper' | 'ink';
  sizes?: string;
  /** True for the one image above the fold; everything else lazy loads. */
  priority?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const state = photo ? (loaded ? 'loaded' : 'loading') : 'placeholder';
  return (
    <span className="exq-arch" data-state={state} data-tone={tone}>
      {photo ? (
        <img
          className="exq-arch__img"
          src={photo.url}
          width={photo.width}
          height={photo.height}
          alt={photo.alt || name}
          sizes={sizes}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => {
            setLoaded(true);
          }}
        />
      ) : (
        <span className="exq-arch__placeholder" aria-hidden="true">
          {initialsOf(name)}
        </span>
      )}
    </span>
  );
}
