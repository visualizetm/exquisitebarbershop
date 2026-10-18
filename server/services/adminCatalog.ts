import type {
  AdminServiceView,
  AdminStaffView,
  AuditEntryView,
  AuditListQuery,
  ConflictOutcome,
  ConflictResolution,
  OutboxMessageView,
} from '../../shared/api/admin';
import { shopDayBounds } from '../../shared/lib/time';
import type { EmailOutboxDocument } from '../../shared/schemas/emailOutbox';
import type { ServiceDocument, ServiceInput, ServiceUpdate } from '../../shared/schemas/service';
import type { ShopSettingsInput } from '../../shared/schemas/shopSettings';
import type { StaffDocument, StaffInput, StaffUpdate } from '../../shared/schemas/staff';
import { withTransaction } from '../db/transaction';
import type { Principal } from '../http/types';
import { AppError } from '../lib/errors';
import { stripUndefined } from '../lib/objects';
import {
  auditLogRepo,
  emailOutboxRepo,
  servicesRepo,
  sessionsRepo,
  shopSettingsRepo,
  staffRepo,
  usersRepo,
} from '../repos';
import { actorOf } from './access';
import { cursors, type Changed, type ServiceMeta } from './adminBookings';
import { applyScheduleChange } from './scheduleChanges';
import { toAuditView, toOutboxView } from './views';

type Resolutions = readonly ConflictResolution[] | undefined;

async function audit(
  principal: Principal,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  },
  meta: ServiceMeta,
): Promise<void> {
  await auditLogRepo.appendAuditEntry(
    {
      actor: actorOf(principal),
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before ?? null,
      after: entry.after ?? null,
      meta: null,
      requestId: meta.requestId,
    },
    meta.now,
  );
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export function toServiceView(s: ServiceDocument): AdminServiceView {
  return {
    id: s._id,
    name: s.name,
    group: s.group,
    description: s.description,
    priceCents: s.priceCents,
    priceFrom: s.priceFrom,
    durationMinutes: s.durationMinutes,
    bufferMinutes: (s as Partial<ServiceDocument>).bufferMinutes ?? null,
    sortOrder: s.sortOrder,
    isActive: s.isActive,
    deletedAt: s.deletedAt?.toISOString() ?? null,
  };
}

export async function listServices(): Promise<{ services: AdminServiceView[] }> {
  return { services: (await servicesRepo.listServices()).map(toServiceView) };
}

export async function createService(principal: Principal, input: ServiceInput, meta: ServiceMeta) {
  const service = await servicesRepo.insertService(input, meta.now);
  await audit(
    principal,
    { action: 'service.create', entityType: 'service', entityId: service._id, after: input },
    meta,
  );
  return { service: toServiceView(service) };
}

/** Edits never touch existing bookings: they keep the price and duration they were booked with. */
export async function updateService(
  principal: Principal,
  id: string,
  patch: ServiceUpdate,
  meta: ServiceMeta,
) {
  const before = await servicesRepo.findServiceById(id);
  if (!before || before.deletedAt) throw new AppError('NOT_FOUND', 'Service was not found');
  const service = await servicesRepo.updateService(id, patch, meta.now);
  await audit(
    principal,
    {
      action: 'service.update',
      entityType: 'service',
      entityId: id,
      before: toServiceView(before),
      after: patch,
    },
    meta,
  );
  return { service: toServiceView(service) };
}

/** Soft delete. Upcoming bookings that include the service go through the conflict rule. */
export async function deleteService(
  principal: Principal,
  id: string,
  resolutions: Resolutions,
  meta: ServiceMeta,
): Promise<Changed<ConflictOutcome & { ok: true }>> {
  const service = await servicesRepo.findServiceById(id);
  if (!service || service.deletedAt) throw new AppError('NOT_FOUND', 'Service was not found');
  const change = await applyScheduleChange({
    actor: actorOf(principal),
    requestId: meta.requestId,
    now: meta.now,
    staffIds: 'all',
    resolutions,
    allowCancel: true,
    audit: { action: 'service.delete', entityType: 'service', entityId: () => id },
    apply: async (session) => {
      await servicesRepo.softDeleteService(id, meta.now, { session });
    },
    alsoAffected: (upcoming) => upcoming.filter((b) => b.services.some((s) => s.serviceId === id)),
  });
  return {
    body: { ok: true, kept: change.kept, moved: change.moved, cancelled: change.cancelled },
    outboxIds: change.outboxIds,
  };
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export function toStaffView(s: StaffDocument): AdminStaffView {
  return {
    id: s._id,
    slug: s.slug,
    slugAliases: s.slugAliases,
    name: s.name,
    role: s.role,
    title: s.title,
    specialty: s.specialty,
    bio: s.bio,
    chairNumber: s.chairNumber,
    serviceIds: s.serviceIds,
    photoUrl: s.photoUrl,
    instagramHandle: s.instagramHandle,
    sortOrder: s.sortOrder,
    acceptsOnlineBooking: s.acceptsOnlineBooking,
    showOnWebsite: s.showOnWebsite,
    deletedAt: s.deletedAt?.toISOString() ?? null,
  };
}

export async function listStaff(): Promise<{ staff: AdminStaffView[] }> {
  return { staff: (await staffRepo.listStaff()).map(toStaffView) };
}

export async function createStaff(principal: Principal, input: StaffInput, meta: ServiceMeta) {
  const staff = await staffRepo.insertStaff(input, meta.now);
  await audit(
    principal,
    { action: 'staff.create', entityType: 'staff', entityId: staff._id, after: input },
    meta,
  );
  return { staff: toStaffView(staff) };
}

/**
 * Updates a chair. Dropping a service the chair has upcoming bookings for goes
 * through the conflict rule; other edits never leave a booking stranded.
 */
export async function updateStaff(
  principal: Principal,
  id: string,
  input: Omit<StaffUpdate, 'slug'> & { resolutions?: Resolutions },
  meta: ServiceMeta,
): Promise<Changed<{ staff: AdminStaffView } & ConflictOutcome>> {
  const { resolutions, ...patch } = input;
  const before = await staffRepo.findStaffById(id);
  if (!before || before.deletedAt) throw new AppError('NOT_FOUND', 'Staff member was not found');
  const removed = patch.serviceIds
    ? before.serviceIds.filter((s) => !patch.serviceIds?.includes(s))
    : [];
  const change = await applyScheduleChange<StaffDocument>({
    actor: actorOf(principal),
    requestId: meta.requestId,
    now: meta.now,
    staffIds: [id],
    resolutions,
    allowCancel: true,
    audit: {
      action: 'staff.update',
      entityType: 'staff',
      entityId: () => id,
      meta: stripUndefined(patch),
    },
    apply: (session) => staffRepo.updateStaff(id, patch, meta.now, { session }),
    alsoAffected: (upcoming) =>
      upcoming.filter(
        (b) => b.staffId === id && b.services.some((s) => removed.includes(s.serviceId)),
      ),
  });
  return {
    body: {
      staff: toStaffView(change.result),
      kept: change.kept,
      moved: change.moved,
      cancelled: change.cancelled,
    },
    outboxIds: change.outboxIds,
  };
}

/** New public slug. The old one becomes an alias, so printed cards keep working. */
export async function renameStaffSlug(
  principal: Principal,
  id: string,
  slug: string,
  meta: ServiceMeta,
) {
  const before = await staffRepo.findStaffById(id);
  if (!before || before.deletedAt) throw new AppError('NOT_FOUND', 'Staff member was not found');
  const staff = await staffRepo.renameStaffSlug(id, slug, meta.now);
  await audit(
    principal,
    {
      action: 'staff.slug.rename',
      entityType: 'staff',
      entityId: id,
      before: { slug: before.slug },
      after: { slug },
    },
    meta,
  );
  return { staff: toStaffView(staff) };
}

/**
 * Soft delete. The chair's upcoming bookings go through the conflict rule, and
 * its login is disabled with every session ended in the same transaction.
 */
export async function deleteStaff(
  principal: Principal,
  id: string,
  resolutions: Resolutions,
  meta: ServiceMeta,
): Promise<Changed<ConflictOutcome & { ok: true }>> {
  const staff = await staffRepo.findStaffById(id);
  if (!staff || staff.deletedAt) throw new AppError('NOT_FOUND', 'Staff member was not found');
  if (principal.staffId === id)
    throw new AppError('BAD_REQUEST', 'You cannot remove your own chair');
  const change = await applyScheduleChange({
    actor: actorOf(principal),
    requestId: meta.requestId,
    now: meta.now,
    staffIds: [id],
    resolutions,
    allowCancel: true,
    audit: { action: 'staff.delete', entityType: 'staff', entityId: () => id },
    apply: async (session) => {
      await staffRepo.softDeleteStaff(id, meta.now, { session });
      const login = await usersRepo.findUserByStaffId(id, { session });
      if (login) {
        await usersRepo.setUserActive(login._id, false, meta.now, { session });
        await sessionsRepo.revokeAllSessionsForUser(login._id, meta.now, { session });
      }
    },
  });
  return {
    body: { ok: true, kept: change.kept, moved: change.moved, cancelled: change.cancelled },
    outboxIds: change.outboxIds,
  };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(): Promise<{ settings: ShopSettingsInput }> {
  const {
    _id: _id,
    createdAt: _c,
    updatedAt: _u,
    ...settings
  } = await shopSettingsRepo.requireShopSettings();
  return { settings };
}

export async function putSettings(
  principal: Principal,
  input: ShopSettingsInput,
  meta: ServiceMeta,
) {
  const before = await getSettings();
  await withTransaction(async (session) => {
    await shopSettingsRepo.updateShopSettings(input, meta.now, { session });
  });
  await audit(
    principal,
    {
      action: 'settings.update',
      entityType: 'shopSettings',
      entityId: 'shop',
      before: before.settings,
      after: input,
    },
    meta,
  );
  return getSettings();
}

// ---------------------------------------------------------------------------
// Audit and outbox
// ---------------------------------------------------------------------------

export async function listAudit(
  query: AuditListQuery,
): Promise<{ entries: AuditEntryView[]; nextCursor: string | null }> {
  const before = cursors.decode(query.cursor, cursors.isTimeCursor);
  const page = await auditLogRepo.listAuditPage(
    {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.action ? { actionPrefix: query.action } : {}),
      ...(query.actorType ? { actorType: query.actorType } : {}),
      ...(query.from ? { start: shopDayBounds(query.from).start } : {}),
      ...(query.to ? { end: shopDayBounds(query.to).end } : {}),
    },
    before ? { at: new Date(before.t), id: before.i } : null,
    query.limit + 1,
  );
  const visible = page.slice(0, query.limit);
  const last = visible[visible.length - 1];
  return {
    entries: visible.map(toAuditView),
    nextCursor:
      page.length > query.limit && last
        ? cursors.encode({ t: last.at.getTime(), i: last._id })
        : null,
  };
}

export async function listOutbox(query: {
  status?: EmailOutboxDocument['status'] | undefined;
  cursor?: string | undefined;
  limit: number;
}): Promise<{ messages: OutboxMessageView[]; nextCursor: string | null }> {
  const before = cursors.decode(query.cursor, cursors.isTimeCursor);
  const page = await emailOutboxRepo.listOutboxPage(
    query.status,
    before ? { createdAt: new Date(before.t), id: before.i } : null,
    query.limit + 1,
  );
  const visible = page.slice(0, query.limit);
  const last = visible[visible.length - 1];
  return {
    messages: visible.map(toOutboxView),
    nextCursor:
      page.length > query.limit && last
        ? cursors.encode({ t: last.createdAt.getTime(), i: last._id })
        : null,
  };
}

/** Puts a failed message back in the queue; the route delivers it after responding. */
export async function retryOutboxMessage(
  principal: Principal,
  id: string,
  meta: ServiceMeta,
): Promise<string> {
  const message = await emailOutboxRepo.findOutboxMessageById(id);
  if (!message) throw new AppError('NOT_FOUND', 'Message was not found');
  if (!(await emailOutboxRepo.requeueOutboxMessage(id, meta.now))) {
    throw new AppError('CONFLICT', 'Only failed messages can be retried');
  }
  await audit(principal, { action: 'outbox.retry', entityType: 'emailOutbox', entityId: id }, meta);
  return id;
}
