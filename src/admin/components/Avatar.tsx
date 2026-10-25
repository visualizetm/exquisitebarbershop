import type { PhotoView } from '@shared/api/photos';
import { initialsOf } from '@/lib/initials';

/** A chair's photo, or their initials in an ink circle until one is uploaded. */
export function Avatar({ name, photo }: { name: string; photo: PhotoView | null | undefined }) {
  return (
    <span className="exq-chairrow__avatar" aria-hidden="true">
      {photo ? (
        <img src={photo.url} alt="" width={44} height={44} loading="lazy" />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
