import type { StorageDriver } from './types';

/**
 * Writes a photo from the server, whatever the driver: a plain `put` for R2, the local disk and
 * GridFS. Cloudinary takes no server `put`, so the signed upload form is posted from here, the
 * same form a browser posts. Used by the storage migration and the seed photo loader.
 */
export async function storePhotoBytes(
  storage: StorageDriver,
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  if (storage.name !== 'cloudinary') {
    await storage.put(key, bytes, contentType);
    return;
  }
  const upload = await storage.presignUpload({
    key,
    contentType,
    size: bytes.length,
    expiresInSeconds: 300,
  });
  if (upload.method !== 'POST') throw new Error('Unexpected upload method');
  const form = new FormData();
  for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
  form.append('file', new Blob([bytes], { type: contentType }), 'photo.webp');
  const res = await fetch(upload.url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Cloudinary answered ${String(res.status)}`);
}
