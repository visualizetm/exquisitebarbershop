import type { AvailabilitySlot } from '@shared/api/availability';
import type { CreateBookingResponse } from '@shared/api/bookings';

export type BookStep = 'services' | 'barber' | 'day' | 'time' | 'details' | 'confirm' | 'done';
export const STEP_ORDER: readonly BookStep[] = [
  'services',
  'barber',
  'day',
  'time',
  'details',
  'confirm',
  'done',
];

/** Everything about the booking in progress that lives in the URL. */
export interface BookSelection {
  serviceIds: string[];
  staff: string | null; // slug or "any"
  date: string | null;
  startAt: string | null;
  step: BookStep | null;
}

export function readSelection(params: URLSearchParams): BookSelection {
  const services = params.get('services') ?? params.get('service') ?? '';
  const step = params.get('step');
  return {
    serviceIds: services.split(',').filter(Boolean),
    staff: params.get('barber'),
    date: params.get('date'),
    startAt: params.get('time'),
    step: STEP_ORDER.includes(step as BookStep) ? (step as BookStep) : null,
  };
}

export function writeSelection(sel: BookSelection): URLSearchParams {
  const params = new URLSearchParams();
  if (sel.serviceIds.length > 0) params.set('services', sel.serviceIds.join(','));
  if (sel.staff) params.set('barber', sel.staff);
  if (sel.date) params.set('date', sel.date);
  if (sel.startAt) params.set('time', sel.startAt);
  if (sel.step) params.set('step', sel.step);
  return params;
}

/** The first step that still needs input, which is where the flow lands by default. */
export function firstIncompleteStep(sel: BookSelection): BookStep {
  if (sel.serviceIds.length === 0) return 'services';
  if (!sel.staff) return 'barber';
  if (!sel.date) return 'day';
  if (!sel.startAt) return 'time';
  return 'details';
}

/** A later step cannot be shown when an earlier one is empty. */
export function resolveStep(sel: BookSelection): BookStep {
  const wanted = sel.step ?? firstIncompleteStep(sel);
  const limit = firstIncompleteStep(sel);
  if (wanted === 'done') return 'done';
  // Customer details live in session storage, not the URL, so "confirm" is reachable once the time is set.
  const furthest: BookStep = limit === 'details' ? 'confirm' : limit;
  return STEP_ORDER.indexOf(wanted) <= STEP_ORDER.indexOf(furthest) ? wanted : furthest;
}

export interface CustomerDetails {
  name: string;
  phone: string;
  email: string;
  notes: string;
}

const DETAILS_KEY = 'exq-book-details';
const CONFIRMATION_KEY = 'exq-book-confirmation';
const IDEMPOTENCY_KEY = 'exq-book-idempotency';

function safeGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private modes; the flow still works within the page.
  }
}

export function loadDetails(): CustomerDetails {
  const raw = safeGet(DETAILS_KEY);
  if (!raw) return { name: '', phone: '', email: '', notes: '' };
  try {
    const parsed = JSON.parse(raw) as Partial<CustomerDetails>;
    return {
      name: parsed.name ?? '',
      phone: parsed.phone ?? '',
      email: parsed.email ?? '',
      notes: parsed.notes ?? '',
    };
  } catch {
    return { name: '', phone: '', email: '', notes: '' };
  }
}

export function saveDetails(details: CustomerDetails): void {
  safeSet(DETAILS_KEY, JSON.stringify(details));
}

export function loadConfirmation(): CreateBookingResponse | null {
  const raw = safeGet(CONFIRMATION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CreateBookingResponse;
  } catch {
    return null;
  }
}

export function saveConfirmation(value: CreateBookingResponse | null): void {
  safeSet(CONFIRMATION_KEY, value ? JSON.stringify(value) : null);
}

/** One key per attempted booking so a retry after a dropped connection replays instead of double booking. */
export function idempotencyKeyFor(fingerprint: string): string {
  const raw = safeGet(IDEMPOTENCY_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { fingerprint: string; key: string };
      if (parsed.fingerprint === fingerprint) return parsed.key;
    } catch {
      // fall through to a fresh key
    }
  }
  const key = `web-${crypto.randomUUID()}`;
  safeSet(IDEMPOTENCY_KEY, JSON.stringify({ fingerprint, key }));
  return key;
}

export function clearIdempotencyKey(): void {
  safeSet(IDEMPOTENCY_KEY, null);
}

export function slotLabel(slot: Pick<AvailabilitySlot, 'startAt'>): string {
  return new Date(slot.startAt).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  });
}
