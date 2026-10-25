import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import {
  manualBookingResponseSchema,
  serviceListResponseSchema,
  staffListResponseSchema,
} from '@shared/api/admin';
import { Button, Checkbox, Chip, Chips, Input, Select, Textarea, useToast } from '@/components/ui';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { offeredServices } from '@/lib/booking/offered';
import { useApi } from '@/lib/useApi';
import { Status } from '@/components/Status';
import { ErrorNote } from '../components/ErrorNote';
import {
  money,
  newIdempotencyKey,
  shopDateTime,
  shopInstant,
  shopParts,
  todayInShop,
} from '../format';
import { useQuick, type NewBookingPrefill } from '../shell/quick';

/**
 * A phone booking or a walk-in. Phone bookings follow normal availability unless the owner
 * overrides lead time or the booking window; walk-ins start now or later today. The barber and
 * the start time can arrive prefilled, from a click on an empty slot of the schedule.
 */
export function NewBookingPanel({
  prefill,
  onDone,
}: {
  prefill: NewBookingPrefill;
  onDone: () => void;
}) {
  const quick = useQuick();
  const toast = useToast();
  const services = useApi('/api/admin/services', serviceListResponseSchema);
  const staff = useApi('/api/admin/staff', staffListResponseSchema);
  const start = prefill.startAt ? shopParts(prefill.startAt) : null;
  const [source, setSource] = useState<'phone' | 'walkIn'>(prefill.source ?? 'phone');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [chair, setChair] = useState<string | null>(null);
  const [date, setDate] = useState(start?.date ?? todayInShop());
  const [time, setTime] = useState(start?.time ?? '');
  const [startNow, setStartNow] = useState(prefill.startAt === undefined);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [override, setOverride] = useState(false);
  const [notify, setNotify] = useState<boolean | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (services.status !== 'ready' || staff.status !== 'ready') {
    return (
      <div
        className="exq-panelbody"
        data-state={services.status === 'error' || staff.status === 'error' ? 'error' : 'loading'}
      >
        <Status
          state={services.status === 'error' || staff.status === 'error' ? 'error' : 'loading'}
        />
      </div>
    );
  }
  const bookable = services.data.services.filter((s) => s.isActive && !s.deletedAt);
  const chairs = staff.data.staff.filter((s) => !s.deletedAt);
  const prefillSlug = prefill.staffId
    ? chairs.find((s) => s.id === prefill.staffId)?.slug
    : undefined;
  const selectedChair =
    chair ?? prefillSlug ?? (source === 'walkIn' ? (chairs[0]?.slug ?? 'any') : 'any');
  const wantsNotify = notify ?? (source === 'phone' && email.trim() !== '');
  const alternatives =
    error instanceof ApiRequestError && error.code === 'SLOT_TAKEN'
      ? (error.alternatives ?? [])
      : [];
  // A chair only offers its own menu, and another chair's service would be refused, so a chosen
  // barber narrows the list. "First available" shows every service.
  const chairDoc = selectedChair === 'any' ? null : chairs.find((s) => s.slug === selectedChair);
  const shown = offeredServices(bookable, chairDoc?.serviceIds ?? null);
  const picked = serviceIds.filter((id) => shown.some((s) => s.id === id));
  const total = shown
    .filter((s) => picked.includes(s.id))
    .reduce((sum, s) => sum + s.priceCents, 0);

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
          serviceIds: picked,
          staff: selectedChair,
          ...(startAt ? { startAt } : {}),
          customer: { name, phone, email: email.trim() ? email.trim() : null },
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          override: source === 'phone' && override,
          notifyCustomer: wantsNotify,
        },
      });
      quick.changed();
      toast({
        text: `${result.booking.customer.name} is booked with ${result.booking.staff.name}, ${shopDateTime(result.booking.startAt)}.`,
        tone: 'ok',
        action: {
          label: 'Open',
          onClick: () => {
            quick.openBooking(result.booking.id);
          },
        },
      });
      onDone();
    } catch (err) {
      setError(err);
      // A refused request can be fixed and sent again as a new attempt.
      setKey(newIdempotencyKey());
    } finally {
      setWorking(false);
    }
  }

  return (
    <form
      className="exq-panelbody"
      onSubmit={(e) => void submit(e)}
      data-state={working ? 'working' : 'idle'}
    >
      <Chips label="Type">
        {(['phone', 'walkIn'] as const).map((s) => (
          <Chip
            key={s}
            selected={source === s}
            onClick={() => {
              setSource(s);
              setNotify(null);
            }}
          >
            {s === 'phone' ? 'Phone booking' : 'Walk-in'}
          </Chip>
        ))}
      </Chips>

      <fieldset className="exq-fieldset">
        <legend>Services</legend>
        {shown.length === 0 ? (
          <p className="exq-muted">
            {chairDoc?.name} has no services yet. Add some under Team, Services.
          </p>
        ) : null}
        {shown.map((s) => (
          <Checkbox
            key={s.id}
            label={s.name}
            hint={`${s.durationMinutes} min, ${s.priceFrom ? 'from ' : ''}${money(s.priceCents)}`}
            checked={serviceIds.includes(s.id)}
            onChange={(e) => {
              setServiceIds((prev) =>
                e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
              );
            }}
          />
        ))}
        {picked.length > 0 ? <p className="exq-muted">Total {money(total)}</p> : null}
      </fieldset>

      <Select
        label="Barber"
        value={selectedChair}
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
      </Select>

      {source === 'walkIn' ? (
        <Checkbox
          label="Starting now"
          checked={startNow}
          onChange={(e) => {
            setStartNow(e.target.checked);
          }}
        />
      ) : null}
      {source === 'phone' || !startNow ? (
        <div className="exq-panelbody__row">
          {source === 'phone' ? (
            <Input
              label="Day"
              type="date"
              required
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
              }}
            />
          ) : null}
          <Input
            label="Time"
            type="time"
            step={source === 'phone' ? 900 : 60}
            required
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              if (source === 'walkIn') setDate(todayInShop());
            }}
          />
        </div>
      ) : null}

      <Input
        label="Client name"
        required
        autoComplete="off"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
      <Input
        label="Phone"
        type="tel"
        required
        autoComplete="off"
        value={phone}
        onChange={(e) => {
          setPhone(e.target.value);
        }}
      />
      <Input
        label="Email (optional)"
        type="email"
        autoComplete="off"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
        }}
      />
      <Textarea
        label="Notes (optional)"
        maxLength={500}
        rows={2}
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
        }}
      />
      <Checkbox
        label="Email the client a confirmation"
        checked={wantsNotify}
        disabled={email.trim() === ''}
        onChange={(e) => {
          setNotify(e.target.checked);
        }}
      />
      {source === 'phone' ? (
        <Checkbox
          label="Allow inside the lead time or past the booking window"
          hint="Recorded in the audit log."
          checked={override}
          onChange={(e) => {
            setOverride(e.target.checked);
          }}
        />
      ) : null}

      <ErrorNote error={error} />
      {alternatives.length > 0 ? (
        <div className="exq-panelbody__alts">
          <p className="exq-muted">Open times nearby:</p>
          <Chips label="Open times nearby">
            {alternatives.map((a) => {
              const parts = shopParts(a.startAt);
              return (
                <Chip
                  key={`${a.staffId}-${a.startAt}`}
                  onClick={() => {
                    setDate(parts.date);
                    setTime(parts.time);
                    setStartNow(false);
                  }}
                >
                  {shopDateTime(a.startAt)}
                </Chip>
              );
            })}
          </Chips>
        </div>
      ) : null}
      <Button type="submit" loading={working} disabled={picked.length === 0}>
        {source === 'phone' ? 'Book it' : 'Add walk-in'}
      </Button>
    </form>
  );
}
