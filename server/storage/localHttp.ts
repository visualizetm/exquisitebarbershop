import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { PHOTO_MAX_BYTES } from '../../shared/schemas/photo';
import { isObjectKey } from './keys';
import { getEnv } from '../env';
import {
  LOCAL_UPLOAD_PATH,
  localPathFor,
  verifyLocalUploadSignature,
  writeLocalObject,
} from './local';

function send(res: ServerResponse, status: number, text: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}

/**
 * Serves `/uploads/<key>` for the local storage driver: PUT stores an object
 * when the URL carries a valid signature, GET reads it back. Mounted ahead of
 * the API router by the dev server only. Returns false when the request is not
 * an uploads request, so the router handles it.
 */
export async function serveLocalUploads(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith(`${LOCAL_UPLOAD_PATH}/`)) return false;
  if (getEnv().STORAGE_DRIVER !== 'local') {
    send(res, 404, 'Not found');
    return true;
  }
  const key = url.pathname.slice(LOCAL_UPLOAD_PATH.length + 1);
  if (!isObjectKey(key)) {
    send(res, 404, 'Not found');
    return true;
  }
  const method = (req.method ?? 'GET').toUpperCase();

  if (method === 'PUT') {
    const secret = getEnv().MANAGE_LINK_SECRET;
    if (
      !verifyLocalUploadSignature(
        secret,
        key,
        url.searchParams.get('exp'),
        url.searchParams.get('sig'),
      )
    ) {
      send(res, 403, 'Upload link is not valid');
      return true;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buf = chunk as Buffer;
      size += buf.length;
      if (size > PHOTO_MAX_BYTES) {
        send(res, 413, 'Too large');
        return true;
      }
      chunks.push(buf);
    }
    const contentType = req.headers['content-type'] ?? 'application/octet-stream';
    await writeLocalObject(key, Buffer.concat(chunks), contentType.split(';')[0] ?? contentType);
    send(res, 200, 'OK');
    return true;
  }

  if (method === 'GET' || method === 'HEAD') {
    try {
      const path = localPathFor(key);
      const [bytes, meta] = await Promise.all([
        readFile(path),
        readFile(`${path}.meta.json`, 'utf8'),
      ]);
      const parsed = JSON.parse(meta) as { contentType?: string };
      res.statusCode = 200;
      res.setHeader('Content-Type', parsed.contentType ?? 'application/octet-stream');
      res.setHeader('Content-Length', String(bytes.length));
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.end(method === 'HEAD' ? undefined : bytes);
    } catch {
      send(res, 404, 'Not found');
    }
    return true;
  }

  send(res, 405, 'Method not allowed');
  return true;
}
