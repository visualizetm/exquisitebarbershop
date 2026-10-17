import type { Actor } from '../../shared/schemas/timeBlock';
import type { Principal } from '../http/types';
import { AppError } from '../lib/errors';

/**
 * What a caller may see. The owner dashboard works on every chair; the barber
 * API (and the owner using it) works on exactly one chair. Services take a scope
 * and check every record against it, so a route that forgot a check still could
 * not leak another chair's data.
 */
export type Scope = { kind: 'all' } | { kind: 'chair'; staffId: string };

/** Owner-only work. Checked here as well as in the router. */
export function ownerScope(principal: Principal): Scope {
  if (principal.role !== 'owner') throw new AppError('FORBIDDEN', 'Owner access is required');
  return { kind: 'all' };
}

/** Work on the caller's own chair. */
export function chairScope(principal: Principal): Scope & { kind: 'chair' } {
  if (!principal.staffId) throw new AppError('FORBIDDEN', 'This login is not linked to a chair');
  return { kind: 'chair', staffId: principal.staffId };
}

/**
 * Hides records outside the scope. NOT_FOUND rather than FORBIDDEN, so ids that
 * belong to other chairs cannot be told apart from ids that do not exist.
 */
export function assertInScope(scope: Scope, staffId: string, what = 'Booking'): void {
  if (scope.kind === 'chair' && scope.staffId !== staffId) {
    throw new AppError('NOT_FOUND', `${what} was not found`);
  }
}

export function actorOf(principal: Principal): Actor {
  return { type: principal.role, userId: principal.userId, staffId: principal.staffId };
}
