import { z } from 'zod';
import { getEnv } from '../../env';
import { AppError } from '../../lib/errors';
import {
  MONGO_MAX_BYTES,
  mediaIdOf,
  readMediaById,
  sniffImageType,
  writeMedia,
} from '../../storage/mongo';
import { verifyLocalUploadSignature } from '../../storage/local';
import { isObjectKey } from '../../storage/keys';
import { parseParams, parseQuery, readRawBody } from '../request';
import type { RouteDefinition } from '../types';

const mediaParams = z.object({
  id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/),
});
const uploadQuery = z.object({
  k: z.string().min(1).max(200),
  exp: z.string().max(20),
  sig: z.string().min(1).max(100),
});

function assertMongoStorage(): void {
  if (getEnv().STORAGE_DRIVER !== 'mongo') throw new AppError('NOT_FOUND', 'No such endpoint');
}

/**
 * Photos stored in MongoDB (STORAGE_DRIVER=mongo, the showcase). GET serves the
 * bytes with a year of caching, because a photo's id never changes. PUT takes the
 * upload the admin screen was told to make; its signed, five minute query string
 * is the only credential. Without the mongo driver both answer 404.
 */
export const mediaRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/api/media/:id',
    auth: 'public',
    handler: async (ctx) => {
      assertMongoStorage();
      const { id } = parseParams(ctx, mediaParams);
      const media = await readMediaById(id);
      if (!media) throw new AppError('NOT_FOUND', 'That photo was not found');
      return {
        body: media.bytes,
        headers: {
          'Content-Type': media.contentType,
          'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
        },
      };
    },
  },
  {
    method: 'PUT',
    path: '/api/media/:id',
    auth: 'public',
    handler: async (ctx) => {
      assertMongoStorage();
      const { id } = parseParams(ctx, mediaParams);
      const { k, exp, sig } = parseQuery(ctx, uploadQuery);
      const valid = verifyLocalUploadSignature(getEnv().MANAGE_LINK_SECRET, k, exp, sig, ctx.now);
      if (!valid || !isObjectKey(k) || mediaIdOf(k) !== id) {
        throw new AppError('FORBIDDEN', 'This upload link is not valid or has expired');
      }
      const bytes = await readRawBody(ctx.req, MONGO_MAX_BYTES);
      if (bytes.length === 0) throw new AppError('BAD_REQUEST', 'The upload was empty');
      const contentType = sniffImageType(bytes);
      if (!contentType) {
        throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Upload a JPEG, PNG or WebP image');
      }
      await writeMedia(k, bytes, contentType);
      return { body: { ok: true }, headers: { 'Cache-Control': 'no-store' } };
    },
  },
];
