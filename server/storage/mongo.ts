import { GridFSBucket, type Db } from 'mongodb';
import { getDb } from '../db/client';
import { signLocalUpload } from './local';
import type { PresignedUpload, StorageDriver, StoredObject } from './types';

/** Photos in the demo are capped after the browser resize; an upload above this is refused. */
export const MONGO_MAX_BYTES = 3 * 1024 * 1024;
export const MEDIA_BUCKET = 'media';
const MEDIA_ID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.webp$/;

export interface MongoConfig {
  /** The site origin, so upload and public URLs point at this deployment. */
  baseUrl: string;
  /** Signs the short-lived PUT URLs. */
  secret: string;
}

/** The image type the bytes really are, from their first bytes; null for anything else. */
export function sniffImageType(
  bytes: Uint8Array,
): 'image/webp' | 'image/jpeg' | 'image/png' | null {
  const b = bytes;
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) {
    const tag = String.fromCharCode(b[8] ?? 0, b[9] ?? 0, b[10] ?? 0, b[11] ?? 0);
    if (tag === 'WEBP') return 'image/webp';
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return 'image/png';
  }
  return null;
}

/** The id the public URL uses: the uuid inside a photo key. Null for keys that are not photos. */
export function mediaIdOf(key: string): string | null {
  const match = MEDIA_ID.exec(key);
  return match?.[1] ? `${match[1]}.webp` : null;
}

function bucketOf(db: Db): GridFSBucket {
  return new GridFSBucket(db, { bucketName: MEDIA_BUCKET });
}

interface FileInfo {
  _id: unknown;
  length: number;
  filename: string;
  metadata?: { contentType?: string; mediaId?: string };
}

async function findFiles(db: Db, filter: Record<string, unknown>): Promise<FileInfo[]> {
  return (await db
    .collection(`${MEDIA_BUCKET}.files`)
    .find(filter)
    .toArray()) as unknown as FileInfo[];
}

/** Stores an object under its key, replacing an earlier one with the same key. */
export async function writeMedia(key: string, bytes: Uint8Array, contentType: string) {
  const db = await getDb();
  const bucket = bucketOf(db);
  for (const old of await findFiles(db, { filename: key })) await bucket.delete(old._id as never);
  const mediaId = mediaIdOf(key);
  await new Promise<void>((resolve, reject) => {
    const stream = bucket.openUploadStream(key, {
      metadata: { contentType, ...(mediaId ? { mediaId } : {}) },
    });
    stream.on('error', reject);
    stream.on('finish', () => {
      resolve();
    });
    stream.end(Buffer.from(bytes));
  });
}

/** The stored bytes and type for a public id (`<uuid>.webp`), or null. */
export async function readMediaById(
  id: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const db = await getDb();
  const [file] = await findFiles(db, { 'metadata.mediaId': id });
  if (!file) return null;
  const bucket = bucketOf(db);
  const chunks: Buffer[] = [];
  for await (const chunk of bucket.openDownloadStream(file._id as never)) {
    chunks.push(chunk as Buffer);
  }
  return {
    bytes: Buffer.concat(chunks),
    contentType: file.metadata?.contentType ?? 'application/octet-stream',
  };
}

/** Removes every stored object. The demo reset and clear use it. */
export async function dropMedia(): Promise<void> {
  const db = await getDb();
  const bucket = bucketOf(db);
  const exists = await db.listCollections({ name: `${MEDIA_BUCKET}.files` }).toArray();
  if (exists.length > 0) await bucket.drop();
}

/**
 * The showcase driver: photos live in MongoDB GridFS and are served by the site
 * itself at /api/media/<uuid>.webp. The browser PUTs to the same address with a
 * signed, short-lived query string, so no other account or service is involved.
 * Not for a real shop: it shares the database, and backups skip it.
 */
export function createMongoDriver(config: MongoConfig): StorageDriver {
  const base = config.baseUrl.replace(/\/+$/, '');
  return {
    name: 'mongo',
    presignUpload({ key, expiresInSeconds }): Promise<PresignedUpload> {
      const id = mediaIdOf(key);
      if (!id) return Promise.reject(new Error('Not a photo key'));
      const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
      const sig = signLocalUpload(config.secret, key, exp);
      const query = new URLSearchParams({ k: key, exp: String(exp), sig });
      return Promise.resolve({
        url: `${base}/api/media/${id}?${query.toString()}`,
        method: 'PUT',
        // octet-stream so the platform hands the route the raw bytes untouched.
        headers: { 'Content-Type': 'application/octet-stream' },
        expiresAt: new Date(exp * 1000),
      });
    },
    async head(key): Promise<StoredObject | null> {
      const [file] = await findFiles(await getDb(), { filename: key });
      if (!file) return null;
      return { size: file.length, contentType: file.metadata?.contentType ?? '' };
    },
    async delete(key): Promise<void> {
      const db = await getDb();
      const bucket = bucketOf(db);
      for (const file of await findFiles(db, { filename: key })) {
        await bucket.delete(file._id as never);
      }
    },
    async put(key, bytes, contentType): Promise<void> {
      await writeMedia(key, bytes, contentType);
    },
    async get(key): Promise<Uint8Array | null> {
      const db = await getDb();
      const [file] = await findFiles(db, { filename: key });
      if (!file) return null;
      const bucket = bucketOf(db);
      const chunks: Buffer[] = [];
      for await (const chunk of bucket.openDownloadStream(file._id as never)) {
        chunks.push(chunk as Buffer);
      }
      return Buffer.concat(chunks);
    },
    publicUrl(key): string {
      return `${base}/api/media/${mediaIdOf(key) ?? 'unknown.webp'}`;
    },
  };
}
