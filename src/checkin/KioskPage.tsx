import { CheckInPage } from './CheckInPage';

/** The locked front desk tablet at /checkin: no nav, no footer, no links, its own small chunk. */
export function KioskPage() {
  return <CheckInPage session="kiosk" exitTo={null} />;
}
