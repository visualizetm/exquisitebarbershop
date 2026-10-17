import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { Link } from 'react-router';
import {
  manualBookingResponseSchema,
  serviceListResponseSchema,
  staffListResponseSchema,
  type ManualBookingResponse,
} from '@shared/api/admin';
import { Status } from '@/components/Status';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { ErrorNote } from '../components/ErrorNote';
import {
  money,
  newIdempotencyKey,
  shopDateTime,
  shopInstant,
  shopParts,
  todayInShop,
} from '../format';

type Source = 'phone' | 'walkIn';

/**
 * Phone bookings follow normal availability unless the owner overrides lead
 * time or the booking window. Walk-ins start now or later today and take the
 * chair's slot locks like any booking; no override ever takes a held slot.
 */
export function NewBookingPage() {
  usePageTitle('New booking');
  const services = useApi('/api/admin/services', serviceListResponseSchema);
  const staff = useApi('/api/admin/staff', staffListResponseSchema);
  const [source, setSource] = useState<Source>('phone');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [chair, setChair] = useState('any');
  const [date, setDate] = useState(todayInShop());
  const [time, setTime] = useState('');
  const [startNow, setStartNow] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [override, setOverride] = useState(false);
  const [notifyCustomer, setNotify] = useState<boolean | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<ManualBookingResponse | null>(null);

  if (services.status !== 'ready' || staff.status !== 'ready') {
    return (
      <article className="exq-adm-new" data-state="loading">
        <h1 className="exq-adm-new__title">New booking</h1>
        <Status
          state={services.status === 'error' || staff.status === 'error' ? 'error' : 'loading'}
        />
      </article>
    );
  }
  const bookable = services.data.services.filter((s) => s.isActive && !s.deletedAt);
  const chairs = staff.data.staff.filter((s) => !s.deletedAt);
  const notify = notifyCustomer ?? (source === 'phone' && email.trim() !== '');
  const alternatives =
    error instanceof ApiRequestError && error.code === 'SLOT_TAKEN'
      ? (error.alternatives ?? [])
      : [];

  function resetForm() {
    setServiceIds([]);
    setTime('');
    setName('');
    setPhone('');
    setEmail('');
    setNotes('');
    setOverride(false);
    setNotify(null);
    setKey(newIdempotencyKey());
  }

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    const startAt =
      source === 'walkIn' && startNow ? undefined : time ? shopInstant(date, time) : undefined;
    try {
      const result = await apiRequest('/api/admin/bookings', manualBookingResponseSchema, {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: {
          source,
          serviceIds,
          staff: chair,
          ...(startAt ? { startAt } : {}),
          customer: { name, phone, email: email.trim() ? email.trim() : null },
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          override: source === 'phone' && override,
          notifyCustomer: notify,
        },
      });
      setCreated(result);
      resetForm();
    } catch (err) {
      setError(err);
      // A refused request can be fixed and sent again as a new attempt.
      setKey(newIdempotencyKey());
    } finally {
      setWorking(false);
    }
  }

  return (
    <article
      className="exq-adm-new"
      data-state={working ? 'working' : created ? 'created' : 'idle'}
    >
      <h1 className="exq-adm-new__title">New booking</h1>
      {created ? (
        <p className="exq-adm-new__created" role="status" data-state="created">
          Booked {created.booking.customer.name} with {created.booking.staff.name},{' '}
          {shopDateTime(created.booking.startAt)} ({created.booking.referenceCode}).
          {created.overrideUsed ? ' Booked with the override.' : ''}
          {created.outsideWorkingTime ? ' This is outside working time.' : ''}{' '}
          <Link to={`/admin/bookings/${created.booking.id}`}>Open booking</Link>
        </p>
      ) : null}
      <form className="exq-adm-new__form" onSubmit={(e) => void submit(e)}>
        <fieldset className="exq-adm-new__source">
          <legend>Type</legend>
          {(['phone', 'walkIn'] as const).map((s) => (
            <label key={s} data-state={source === s ? 'selected' : 'idle'}>
              <input
                type="radio"
                name="source"
                value={s}
                checked={source === s}
                onChange={() => {
                  setSource(s);
                  setNotify(null);
                  if (s === 'walkIn' && chair === 'any') setChair(chairs[0]?.slug ?? 'any');
                }}
              />{' '}
              {s === 'phone' ? 'Phone booking' : 'Walk-in'}
            </label>
          ))}
        </fieldset>

        <fieldset className="exq-adm-new__services">
          <legend>Services</legend>
          {bookable.map((s) => (
            <label key={s.id} data-state={serviceIds.includes(s.id) ? 'selected' : 'idle'}>
              <input
                type="checkbox"
                checked={serviceIds.includes(s.id)}
                onChange={(e) => {
                  setServiceIds((prev) =>
                    e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                  );
                }}
              />{' '}
              {s.name}, {s.durationMinutes} min, {s.priceFrom ? 'from ' : ''}
              {money(s.priceCents)}
            </label>
          ))}
        </fieldset>

        <p className="exq-adm-new__chair">
          <label htmlFor="exq-adm-new-chair">Chair</label>{' '}
          <select
            id="exq-adm-new-chair"
            value={chair}
            onChange={(e) => {
              setChair(e.target.value);
            }}
          >
            {source === 'phone' ? <option value="any">First available</option> : null}
            {chairs.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </p>

        {source === 'walkIn' ? (
          <p className="exq-adm-new__now">
            <label>
              <input
                type="checkbox"
                checked={startNow}
                onChange={(e) => {
                  setStartNow(e.target.checked);
                }}
              />{' '}
              Starting now
            </label>
          </p>
        ) : null}
        {source === 'phone' || !startNow ? (
          <p className="exq-adm-new__when">
            {source === 'phone' ? (
              <>
                <label htmlFor="exq-adm-new-date">Day</label>{' '}
                <input
                  id="exq-adm-new-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                  }}
                />{' '}
              </>
            ) : null}
            <label htmlFor="exq-adm-new-time">Time</label>{' '}
            <input
              id="exq-adm-new-time"
              type="time"
              step={source === 'phone' ? 900 : 60}
              required
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                if (source === 'walkIn') setDate(todayInShop());
              }}
            />
          </p>
        ) : null}

        <fieldset className="exq-adm-new__customer">
          <legend>Customer</legend>
          <p>
            <label htmlFor="exq-adm-new-name">Name</label>{' '}
            <input
              id="exq-adm-new-name"
              required
              autoComplete="off"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
          </p>
          <p>
            <label htmlFor="exq-adm-new-phone">Phone</label>{' '}
            <input
              id="exq-adm-new-phone"
              type="tel"
              required
              autoComplete="off"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
              }}
            />
          </p>
          <p>
            <label htmlFor="exq-adm-new-email">Email (optional)</label>{' '}
            <input
              id="exq-adm-new-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
            />
          </p>
        </fieldset>

        <p className="exq-adm-new__notes">
          <label htmlFor="exq-adm-new-notes">Notes (optional)</label>{' '}
          <textarea
            id="exq-adm-new-notes"
            maxLength={500}
            rows={2}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
            }}
          />
        </p>

        <p className="exq-adm-new__notify">
          <label>
            <input
              type="checkbox"
              checked={notify}
              disabled={email.trim() === ''}
              onChange={(e) => {
                setNotify(e.target.checked);
              }}
            />{' '}
            Email the customer a confirmation
          </label>
        </p>
        {source === 'phone' ? (
          <p className="exq-adm-new__override">
            <label>
              <input
                type="checkbox"
                checked={override}
                onChange={(e) => {
                  setOverride(e.target.checked);
                }}
              />{' '}
              Allow inside the lead time or past the booking window (recorded in the audit log)
            </label>
          </p>
        ) : null}

        <ErrorNote error={error} />
        {alternatives.length > 0 ? (
          <div className="exq-adm-new__alternatives">
            <p>Open times nearby:</p>
            <ul>
              {alternatives.map((a) => {
                const parts = shopParts(a.startAt);
                return (
                  <li key={`${a.staffId}-${a.startAt}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setDate(parts.date);
                        setTime(parts.time);
                        setStartNow(false);
                      }}
                    >
                      {shopDateTime(a.startAt)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <button
          type="submit"
          className="exq-adm-new__submit"
          disabled={working || serviceIds.length === 0}
        >
          {source === 'phone' ? 'Book it' : 'Add walk-in'}
        </button>
      </form>
    </article>
  );
}
