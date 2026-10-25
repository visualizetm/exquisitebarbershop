import { cloudinarySrcSet, cloudinaryUrl, type PhotoRatio } from '@shared/lib/cloudinary';
import type { Photo } from '@/components/ui/PhotoFrame';

/**
 * The src and srcset for a photo in a frame of the given shape. Cloudinary photos get four
 * widths cropped to the frame; anything else (local files, GridFS, R2) uses its one URL.
 */
export function photoSources(
  photo: Photo,
  ratio: PhotoRatio,
): { src: string; srcSet: string | undefined } {
  if (!photo.delivery) return { src: photo.url, srcSet: undefined };
  return {
    src: cloudinaryUrl(photo.delivery, 800, ratio),
    srcSet: cloudinarySrcSet(photo.delivery, ratio),
  };
}
