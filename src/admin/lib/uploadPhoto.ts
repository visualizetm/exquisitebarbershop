import {
  adminPhotoResponseSchema,
  uploadUrlResponseSchema,
  type AdminPhotoView,
} from '@shared/api/photos';
import type { PhotoKind } from '@shared/schemas/photo';
import { apiRequest } from '@/lib/api';
import { postWithProgress, prepareImage, putWithProgress } from './resizeImage';

export type UploadPhase = 'preparing' | 'uploading' | 'confirming';

/**
 * The whole upload of one photo: shrink and re-encode in the browser, ask the server where to
 * send it, send it (to storage directly), then confirm with the alt text. Reports the phase and
 * the upload fraction so the screen can say what is happening.
 */
export async function uploadPhoto(
  file: File,
  input: { kind: PhotoKind; staffId?: string | undefined; alt: string },
  onPhase: (phase: UploadPhase, fraction?: number) => void,
): Promise<AdminPhotoView> {
  onPhase('preparing');
  const prepared = await prepareImage(file);
  const issued = await apiRequest('/api/admin/photos/upload-url', uploadUrlResponseSchema, {
    method: 'POST',
    body: {
      kind: input.kind,
      ...(input.staffId ? { staffId: input.staffId } : {}),
      contentType: 'image/webp',
      size: prepared.blob.size,
    },
  });
  onPhase('uploading', 0);
  const onProgress = (fraction: number) => {
    onPhase('uploading', fraction);
  };
  let sent: { width: number; height: number; cloudinary?: object } = {
    width: prepared.width,
    height: prepared.height,
  };
  if (issued.method === 'POST') {
    // Cloudinary: a signed form straight to Cloudinary; what it returns goes to the confirm step.
    const result = await postWithProgress(
      issued.uploadUrl,
      issued.fields ?? {},
      prepared.blob,
      onProgress,
    );
    sent = {
      width: result.width,
      height: result.height,
      cloudinary: { publicId: result.publicId, version: result.version, bytes: result.bytes },
    };
  } else {
    await putWithProgress(issued.uploadUrl, issued.headers, prepared.blob, onProgress);
  }
  onPhase('confirming');
  const confirmed = await apiRequest('/api/admin/photos/confirm', adminPhotoResponseSchema, {
    method: 'POST',
    body: { ticket: issued.ticket, ...sent, alt: input.alt.trim() },
  });
  return confirmed.photo;
}
