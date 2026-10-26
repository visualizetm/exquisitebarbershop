import type { ApiError } from '@shared/api/errors';
import { formatCents } from '@shared/lib/money';

type AffectedBooking = NonNullable<ApiError['error']['affected']>[number];
export type MoveOption = NonNullable<AffectedBooking['moveOptions']>[number];

/**
 * A chair in the resolver's "Move to" list: "Drew, $40", what the booking costs with that chair,
 * plus the length when it differs from the booking's own ("Dontrise, $50, 75 min").
 */
export function optionLabel(
  booking: Pick<AffectedBooking, 'durationMinutes'>,
  option: MoveOption,
): string {
  const length =
    option.durationMinutes === booking.durationMinutes
      ? ''
      : `, ${String(option.durationMinutes)} min`;
  return `${option.staffName}, ${formatCents(option.totalPriceCents)}${length}`;
}
