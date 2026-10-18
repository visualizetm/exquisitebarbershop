import { vi } from 'vitest';
import { signParams } from '../../server/storage/cloudinary';

export interface FakeAsset {
  publicId: string;
  bytes: number;
  version: number;
  format: string;
  width: number;
  height: number;
  createdAt: Date;
}

export interface FakeCloudinary {
  assets: Map<string, FakeAsset>;
  calls: string[];
  /** What the browser does: POST the signed form with the file, and get Cloudinary's JSON back. */
  browserUpload(
    issued: { uploadUrl: string; fields?: Record<string, string> | undefined },
    bytes: Buffer,
  ): Promise<Response>;
  restore(): void;
}

/**
 * Stands in for api.cloudinary.com by wrapping fetch: the signed upload, the Admin API lookup, list,
 * ping and destroy, each checking the same signature or Basic credentials the real service does.
 * Requests to anything else pass through.
 */
export function installFakeCloudinary(config: {
  cloud: string;
  apiKey: string;
  apiSecret: string;
}): FakeCloudinary {
  const original = globalThis.fetch;
  const assets = new Map<string, FakeAsset>();
  const calls: string[] = [];
  let version = 1700000000;
  const base = `https://api.cloudinary.com/v1_1/${config.cloud}`;
  const basic = `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64')}`;
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const view = (a: FakeAsset) => ({
    public_id: a.publicId,
    version: a.version,
    bytes: a.bytes,
    format: a.format,
    width: a.width,
    height: a.height,
    created_at: a.createdAt.toISOString(),
  });

  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!`${url.origin}${url.pathname}`.startsWith(base)) return original(input, init);
    const path = url.pathname.slice(`/v1_1/${config.cloud}`.length);
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push(`${method} ${path}`);
    const headers = new Headers(init?.headers);

    if (method === 'POST' && path === '/image/upload') {
      const form = init?.body as FormData;
      const fields = Object.fromEntries(
        [...form.entries()].filter(
          (entry): entry is [string, string] => entry[0] !== 'file' && typeof entry[1] === 'string',
        ),
      );
      const expected = signParams(
        {
          folder: fields.folder ?? '',
          public_id: fields.public_id ?? '',
          timestamp: fields.timestamp ?? '',
        },
        config.apiSecret,
      );
      if (fields.api_key !== config.apiKey || fields.signature !== expected) {
        return json(401, { error: { message: 'Invalid Signature' } });
      }
      const file = form.get('file') as File;
      const publicId = `${fields.folder ?? ''}/${fields.public_id ?? ''}`;
      const asset: FakeAsset = {
        publicId,
        bytes: file.size,
        version: (version += 1),
        format: 'webp',
        width: 1600,
        height: 2000,
        createdAt: new Date(),
      };
      assets.set(publicId, asset);
      return json(200, view(asset));
    }
    if (headers.get('authorization') !== basic && method !== 'POST') {
      return json(401, { error: { message: 'Invalid credentials' } });
    }
    if (method === 'GET' && path === '/ping') return json(200, { status: 'OK' });
    if (method === 'GET' && path.startsWith('/resources/image/upload/')) {
      const asset = assets.get(decodeURI(path.slice('/resources/image/upload/'.length)));
      return asset
        ? json(200, view(asset))
        : json(404, { error: { message: 'Resource not found' } });
    }
    if (method === 'GET' && path === '/resources/image/upload') {
      const prefix = url.searchParams.get('prefix') ?? '';
      return json(200, {
        resources: [...assets.values()].filter((a) => a.publicId.startsWith(prefix)).map(view),
      });
    }
    if (method === 'POST' && path === '/image/destroy') {
      const body = new URLSearchParams(init?.body as URLSearchParams);
      const expected = signParams(
        {
          invalidate: body.get('invalidate') ?? '',
          public_id: body.get('public_id') ?? '',
          timestamp: body.get('timestamp') ?? '',
        },
        config.apiSecret,
      );
      if (body.get('signature') !== expected) return json(401, { error: { message: 'Invalid' } });
      const gone = assets.delete(body.get('public_id') ?? '');
      return json(200, { result: gone ? 'ok' : 'not found' });
    }
    return json(404, { error: { message: `Unhandled ${method} ${path}` } });
  };
  vi.stubGlobal('fetch', fake);

  return {
    assets,
    calls,
    browserUpload(issued, bytes) {
      const form = new FormData();
      for (const [k, v] of Object.entries(issued.fields ?? {})) form.append(k, v);
      form.append('file', new Blob([bytes]), 'photo.webp');
      return fake(issued.uploadUrl, { method: 'POST', body: form });
    },
    restore() {
      vi.unstubAllGlobals();
    },
  };
}
