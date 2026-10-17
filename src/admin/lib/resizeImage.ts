/** The long edge after the resize, and the WebP quality. */
export const MAX_EDGE = 2000;
export const WEBP_QUALITY = 0.82;

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
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot resize images');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('This browser cannot encode WebP'));
      },
      'image/webp',
      WEBP_QUALITY,
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
