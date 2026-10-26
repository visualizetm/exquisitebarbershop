import { useEffect, useRef, useState } from 'react';
import type { CloudinaryAsset } from '@shared/lib/cloudinary';
import { photoSources } from '@/lib/photoSources';
import { Mark } from './Mark';

export interface Photo {
  url: string;
  width: number;
  height: number;
  alt: string;
  /** Set when the photo lives on Cloudinary: the frame then asks for exact widths. */
  delivery?: CloudinaryAsset | null | undefined;
}

export type FrameRatio = '4:5' | '1:1' | '16:9';

/**
 * The photo frame, 4:5, 1:1 or 16:9, with a 4px radius. States: loading (the image is on its
 * way, a still block shows), loaded, and placeholder (no photo: a compact ink panel with the chair
 * number large, the name and the small Q mark, never a blank box). The ratio is fixed, so layout
 * never shifts.
 */
export function PhotoFrame({
  photo,
  name,
  ratio = '4:5',
  sizes = '(min-width: 1024px) 380px, 72vw',
  priority = false,
  chairNumber = null,
}: {
  photo: Photo | null;
  /** Used as a fallback alt. */
  name: string;
  ratio?: FrameRatio;
  sizes?: string;
  /** True for the one image above the fold; everything else lazy loads. */
  priority?: boolean;
  /** Shown large on the panel when there is no photo. */
  chairNumber?: number | null | undefined;
}) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // A cached image can finish before React attaches onLoad.
    if (ref.current?.complete) setLoaded(true);
  }, []);
  const state = photo ? (loaded ? 'loaded' : 'loading') : 'placeholder';
  const sources = photo ? photoSources(photo, ratio) : null;
  return (
    <span className="exq-photoframe" data-state={state} data-ratio={ratio}>
      {photo && sources ? (
        <img
          ref={ref}
          className="exq-photoframe__img"
          src={sources.src}
          srcSet={sources.srcSet}
          width={photo.width}
          height={photo.height}
          alt={photo.alt || name}
          sizes={sizes}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          onLoad={() => {
            setLoaded(true);
          }}
        />
      ) : (
        <span className="exq-photoframe__panel exq-dark" aria-hidden="true">
          {chairNumber !== null ? (
            <span className="exq-photoframe__number">{String(chairNumber).padStart(2, '0')}</span>
          ) : null}
          <span className="exq-photoframe__name">{name}</span>
          <Mark name="disc" width={28} height={28} className="exq-photoframe__mark" />
        </span>
      )}
    </span>
  );
}
