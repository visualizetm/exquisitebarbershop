import { z } from 'zod';
import { galleryQuerySchema, galleryResponseSchema } from '../../../shared/api/photos';
import {
  publicServicesResponseSchema,
  publicShopSchema,
  publicStaffListResponseSchema,
  publicStaffResponseSchema,
  staffOpeningsQuerySchema,
  staffOpeningsResponseSchema,
  type PublicService,
  type PublicStaff,
} from '../../../shared/api/public';
import type { ServiceDocument } from '../../../shared/schemas/service';
import type { StaffDocument } from '../../../shared/schemas/staff';
import { AppError } from '../../lib/errors';
import { servicesRepo, shopSettingsRepo, staffRepo, weeklyHoursRepo } from '../../repos';
import { staffOpenings } from '../../services/nextOpening';
import { galleryPage, heroPhoto, staffPhotoMap } from '../../services/photosService';
import { parseParams, parseQuery } from '../request';
import type { RouteDefinition } from '../types';

export function toPublicService(doc: ServiceDocument): PublicService {
  return {
    id: doc._id,
    name: doc.name,
    group: doc.group,
    description: doc.description,
    priceCents: doc.priceCents,
    priceFrom: doc.priceFrom,
    durationMinutes: doc.durationMinutes,
    sortOrder: doc.sortOrder,
  };
}

export function toPublicStaff(doc: StaffDocument): PublicStaff {
  return {
    id: doc._id,
    slug: doc.slug,
    name: doc.name,
    role: doc.role,
    title: doc.title,
    specialty: doc.specialty,
    bio: doc.bio,
    chairNumber: doc.chairNumber,
    serviceIds: doc.serviceIds,
    photoUrl: doc.photoUrl,
    instagramHandle: doc.instagramHandle,
    acceptsOnlineBooking: doc.acceptsOnlineBooking,
    sortOrder: doc.sortOrder,
  };
}

const EMPTY_WEEK = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };

export const publicRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/api/shop',
    auth: 'public',
    handler: async () => {
      const [settings, hours, hero] = await Promise.all([
        shopSettingsRepo.requireShopSettings(),
        weeklyHoursRepo.getShopHours(),
        heroPhoto(),
      ]);
      const body = publicShopSchema.parse({
        name: settings.name,
        tagline: settings.tagline,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        instagramHandle: settings.instagramHandle,
        timezone: settings.timezone,
        hours: hours?.days ?? EMPTY_WEEK,
        booking: {
          slotStepMinutes: settings.booking.slotStepMinutes,
          leadTimeMinutes: settings.booking.leadTimeMinutes,
          bookingWindowDays: settings.booking.bookingWindowDays,
          maxServicesPerBooking: settings.booking.maxServicesPerBooking,
          allowFirstAvailable: settings.booking.allowFirstAvailable,
          requireEmail: settings.booking.requireEmail,
        },
        heroPhoto: hero,
      });
      return { body, headers: { 'Cache-Control': 'public, max-age=60' } };
    },
  },
  {
    method: 'GET',
    path: '/api/services',
    auth: 'public',
    handler: async () => {
      const services = await servicesRepo.listPublicServices();
      const body = publicServicesResponseSchema.parse({ services: services.map(toPublicService) });
      return { body, headers: { 'Cache-Control': 'public, max-age=60' } };
    },
  },
  {
    method: 'GET',
    path: '/api/staff',
    auth: 'public',
    handler: async () => {
      const [staff, photos] = await Promise.all([staffRepo.listPublicStaff(), staffPhotoMap()]);
      const body = publicStaffListResponseSchema.parse({
        staff: staff.map((s) => ({ ...toPublicStaff(s), photo: photos.get(s._id) ?? null })),
      });
      return { body, headers: { 'Cache-Control': 'public, max-age=60' } };
    },
  },
  {
    method: 'GET',
    path: '/api/staff/:slug',
    auth: 'public',
    handler: async (ctx) => {
      const { slug } = parseParams(ctx, z.object({ slug: z.string().min(1).max(60) }));
      const requested = slug.toLowerCase();
      const staff = await staffRepo.findStaffBySlug(requested);
      if (!staff || staff.deletedAt || !staff.showOnWebsite) {
        throw new AppError('NOT_FOUND', 'That chair is no longer listed');
      }
      const photos = await staffPhotoMap();
      const body = publicStaffResponseSchema.parse({
        staff: { ...toPublicStaff(staff), photo: photos.get(staff._id) ?? null },
        requestedSlug: requested,
        canonical: staff.slug === requested,
      });
      return { body, headers: { 'Cache-Control': 'public, max-age=60' } };
    },
  },
  {
    method: 'GET',
    path: '/api/staff/:slug/openings',
    auth: 'public',
    handler: async (ctx) => {
      const { slug } = parseParams(ctx, z.object({ slug: z.string().min(1).max(60) }));
      const { count } = parseQuery(ctx, staffOpeningsQuerySchema);
      const body = staffOpeningsResponseSchema.parse(await staffOpenings(slug, count, ctx.now));
      return { body, headers: { 'Cache-Control': 'public, max-age=30' } };
    },
  },
  {
    method: 'GET',
    path: '/api/gallery',
    auth: 'public',
    handler: async (ctx) => {
      const query = parseQuery(ctx, galleryQuerySchema);
      const body = galleryResponseSchema.parse(await galleryPage(query));
      return { body, headers: { 'Cache-Control': 'public, max-age=60' } };
    },
  },
];
