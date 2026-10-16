import { describe, expect, it } from 'vitest';
import { auditLogRepo } from '../../server/repos';
import { newId } from '../../server/lib/ids';
import { NOW, useTestDb } from '../helpers/db';

useTestDb();

describe('auditLogRepo', () => {
  it('appends and lists per entity newest first', async () => {
    const bookingId = newId();
    const actor = { type: 'owner' as const, userId: newId(), staffId: null };
    await auditLogRepo.appendAuditEntry(
      {
        actor,
        action: 'booking.create',
        entityType: 'booking',
        entityId: bookingId,
        before: null,
        after: { status: 'confirmed' },
        meta: null,
        requestId: 'r1',
      },
      NOW,
    );
    await auditLogRepo.appendAuditEntry(
      {
        actor,
        action: 'booking.cancel',
        entityType: 'booking',
        entityId: bookingId,
        before: { status: 'confirmed' },
        after: { status: 'cancelled' },
        meta: { reason: 'x' },
        requestId: null,
      },
      new Date(NOW.getTime() + 1000),
    );
    await auditLogRepo.appendAuditEntry(
      {
        actor,
        action: 'staff.update',
        entityType: 'staff',
        entityId: newId(),
        before: null,
        after: null,
        meta: null,
        requestId: null,
      },
      NOW,
    );
    const history = await auditLogRepo.listAuditForEntity('booking', bookingId);
    expect(history.map((h) => h.action)).toEqual(['booking.cancel', 'booking.create']);
    expect(await auditLogRepo.listRecentAudit(2)).toHaveLength(2);
  });

  it('rejects malformed action names', async () => {
    await expect(
      auditLogRepo.appendAuditEntry(
        {
          actor: { type: 'system', userId: null, staffId: null },
          action: 'Bad Action',
          entityType: 'x',
          entityId: 'y',
          before: null,
          after: null,
          meta: null,
          requestId: null,
        },
        NOW,
      ),
    ).rejects.toThrow();
  });
});
