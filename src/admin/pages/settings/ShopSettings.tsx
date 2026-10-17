import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { settingsResponseSchema } from '@shared/api/admin';
import type { ShopSettingsInput } from '@shared/schemas/shopSettings';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ErrorNote } from '../../components/ErrorNote';

type Settings = ReturnType<typeof settingsResponseSchema.parse>['settings'];

/** The booking rules, contact details, email switches and what barbers may do on their own. */
export function ShopSettings() {
  const [version, setVersion] = useState(0);
  const loaded = useApi('/api/admin/settings', settingsResponseSchema, { version });
  if (loaded.status !== 'ready') {
    return (
      <section className="exq-adm-shop" data-state={loaded.status}>
        <h2>Shop settings</h2>
        <Status state={loaded.status} />
      </section>
    );
  }
  return (
    <ShopSettingsForm
      key={version}
      initial={loaded.data.settings}
      onSaved={() => {
        setVersion((v) => v + 1);
      }}
    />
  );
}

const NUMBER_FIELDS = [
  ['leadTimeMinutes', 'Minimum notice for online booking (minutes)'],
  ['bookingWindowDays', 'How many days ahead customers can book'],
  ['bufferMinutes', 'Cleanup minutes after each booking'],
  ['slotStepMinutes', 'Start times every (minutes)'],
  ['cancelCutoffMinutes', 'Online cancel allowed until (minutes before)'],
  ['rescheduleCutoffMinutes', 'Online reschedule allowed until (minutes before)'],
  ['maxServicesPerBooking', 'Most services in one booking'],
  ['maxOpenBookingsPerPhone', 'Most upcoming bookings per phone number'],
] as const;

function ShopSettingsForm({ initial, onSaved }: { initial: Settings; onSaved: () => void }) {
  const [s, setS] = useState<Settings>(initial);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  function setBooking<K extends keyof Settings['booking']>(key: K, value: Settings['booking'][K]) {
    setS((prev) => ({ ...prev, booking: { ...prev.booking, [key]: value } }));
  }
  function setNotify<K extends keyof Settings['notifications']>(
    key: K,
    value: Settings['notifications'][K],
  ) {
    setS((prev) => ({ ...prev, notifications: { ...prev.notifications, [key]: value } }));
  }

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    setSaved(false);
    try {
      const body: ShopSettingsInput = s;
      await apiRequest('/api/admin/settings', settingsResponseSchema, { method: 'PUT', body });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section
      className="exq-adm-shop"
      data-state={working ? 'working' : saved ? 'saved' : 'idle'}
      aria-labelledby="exq-adm-shop-title"
    >
      <h2 id="exq-adm-shop-title">Shop settings</h2>
      <form className="exq-adm-shop__form" onSubmit={(e) => void submit(e)}>
        <fieldset>
          <legend>Contact</legend>
          <p>
            <label htmlFor="exq-adm-shop-phone">Shop phone</label>{' '}
            <input
              id="exq-adm-shop-phone"
              type="tel"
              value={s.phone}
              onChange={(e) => {
                setS({ ...s, phone: e.target.value });
              }}
            />
          </p>
          <p>
            <label htmlFor="exq-adm-shop-email">Shop email</label>{' '}
            <input
              id="exq-adm-shop-email"
              type="email"
              value={s.email}
              onChange={(e) => {
                setS({ ...s, email: e.target.value });
              }}
            />
          </p>
        </fieldset>
        <fieldset>
          <legend>Booking rules</legend>
          {NUMBER_FIELDS.map(([key, label]) => (
            <p key={key}>
              <label htmlFor={`exq-adm-shop-${key}`}>{label}</label>{' '}
              <input
                id={`exq-adm-shop-${key}`}
                type="number"
                min={0}
                value={s.booking[key]}
                onChange={(e) => {
                  setBooking(key, Number(e.target.value));
                }}
              />
            </p>
          ))}
          <p>
            <label>
              <input
                type="checkbox"
                checked={s.booking.allowFirstAvailable}
                onChange={(e) => {
                  setBooking('allowFirstAvailable', e.target.checked);
                }}
              />{' '}
              Offer "first available"
            </label>
          </p>
          <p>
            <label>
              <input
                type="checkbox"
                checked={s.booking.requireEmail}
                onChange={(e) => {
                  setBooking('requireEmail', e.target.checked);
                }}
              />{' '}
              Require an email to book online
            </label>
          </p>
        </fieldset>
        <fieldset>
          <legend>Emails</legend>
          <p>
            <label htmlFor="exq-adm-shop-alert">Send new booking alerts to</label>{' '}
            <input
              id="exq-adm-shop-alert"
              type="email"
              value={s.notifications.ownerAlertEmail}
              onChange={(e) => {
                setNotify('ownerAlertEmail', e.target.value);
              }}
            />
          </p>
          <p>
            <label>
              <input
                type="checkbox"
                checked={s.notifications.ownerNewBookingEmail}
                onChange={(e) => {
                  setNotify('ownerNewBookingEmail', e.target.checked);
                }}
              />{' '}
              Email me each new online booking
            </label>
          </p>
          <p>
            <label>
              <input
                type="checkbox"
                checked={s.notifications.customerConfirmationEmail}
                onChange={(e) => {
                  setNotify('customerConfirmationEmail', e.target.checked);
                }}
              />{' '}
              Email customers their confirmation
            </label>
          </p>
        </fieldset>
        <fieldset>
          <legend>Barbers</legend>
          <p>
            <label>
              <input
                type="checkbox"
                checked={s.permissions.barbersCanBlockTime}
                onChange={(e) => {
                  setS({
                    ...s,
                    permissions: { ...s.permissions, barbersCanBlockTime: e.target.checked },
                  });
                }}
              />{' '}
              Barbers may block their own time (lunch, time off)
            </label>
          </p>
        </fieldset>
        <ErrorNote error={error} />
        {saved ? <p role="status">Settings saved.</p> : null}
        <button type="submit" disabled={working}>
          Save settings
        </button>
      </form>
    </section>
  );
}
