import { AwsClient } from 'aws4fetch';
import type { PresignedUpload, StorageDriver, StoredObject } from './types';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
}

/**
 * Cloudflare R2 through its S3 API. Uploads go straight from the browser to a
 * presigned PUT URL, so the serverless function never carries the bytes. Reads
 * are public through R2_PUBLIC_BASE_URL (a custom domain or r2.dev host).
 */
export function createR2Driver(config: R2Config): StorageDriver {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`;
  const objectUrl = (key: string) => `${endpoint}/${key}`;
  const publicBase = config.publicBaseUrl.replace(/\/+$/, '');

  return {
    name: 'r2',
    async presignUpload({ key, contentType, expiresInSeconds }): Promise<PresignedUpload> {
      const url = new URL(objectUrl(key));
      url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
      const signed = await client.sign(new Request(url, { method: 'PUT' }), {
        aws: { signQuery: true },
      });
      return {
        url: signed.url,
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      };
    },
    async head(key): Promise<StoredObject | null> {
      const res = await client.fetch(objectUrl(key), { method: 'HEAD' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`R2 HEAD ${key} failed with ${res.status}`);
      return {
        size: Number(res.headers.get('content-length') ?? '0'),
        contentType: res.headers.get('content-type') ?? '',
      };
    },
    async delete(key): Promise<void> {
      const res = await client.fetch(objectUrl(key), { method: 'DELETE' });
      if (!res.ok && res.status !== 404)
        throw new Error(`R2 DELETE ${key} failed with ${res.status}`);
    },
    async put(key, bytes, contentType): Promise<void> {
      const res = await client.fetch(objectUrl(key), {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: bytes,
      });
      if (!res.ok) throw new Error(`R2 PUT ${key} failed with ${res.status}`);
    },
    async get(key): Promise<Uint8Array | null> {
      const res = await client.fetch(objectUrl(key), { method: 'GET' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`R2 GET ${key} failed with ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    publicUrl(key): string {
      return `${publicBase}/${key}`;
    },
  };
}
