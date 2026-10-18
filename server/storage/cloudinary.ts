import { createHash } from 'node:crypto';
import { cloudinaryUrl } from '../../shared/lib/cloudinary';
import type { PresignedUpload, StorageDriver, StoredObject } from './types';

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** The folder every upload goes into, for example exquisite/production. */
  folder: string;
  /** For tests only; production always talks to api.cloudinary.com. */
  apiBase?: string;
}

/** The uploads are images only and capped here after the browser resize. */
export const CLOUDINARY_MAX_BYTES = 10 * 1024 * 1024;
/** The uploads of the last 24 hours are never swept, so a photo being added is safe. */
export const ORPHAN_AGE_MS = 24 * 60 * 60_000;

/**
 * Cloudinary's request signature: the parameters sorted by name and joined as `a=1&b=2`, followed by
 * the API secret, hashed with SHA-1 (hex). The file, api_key, cloud_name and resource_type are never
 * part of it.
 */
export function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const joined = Object.keys(params)
    .filter((key) => !['file', 'api_key', 'cloud_name', 'resource_type'].includes(key))
    .sort()
    .map((key) => `${key}=${String(params[key])}`)
    .join('&');
  return createHash('sha1').update(`${joined}${apiSecret}`).digest('hex');
}

/** The public id of an asset in a folder: the folder, a slash, the uuid. */
export function splitKey(key: string): { folder: string; publicId: string } {
  const at = key.lastIndexOf('/');
  return { folder: key.slice(0, at), publicId: key.slice(at + 1) };
}

interface Resource {
  public_id: string;
  version: number;
  bytes: number;
  format: string;
  created_at?: string;
}

const FORMAT_TYPES: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/**
 * Photos on Cloudinary. The browser uploads straight to Cloudinary with a signature this server
 * makes (the API secret never leaves it); the server then verifies the asset through the Admin API
 * before the photo is saved, and destroys the asset when the photo is removed. Delivery URLs are
 * public and built from the cloud name and the public id (shared/lib/cloudinary.ts).
 */
export function createCloudinaryDriver(config: CloudinaryConfig): StorageDriver {
  const base = (config.apiBase ?? 'https://api.cloudinary.com').replace(/\/+$/, '');
  const api = `${base}/v1_1/${config.cloudName}`;
  const basic = `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64')}`;

  async function admin(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${api}${path}`, {
      ...init,
      headers: { authorization: basic, ...(init.headers as Record<string, string> | undefined) },
    });
  }

  return {
    name: 'cloudinary',
    presignUpload({ key, expiresInSeconds }): Promise<PresignedUpload> {
      const { folder, publicId } = splitKey(key);
      const timestamp = Math.floor(Date.now() / 1000);
      const signed = { folder, public_id: publicId, timestamp };
      return Promise.resolve({
        url: `${api}/image/upload`,
        method: 'POST',
        fields: {
          api_key: config.apiKey,
          timestamp: String(timestamp),
          folder,
          public_id: publicId,
          signature: signParams(signed, config.apiSecret),
        },
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      });
    },
    async head(key): Promise<StoredObject | null> {
      const res = await admin(`/resources/image/upload/${encodeURI(key)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Cloudinary lookup failed with ${String(res.status)}`);
      const asset = (await res.json()) as Resource;
      return {
        size: asset.bytes,
        contentType: FORMAT_TYPES[asset.format] ?? `image/${asset.format}`,
        version: asset.version,
      };
    },
    async delete(key): Promise<void> {
      const timestamp = Math.floor(Date.now() / 1000);
      const signed = { invalidate: 'true', public_id: key, timestamp };
      const body = new URLSearchParams({
        api_key: config.apiKey,
        invalidate: 'true',
        public_id: key,
        timestamp: String(timestamp),
        signature: signParams(signed, config.apiSecret),
      });
      const res = await fetch(`${api}/image/destroy`, { method: 'POST', body });
      if (!res.ok) throw new Error(`Cloudinary destroy failed with ${String(res.status)}`);
      // "not found" is a success: the asset is already gone.
    },
    put(): Promise<void> {
      return Promise.reject(
        new Error('Cloudinary holds photos only; backups and doctor files use another driver'),
      );
    },
    get(): Promise<Uint8Array | null> {
      return Promise.reject(new Error('Cloudinary photos are read from their public address'));
    },
    publicUrl(key): string {
      return cloudinaryUrl({ cloud: config.cloudName, publicId: key }, 1600, null);
    },
    delivery(key) {
      return { cloud: config.cloudName, publicId: key };
    },
    async ping(): Promise<void> {
      const res = await admin('/ping');
      if (!res.ok) throw new Error(`Cloudinary ping failed with ${String(res.status)}`);
    },
    async listOlderThan(cutoff, limit): Promise<string[]> {
      const found: string[] = [];
      let cursor: string | undefined;
      do {
        const query = new URLSearchParams({ prefix: `${config.folder}/`, max_results: '500' });
        if (cursor) query.set('next_cursor', cursor);
        const res = await admin(`/resources/image/upload?${query.toString()}`);
        if (!res.ok) throw new Error(`Cloudinary list failed with ${String(res.status)}`);
        const page = (await res.json()) as { resources: Resource[]; next_cursor?: string };
        for (const asset of page.resources) {
          const created = asset.created_at ? new Date(asset.created_at).getTime() : Infinity;
          if (created < cutoff.getTime()) found.push(asset.public_id);
        }
        cursor = page.next_cursor;
      } while (cursor && found.length < limit);
      return found.slice(0, limit);
    },
  };
}
