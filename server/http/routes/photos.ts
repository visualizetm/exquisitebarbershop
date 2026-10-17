import { z } from 'zod';
import {
  adminPhotoListQuerySchema,
  adminPhotoListResponseSchema,
  adminPhotoResponseSchema,
  confirmUploadRequestSchema,
  photoPatchRequestSchema,
  uploadUrlRequestSchema,
  uploadUrlResponseSchema,
} from '../../../shared/api/photos';
import { idSchema } from '../../../shared/schemas/common';
import {
  confirmUpload,
  deletePhoto,
  issueUploadUrl,
  listManagedPhotos,
  updatePhoto,
} from '../../services/photosService';
import { metaOf, NO_STORE, principalOf } from '../context';
import { parseBody, parseParams, parseQuery } from '../request';
import type { RouteDefinition } from '../types';

const idParams = z.object({ id: idSchema });

/**
 * Photo management. Routes are open to any signed-in login; the service decides:
 * the owner manages everything, a barber only their own chair's photos and only
 * while the owner setting permissions.barbersCanUploadPhotos is on.
 */
export const photosRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/api/admin/photos',
    auth: 'barber',
    handler: async (ctx) => {
      const query = parseQuery(ctx, adminPhotoListQuerySchema);
      return {
        body: adminPhotoListResponseSchema.parse({
          photos: await listManagedPhotos(principalOf(ctx), query),
        }),
        headers: NO_STORE,
      };
    },
  },
  {
    method: 'POST',
    path: '/api/admin/photos/upload-url',
    auth: 'barber',
    handler: async (ctx) => {
      const input = await parseBody(ctx, uploadUrlRequestSchema);
      return {
        body: uploadUrlResponseSchema.parse(
          await issueUploadUrl(principalOf(ctx), input, metaOf(ctx)),
        ),
        headers: NO_STORE,
      };
    },
  },
  {
    method: 'POST',
    path: '/api/admin/photos/confirm',
    auth: 'barber',
    handler: async (ctx) => {
      const input = await parseBody(ctx, confirmUploadRequestSchema);
      return {
        status: 201,
        body: adminPhotoResponseSchema.parse({
          photo: await confirmUpload(principalOf(ctx), input, metaOf(ctx)),
        }),
      };
    },
  },
  {
    method: 'PATCH',
    path: '/api/admin/photos/:id',
    auth: 'barber',
    handler: async (ctx) => {
      const { id } = parseParams(ctx, idParams);
      const patch = await parseBody(ctx, photoPatchRequestSchema);
      return {
        body: adminPhotoResponseSchema.parse({
          photo: await updatePhoto(principalOf(ctx), id, patch, metaOf(ctx)),
        }),
      };
    },
  },
  {
    method: 'DELETE',
    path: '/api/admin/photos/:id',
    auth: 'barber',
    handler: async (ctx) => {
      const { id } = parseParams(ctx, idParams);
      await deletePhoto(principalOf(ctx), id, metaOf(ctx));
      return { body: { ok: true } };
    },
  },
];
