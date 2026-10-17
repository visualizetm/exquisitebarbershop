import type { NextOpening } from '@shared/api/availability';
import type { PublicStaff } from '@shared/api/public';
import type { ChairStatus } from '@/components/ui';

/** Turns the next-opening row for a chair into the card's status and its one-line label. */
export function chairStatusOf(row: NextOpening | undefined): {
  status: ChairStatus;
  label: string | undefined;
} {
  if (!row) return { status: 'none', label: undefined };
  if (row.status === 'closed') return { status: 'closed', label: 'Closed today' };
  if (row.status === 'off') return { status: 'off', label: 'Off today' };
  if (row.nextOpenLabel) return { status: 'next-open', label: `Next open ${row.nextOpenLabel}` };
  return { status: 'in', label: 'In today' };
}

/** Every chair in chair order: by chair number, then display order. */
export function inChairOrder(staff: PublicStaff[]): PublicStaff[] {
  return [...staff].sort(
    (a, b) =>
      (a.chairNumber ?? 99) - (b.chairNumber ?? 99) ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name),
  );
}
