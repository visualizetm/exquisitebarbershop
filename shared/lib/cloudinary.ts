/**
 * Cloudinary delivery URLs. Pure, so the server (tests, migration) and the browser build
 * exactly the same address. Nothing here is secret: the cloud name is public.
 */

/** The widths of the srcset, in CSS pixels of the image box. */
export const CLOUDINARY_WIDTHS = [400, 800, 1200, 1600] as const;

/** The three frame shapes the site uses. Null delivers the photo uncropped. */
export type PhotoRatio = '4:5' | '1:1' | '16:9' | null;

export interface CloudinaryAsset {
  cloud: string;
  publicId: string;
}

/**
 * https://res.cloudinary.com/<cloud>/image/upload/f_auto,q_auto,c_fill,g_auto,w_<w>,ar_<ratio>/<public_id>
 * A null ratio keeps the whole photo (c_limit) for the lightbox.
 */
export function cloudinaryUrl(asset: CloudinaryAsset, width: number, ratio: PhotoRatio): string {
  const transform = ['f_auto', 'q_auto'];
  if (ratio) transform.push('c_fill', 'g_auto', `w_${width}`, `ar_${ratio}`);
  else transform.push('c_limit', `w_${width}`);
  return `https://res.cloudinary.com/${asset.cloud}/image/upload/${transform.join(',')}/${asset.publicId}`;
}

/** "url 400w, url 800w, ..." for an img srcset. */
export function cloudinarySrcSet(
  asset: CloudinaryAsset,
  ratio: PhotoRatio,
  widths: readonly number[] = CLOUDINARY_WIDTHS,
): string {
  return widths.map((w) => `${cloudinaryUrl(asset, w, ratio)} ${String(w)}w`).join(', ');
}
