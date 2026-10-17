import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { photoKeySchema } from '../../shared/schemas/photo';
import type { PresignedUpload, StorageDriver, StoredObject } from './types';

/** Local uploads live here, relative to the working directory. Git ignores it. */
export const LOCAL_UPLOADS_DIR = resolve('.data', 'uploads');
export const LOCAL_UPLOAD_PATH = '/uploads';

export interface LocalConfig {
  /** The site origin, so the PUT and public URLs point at the dev server. */
  baseUrl: string;
  /** Signs the short-lived PUT URLs. */
  secret: string;
}

function signature(secret: string, key: string, exp: number): string {
  return createHmac('sha256', secret).update(`${key}:${exp}`).digest('base64url');
}

/** True when the PUT URL for `key` was issued by this server and has not expired. */
export function verifyLocalUploadSignature(
  secret: string,
  key: string,
  exp: string | null,
  sig: string | null,
  now: Date = new Date(),
): boolean {
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) * 1000 < now.getTime()) return false;
  const expected = signature(secret, key, Number(exp));
  return expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

/** Keys are validated before they touch the file system, so no path can escape the folder. */
export function localPathFor(key: string): string {
  const parsed = photoKeySchema.safeParse(key);
  if (!parsed.success) throw new Error('Invalid object key');
  return join(LOCAL_UPLOADS_DIR, ...parsed.data.split('/'));
}

export async function writeLocalObject(
  key: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  const path = localPathFor(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  await writeFile(`${path}.meta.json`, JSON.stringify({ contentType, size: bytes.length }));
}

/**
 * The local driver: files under .data/uploads, a signed PUT URL served by
 * `serveLocalUploads` in the dev server, and public URLs on the same host.
 */
export function createLocalDriver(config: LocalConfig): StorageDriver {
  const base = config.baseUrl.replace(/\/+$/, '');
  return {
    name: 'local',
    presignUpload({ key, contentType, expiresInSeconds }): Promise<PresignedUpload> {
      const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
      const sig = signature(config.secret, key, exp);
      return Promise.resolve({
        url: `${base}${LOCAL_UPLOAD_PATH}/${key}?exp=${String(exp)}&sig=${sig}`,
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        expiresAt: new Date(exp * 1000),
      });
    },
    async head(key): Promise<StoredObject | null> {
      const path = localPathFor(key);
      try {
        const [info, meta] = await Promise.all([stat(path), readFile(`${path}.meta.json`, 'utf8')]);
        const parsed = JSON.parse(meta) as { contentType?: string };
        return { size: info.size, contentType: parsed.contentType ?? '' };
      } catch {
        return null;
      }
    },
    async delete(key): Promise<void> {
      const path = localPathFor(key);
      await rm(path, { force: true });
      await rm(`${path}.meta.json`, { force: true });
    },
    publicUrl(key): string {
      return `${base}${LOCAL_UPLOAD_PATH}/${key}`;
    },
  };
}
