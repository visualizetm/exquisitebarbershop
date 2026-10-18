import AlertCircle from '@untitled-ui/icons-react/build/esm/AlertCircle';
import CheckCircle from '@untitled-ui/icons-react/build/esm/CheckCircle';
import Clock from '@untitled-ui/icons-react/build/esm/Clock';
import XCircle from '@untitled-ui/icons-react/build/esm/XCircle';
import type { BookingStatus } from '@shared/schemas/booking';

const LABEL: Record<BookingStatus, string> = {
  confirmed: 'Confirmed',
  completed: 'Done',
  noShow: 'No show',
  cancelled: 'Cancelled',
};
const TONE: Record<BookingStatus, 'neutral' | 'ok' | 'accent' | 'muted'> = {
  confirmed: 'neutral',
  completed: 'ok',
  noShow: 'accent',
  cancelled: 'muted',
};

/** A booking's status as a small pill: an icon, and always the word, never color alone. */
export function StatusChip({ status }: { status: BookingStatus }) {
  const Icon =
    status === 'completed'
      ? CheckCircle
      : status === 'noShow'
        ? AlertCircle
        : status === 'cancelled'
          ? XCircle
          : Clock;
  return (
    <span className="exq-status-chip" data-tone={TONE[status]} data-status={status}>
      <Icon aria-hidden="true" />
      {LABEL[status]}
    </span>
  );
}
