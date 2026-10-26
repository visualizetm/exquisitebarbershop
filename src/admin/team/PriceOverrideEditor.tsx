import { useId, useState } from 'react';
import type { SyntheticEvent } from 'react';
import type { AdminServiceView } from '@shared/api/admin';
import { parseDollarsToCents } from '@shared/lib/money';
import type { ServicePrice } from '@shared/schemas/staff';
import { Button, Input } from '@/components/ui';
import { ErrorNote } from '../components/ErrorNote';
import { money } from '../format';

/** What the owner has typed for one service: dollars and minutes, both empty for "use the shop's". */
interface Draft {
  price: string;
  minutes: string;
}

interface Parsed {
  entry: ServicePrice | null;
  priceError?: string;
  minutesError?: string;
}

const EMPTY: Draft = { price: '', minutes: '' };

function draftOf(entry: ServicePrice | undefined): Draft {
  if (!entry) return EMPTY;
  return {
    price: (entry.priceCents / 100).toFixed(2),
    minutes: entry.durationMinutes === undefined ? '' : String(entry.durationMinutes),
  };
}

/**
 * A price left empty keeps the shop's price (a time on its own saves the shop's current price with
 * it); a time left empty keeps the shop's time. Both empty means no override for the service.
 */
function parseDraft(service: AdminServiceView, draft: Draft): Parsed {
  const price = draft.price.trim();
  const minutes = draft.minutes.trim();
  if (price === '' && minutes === '') return { entry: null };
  const out: Parsed = { entry: null };
  let priceCents = service.priceCents;
  if (price !== '') {
    const cents = parseDollarsToCents(price);
    if (cents === null) out.priceError = 'Enter dollars, for example 45 or 45.50';
    else priceCents = cents;
  }
  let durationMinutes: number | undefined;
  if (minutes !== '') {
    const n = Number(minutes);
    if (!Number.isInteger(n) || n < 5 || n > 480 || n % 5 !== 0) {
      out.minutesError = 'Whole minutes in steps of 5, from 5 to 480';
    } else {
      durationMinutes = n;
    }
  }
  if (out.priceError || out.minutesError) return out;
  out.entry = {
    serviceId: service.id,
    priceCents,
    ...(durationMinutes === undefined ? {} : { durationMinutes }),
  };
  return out;
}

function sameEntries(a: readonly ServicePrice[], b: readonly ServicePrice[]): boolean {
  const key = (list: readonly ServicePrice[]) =>
    JSON.stringify(
      [...list]
        .sort((x, y) => x.serviceId.localeCompare(y.serviceId))
        .map((e) => [e.serviceId, e.priceCents, e.durationMinutes ?? null]),
    );
  return key(a) === key(b);
}

/**
 * One barber's own prices and times. Barbers charge different amounts for the same cut, so the shop
 * price on a service is the default and this list overrides it for one person. The editor holds
 * what is typed and checks it; `onSave` does the saving (the Team tab sends it, the kit fakes it).
 * It shows every state: nothing set yet, changed, a field in error, saving, a refused save, and a
 * Save button that stays off until something changed. Bookings already made keep their price.
 */
export function PriceOverrideEditor({
  staffName,
  services,
  saved: savedAll,
  onSave,
  onChooseServices,
}: {
  staffName: string;
  /** The services on this barber's menu, with the shop's price and time for each. */
  services: AdminServiceView[];
  /** The overrides stored now. */
  saved: ServicePrice[];
  /** Saves the full list. A rejection is shown under the form. */
  onSave: (entries: ServicePrice[]) => Promise<void>;
  /** Opens the tab where the barber's services are chosen, for the empty state. */
  onChooseServices?: () => void;
}) {
  const menu = services;
  const saved = savedAll.filter((p) => menu.some((s) => s.id === p.serviceId));
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(menu.map((s) => [s.id, draftOf(saved.find((p) => p.serviceId === s.id))])),
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const uid = useId();

  const rows = menu.map((service) => {
    const draft = drafts[service.id] ?? EMPTY;
    return { service, draft, parsed: parseDraft(service, draft) };
  });
  const next = rows.flatMap((r) => (r.parsed.entry ? [r.parsed.entry] : []));
  const invalid = rows.some(
    (r) => r.parsed.priceError !== undefined || r.parsed.minutesError !== undefined,
  );
  const changed = !sameEntries(next, saved);

  function edit(serviceId: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [serviceId]: { ...(prev[serviceId] ?? EMPTY), ...patch } }));
  }

  async function save(event: SyntheticEvent) {
    event.preventDefault();
    if (invalid) return;
    setWorking(true);
    setError(null);
    try {
      await onSave(next);
    } catch (err) {
      setError(err);
    } finally {
      setWorking(false);
    }
  }

  if (menu.length === 0) {
    return (
      <div className="exq-panelbody exq-priceedit" data-state="empty">
        <h2 className="exq-bsheet__h">Prices</h2>
        <p className="exq-muted">
          {staffName} has no services yet, so there is nothing to price. Choose the services they do
          first.
        </p>
        {onChooseServices ? (
          <div>
            <Button variant="outline" onClick={onChooseServices}>
              Choose services
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="exq-panelbody exq-priceedit"
      onSubmit={(e) => void save(e)}
      data-state={working ? 'saving' : invalid ? 'invalid' : changed ? 'changed' : 'idle'}
    >
      <h2 className="exq-bsheet__h">Prices</h2>
      <p className="exq-muted">
        Fill in a price or a time only where {staffName} differs from the shop. Empty means the shop
        price and time. Customers see these on {staffName}&apos;s page, and the booking total uses
        them when {staffName} is the one booked. Bookings already made keep their price.
      </p>
      {rows.map(({ service, draft, parsed }) => {
        const custom = draft.price.trim() !== '' || draft.minutes.trim() !== '';
        const labelId = `${uid}-${service.id}`;
        return (
          <div
            key={service.id}
            className="exq-priceedit__row"
            role="group"
            aria-labelledby={labelId}
            data-state={custom ? 'custom' : 'shop'}
          >
            <div className="exq-priceedit__head">
              <span id={labelId} className="exq-priceedit__name">
                {service.name}
              </span>
              <span className="exq-priceedit__shop">
                Shop: {service.priceFrom ? 'from ' : ''}
                {money(service.priceCents)}, {service.durationMinutes} min
                {service.isActive ? '' : ', hidden'}
              </span>
            </div>
            <div className="exq-priceedit__fields">
              <Input
                label={
                  <>
                    Price in dollars
                    <span className="exq-visually-hidden"> for {service.name}</span>
                  </>
                }
                inputMode="decimal"
                autoComplete="off"
                placeholder={(service.priceCents / 100).toFixed(2)}
                disabled={working}
                value={draft.price}
                error={parsed.priceError}
                onChange={(e) => {
                  edit(service.id, { price: e.target.value });
                }}
              />
              <Input
                label={
                  <>
                    Minutes
                    <span className="exq-visually-hidden"> for {service.name}</span>
                  </>
                }
                inputMode="numeric"
                autoComplete="off"
                placeholder={String(service.durationMinutes)}
                disabled={working}
                value={draft.minutes}
                error={parsed.minutesError}
                onChange={(e) => {
                  edit(service.id, { minutes: e.target.value });
                }}
              />
            </div>
            {custom ? (
              <div>
                <Button
                  variant="ghost"
                  disabled={working}
                  onClick={() => {
                    edit(service.id, EMPTY);
                  }}
                  aria-label={`Use the shop price and time for ${service.name}`}
                >
                  Use shop price
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
      <ErrorNote error={error} />
      <div>
        <Button
          type="submit"
          loading={working}
          disabled={working ? undefined : !changed || invalid}
        >
          Save prices
        </Button>
      </div>
    </form>
  );
}
