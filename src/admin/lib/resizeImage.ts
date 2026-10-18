/** The long edge after the resize, and the WebP quality. */
export const MAX_EDGE = 2000;
export const WEBP_QUALITY = 0.82;
/** The largest photo the site stores (the showcase keeps photos in MongoDB). */
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
/** Tried in order until the encoded photo fits: first the normal 2000px WebP, then lighter ones. */
const ATTEMPTS = [
  { edge: MAX_EDGE, quality: WEBP_QUALITY },
  { edge: MAX_EDGE, quality: 0.7 },
  { edge: MAX_EDGE, quality: 0.55 },
  { edge: 1600, quality: 0.6 },
  { edge: 1200, quality: 0.6 },
];

export interface Prepared {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Resizes a picked file to at most 2000px on its long edge and re-encodes it as
 * WebP. Drawing through a canvas drops EXIF and location data; the browser
 * applies the orientation tag before we draw, so the result stands upright.
 */
export async function prepareImage(file: File): Promise<Prepared> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    for (const attempt of ATTEMPTS) {
      const prepared = await encode(bitmap, attempt.edge, attempt.quality);
      if (prepared.blob.size <= MAX_UPLOAD_BYTES) return prepared;
    }
  } finally {
    bitmap.close();
  }
  throw new Error('That photo is still over 3 MB after resizing. Please choose a smaller one.');
}

async function encode(bitmap: ImageBitmap, edge: number, quality: number): Promise<Prepared> {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot resize images');
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('This browser cannot encode WebP'));
      },
      'image/webp',
      quality,
    );
  });
  return { blob, width, height };
}

/** PUTs the bytes with progress, through XHR because fetch has no upload progress. */
export function putWithProgress(
  url: string,
  headers: Record<string, string>,
  blob: Blob,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with ${String(xhr.status)}`));
    };
    xhr.onerror = () => {
      reject(new Error('Upload failed'));
    };
    xhr.send(blob);
  });
}
