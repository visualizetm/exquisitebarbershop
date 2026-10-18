import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { settingsResponseSchema } from '@shared/api/admin';
import { logoutAllResponseSchema, meResponseSchema, okResponseSchema } from '@shared/api/auth';
import {
  Button,
  Checkbox,
  ErrorState,
  Input,
  Modal,
  Tabs,
  ThemeSwitch,
  useToast,
} from '@/components/ui';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { ErrorNote } from '../components/ErrorNote';
import { useQuick } from '../shell/quick';
import { useMe, useSession } from '../useSession';

type Settings = ReturnType<typeof settingsResponseSchema.parse>['settings'];

const MINUTES_PER_HOUR = 60;
const hoursOf = (minutes: number) => minutes / MINUTES_PER_HOUR;
const minutesOf = (hours: number) => Math.round(hours * MINUTES_PER_HOUR);

/**
 * Settings: shop details and social links, the booking rules, the owner's own login, a read-only
 * look at email, and (demo only) the reset. Every form saves the whole settings document, so a
 * field that has no control here keeps the value it has.
 */
export function SettingsPage() {
  usePageTitle('Settings');
  const demo = useMe().features.demo;
  const [params, setParams] = useSearchParams();
  const tabs = [
    { id: 'shop', label: 'Shop info' },
    { id: 'rules', label: 'Booking rules' },
    { id: 'account', label: 'Account' },
    { id: 'email', label: 'Email' },
    ...(demo ? [{ id: 'demo', label: 'Demo data' }] : []),
  ];
  const current = tabs.find((t) => t.id === params.get('tab'))?.id ?? 'shop';
  return (
    <div className="exq-settings">
      <div className="exq-dash-head">
        <h1>Settings</h1>
      </div>
      <Tabs
        label="Settings sections"
        tabs={tabs}
        value={current}
        onChange={(id) => {
          setParams({ tab: id }, { replace: true });
        }}
      >
        <div className="exq-tabbody">
          {current === 'shop' || current === 'rules' ? <SettingsForms which={current} /> : null}
          {current === 'account' ? <AccountTab /> : null}
          {current === 'email' ? <EmailTab /> : null}
          {current === 'demo' ? <DemoTab /> : null}
        </div>
      </Tabs>
    </div>
  );
}

function SettingsForms({ which }: { which: 'shop' | 'rules' }) {
  const [version, setVersion] = useState(0);
  const loaded = useApi('/api/admin/settings', settingsResponseSchema, { version });
  if (loaded.status === 'error') {
    return (
      <ErrorState title="The settings did not load">
        Check the connection and reload the page.
      </ErrorState>
    );
  }
  if (loaded.status !== 'ready') return <Status state="loading" />;
  const initial = loaded.data.settings;
  const onSaved = () => {
    setVersion((v) => v + 1);
  };
  return which === 'shop' ? (
    <ShopForm key={version} initial={initial} onSaved={onSaved} />
  ) : (
    <RulesForm key={version} initial={initial} onSaved={onSaved} />
  );
}

/** PUT the whole document with one section changed; the server validates every field again. */
function useSave(onSaved: () => void, done: string) {
  const toast = useToast();
  const quick = useQuick();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function save(next: Settings) {
    setWorking(true);
    setError(null);
    try {
      await apiRequest('/api/admin/settings', settingsResponseSchema, {
        method: 'PUT',
        body: next,
      });
      quick.changed();
      toast({ text: done, tone: 'ok' });
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setWorking(false);
    }
  }
  return { save, working, error };
}

function ShopForm({ initial, onSaved }: { initial: Settings; onSaved: () => void }) {
  const [s, setS] = useState<Settings>(initial);
  const { save, working, error } = useSave(
    onSaved,
    'Shop info saved. The site shows it right away.',
  );
  const setAddress = (key: keyof Settings['address'], value: string) => {
    setS((prev) => ({
      ...prev,
      address: { ...prev.address, [key]: key === 'line2' && value === '' ? null : value },
    }));
  };
  const setSocial = (key: keyof Settings['social'], value: string) => {
    setS((prev) => ({ ...prev, social: { ...prev.social, [key]: value } }));
  };
  function submit(event: SyntheticEvent) {
    event.preventDefault();
    void save(s);
  }
  return (
    <form className="exq-panelbody exq-settings__form" onSubmit={submit}>
      <Input
        label="Shop name"
        required
        value={s.name}
        onChange={(e) => {
          setS({ ...s, name: e.target.value });
        }}
      />
      <div className="exq-panelbody__row">
        <Input
          label="Shop phone"
          type="tel"
          required
          value={s.phone}
          onChange={(e) => {
            setS({ ...s, phone: e.target.value });
          }}
        />
        <Input
          label="Shop email"
          type="email"
          required
          value={s.email}
          onChange={(e) => {
            setS({ ...s, email: e.target.value });
          }}
        />
      </div>
      <Input
        label="Send new booking alerts to"
        type="email"
        required
        value={s.notifications.ownerAlertEmail}
        onChange={(e) => {
          setS({ ...s, notifications: { ...s.notifications, ownerAlertEmail: e.target.value } });
        }}
      />
      <fieldset className="exq-settings__group">
        <legend>Address</legend>
        <Input
          label="Street"
          required
          value={s.address.line1}
          onChange={(e) => {
            setAddress('line1', e.target.value);
          }}
        />
        <Input
          label="Suite or unit (optional)"
          value={s.address.line2 ?? ''}
          onChange={(e) => {
            setAddress('line2', e.target.value);
          }}
        />
        <div className="exq-panelbody__row">
          <Input
            label="City"
            required
            value={s.address.city}
            onChange={(e) => {
              setAddress('city', e.target.value);
            }}
          />
          <Input
            label="State"
            required
            maxLength={2}
            value={s.address.state}
            onChange={(e) => {
              setAddress('state', e.target.value.toUpperCase());
            }}
          />
          <Input
            label="ZIP"
            required
            inputMode="numeric"
            value={s.address.postalCode}
            onChange={(e) => {
              setAddress('postalCode', e.target.value);
            }}
          />
        </div>
      </fieldset>
      <fieldset className="exq-settings__group">
        <legend>Social links</legend>
        <p className="exq-muted">An icon shows in the site footer only for a link you fill in.</p>
        <Input
          label="Instagram page"
          type="url"
          inputMode="url"
          placeholder="https://instagram.com/yourshop"
          value={s.social.instagramUrl}
          onChange={(e) => {
            setSocial('instagramUrl', e.target.value);
          }}
        />
        <Input
          label="TikTok page"
          type="url"
          inputMode="url"
          placeholder="https://tiktok.com/@yourshop"
          value={s.social.tiktokUrl}
          onChange={(e) => {
            setSocial('tiktokUrl', e.target.value);
          }}
        />
        <Input
          label="Facebook page"
          type="url"
          inputMode="url"
          placeholder="https://facebook.com/yourshop"
          value={s.social.facebookUrl}
          onChange={(e) => {
            setSocial('facebookUrl', e.target.value);
          }}
        />
      </fieldset>
      <ErrorNote error={error} />
      <div className="exq-panelbody__row">
        <Button type="submit" loading={working}>
          Save shop info
        </Button>
      </div>
    </form>
  );
}

function RulesForm({ initial, onSaved }: { initial: Settings; onSaved: () => void }) {
  const [s, setS] = useState<Settings>(initial);
  const [cutoff, setCutoff] = useState(String(hoursOf(initial.booking.cancelCutoffMinutes)));
  const [notice, setNotice] = useState(String(hoursOf(initial.booking.leadTimeMinutes)));
  const [ahead, setAhead] = useState(String(initial.booking.bookingWindowDays));
  const { save, working, error } = useSave(
    onSaved,
    'Booking rules saved. They apply to the next booking.',
  );
  function submit(event: SyntheticEvent) {
    event.preventDefault();
    const booking = { ...s.booking };
    // One cutoff covers cancelling and rescheduling; untouched, both keep what they had.
    if (minutesOf(Number(cutoff)) !== initial.booking.cancelCutoffMinutes) {
      booking.cancelCutoffMinutes = minutesOf(Number(cutoff));
      booking.rescheduleCutoffMinutes = minutesOf(Number(cutoff));
    }
    booking.leadTimeMinutes = minutesOf(Number(notice));
    booking.bookingWindowDays = Math.round(Number(ahead));
    void save({ ...s, booking });
  }
  const setBooking = <K extends keyof Settings['booking']>(
    key: K,
    value: Settings['booking'][K],
  ) => {
    setS((prev) => ({ ...prev, booking: { ...prev.booking, [key]: value } }));
  };
  return (
    <form className="exq-panelbody exq-settings__form" onSubmit={submit}>
      <Input
        label="Customers can cancel or reschedule online until (hours before)"
        hint="After that they call the shop. You can always change a booking yourself."
        type="number"
        min={0}
        max={168}
        step={0.25}
        required
        value={cutoff}
        onChange={(e) => {
          setCutoff(e.target.value);
        }}
      />
      <Input
        label="Minimum notice to book online (hours)"
        hint="0 lets someone book a chair for right now."
        type="number"
        min={0}
        max={168}
        step={0.25}
        required
        value={notice}
        onChange={(e) => {
          setNotice(e.target.value);
        }}
      />
      <Input
        label="How far ahead customers can book (days)"
        type="number"
        min={1}
        max={365}
        step={1}
        required
        value={ahead}
        onChange={(e) => {
          setAhead(e.target.value);
        }}
      />
      <Checkbox
        label='Offer "Anyone available"'
        checked={s.booking.allowFirstAvailable}
        onChange={(e) => {
          setBooking('allowFirstAvailable', e.target.checked);
        }}
      />
      <Checkbox
        label="Ask for an email to book online"
        checked={s.booking.requireEmail}
        onChange={(e) => {
          setBooking('requireEmail', e.target.checked);
        }}
      />
      <ErrorNote error={error} />
      <div className="exq-panelbody__row">
        <Button type="submit" loading={working}>
          Save booking rules
        </Button>
      </div>
    </form>
  );
}

function AccountTab() {
  const me = useMe();
  const { refresh, signedOut } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState({ newEmail: '', currentPassword: '' });
  const [emailWorking, setEmailWorking] = useState(false);
  const [emailError, setEmailError] = useState<unknown>(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwWorking, setPwWorking] = useState(false);
  const [pwError, setPwError] = useState<unknown>(null);
  const [out, setOut] = useState<{ working: boolean; error: unknown }>({
    working: false,
    error: null,
  });
  const mismatch = pw.confirm.length > 0 && pw.confirm !== pw.newPassword;

  async function changeEmail(event: SyntheticEvent) {
    event.preventDefault();
    setEmailWorking(true);
    setEmailError(null);
    try {
      await apiRequest('/api/me/email', meResponseSchema, { method: 'POST', body: email });
      setEmail({ newEmail: '', currentPassword: '' });
      await refresh();
      toast({ text: 'Sign-in email changed.', tone: 'ok' });
    } catch (err) {
      setEmailError(err);
    } finally {
      setEmailWorking(false);
    }
  }
  async function changePassword(event: SyntheticEvent) {
    event.preventDefault();
    if (mismatch) return;
    setPwWorking(true);
    setPwError(null);
    try {
      await apiRequest('/api/me/password', meResponseSchema, {
        method: 'POST',
        body: { currentPassword: pw.currentPassword, newPassword: pw.newPassword },
      });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      await refresh();
      toast({ text: 'Password changed. Other devices were signed out.', tone: 'ok' });
    } catch (err) {
      setPwError(err);
    } finally {
      setPwWorking(false);
    }
  }
  async function signOutEverywhere() {
    setOut({ working: true, error: null });
    try {
      await apiRequest('/api/auth/logout-all', logoutAllResponseSchema, {
        method: 'POST',
        body: {},
      });
      signedOut();
      void navigate('/admin/login', { replace: true });
    } catch (err) {
      setOut({ working: false, error: err });
    }
  }

  return (
    <div className="exq-settings__stack">
      <section className="exq-settings__section" aria-labelledby="exq-set-email">
        <h2 id="exq-set-email" className="exq-h3">
          Sign-in email
        </h2>
        <p className="exq-muted">You sign in as {me.user.email}.</p>
        <form className="exq-panelbody" onSubmit={(e) => void changeEmail(e)}>
          <Input
            label="New email"
            type="email"
            autoComplete="email"
            required
            value={email.newEmail}
            onChange={(e) => {
              setEmail({ ...email, newEmail: e.target.value });
            }}
          />
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            required
            value={email.currentPassword}
            onChange={(e) => {
              setEmail({ ...email, currentPassword: e.target.value });
            }}
          />
          <ErrorNote error={emailError} />
          <div className="exq-panelbody__row">
            <Button type="submit" loading={emailWorking}>
              Change email
            </Button>
          </div>
        </form>
      </section>
      <section className="exq-settings__section" aria-labelledby="exq-set-pw">
        <h2 id="exq-set-pw" className="exq-h3">
          Password
        </h2>
        <p className="exq-muted">
          At least 12 characters. A short phrase of a few words works well. Changing it signs you
          out on every other device.
        </p>
        <form className="exq-panelbody" onSubmit={(e) => void changePassword(e)}>
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            required
            value={pw.currentPassword}
            onChange={(e) => {
              setPw({ ...pw, currentPassword: e.target.value });
            }}
          />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={pw.newPassword}
            onChange={(e) => {
              setPw({ ...pw, newPassword: e.target.value });
            }}
          />
          <Input
            label="New password again"
            type="password"
            autoComplete="new-password"
            required
            value={pw.confirm}
            error={mismatch ? 'The two new passwords do not match.' : undefined}
            onChange={(e) => {
              setPw({ ...pw, confirm: e.target.value });
            }}
          />
          <ErrorNote error={pwError} />
          <div className="exq-panelbody__row">
            <Button type="submit" loading={pwWorking} disabled={mismatch}>
              Change password
            </Button>
          </div>
        </form>
      </section>
      <section className="exq-settings__section" aria-labelledby="exq-set-theme">
        <h2 id="exq-set-theme" className="exq-h3">
          Appearance
        </h2>
        <p className="exq-muted">System follows your phone or computer. Light and Dark stay put.</p>
        <ThemeSwitch />
      </section>
      <section className="exq-settings__section" aria-labelledby="exq-set-out">
        <h2 id="exq-set-out" className="exq-h3">
          Sign out everywhere
        </h2>
        <p className="exq-muted">
          Ends every session of this login, including this one. Use it if a device was lost.
        </p>
        <ErrorNote error={out.error} />
        <div className="exq-panelbody__row">
          <Button variant="outline" loading={out.working} onClick={() => void signOutEverywhere()}>
            Sign out on every device
          </Button>
        </div>
      </section>
    </div>
  );
}

/** Read-only: whether email goes out, and why. The key lives with the host, never in this screen. */
function EmailTab() {
  const me = useMe();
  const loaded = useApi('/api/admin/settings', settingsResponseSchema);
  const on = me.features.email;
  const why = me.features.demo
    ? 'This is a demo, so nothing is ever sent. Emails that would go out show in the Email log.'
    : on
      ? 'Confirmations go to customers and new-booking alerts go to the address in Shop info.'
      : 'Email sending is not connected yet. Bookings still work; customers just are not emailed. Rob adds the sending key in the host settings to switch it on.';
  const notifications = loaded.status === 'ready' ? loaded.data.settings.notifications : null;
  return (
    <section
      className="exq-settings__section"
      aria-labelledby="exq-set-mail"
      data-state={on ? 'on' : 'off'}
    >
      <h2 id="exq-set-mail" className="exq-h3">
        Email is {on ? 'on' : 'off'}
      </h2>
      <p>{why}</p>
      {notifications ? (
        <dl className="exq-settings__facts">
          <dt>Customer confirmations</dt>
          <dd>{notifications.customerConfirmationEmail ? 'Sent' : 'Not sent'}</dd>
          <dt>New booking alerts to you</dt>
          <dd>
            {notifications.ownerNewBookingEmail
              ? `Sent to ${notifications.ownerAlertEmail}`
              : 'Not sent'}
          </dd>
        </dl>
      ) : null}
      <p>
        <Link to="/admin/outbox">See the email log</Link>
        {' · '}
        <Link to="/admin/audit">See the change history</Link>
      </p>
    </section>
  );
}

function DemoTab() {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function reset() {
    setWorking(true);
    setError(null);
    try {
      await apiRequest('/api/admin/demo/reset', okResponseSchema, { method: 'POST', body: {} });
      // Every screen holds data that no longer exists, so start from a clean load.
      window.location.assign('/admin');
    } catch (err) {
      setError(err);
      setWorking(false);
    }
  }
  return (
    <section className="exq-settings__section" aria-labelledby="exq-set-demo">
      <h2 id="exq-set-demo" className="exq-h3">
        Demo data
      </h2>
      <p>
        This is a showcase. Everything here is sample data: the shop, the chairs, the services and
        the bookings.
      </p>
      <p>
        Reset wipes all of it, including photos and any barber setup you did, and loads the sample
        shop again. You stay signed in.
      </p>
      <ErrorNote error={error} />
      <div className="exq-panelbody__row">
        <Button
          variant="outline"
          onClick={() => {
            setConfirming(true);
          }}
        >
          Reset demo data
        </Button>
      </div>
      <Modal
        open={confirming}
        title="Reset demo data?"
        onClose={() => {
          setConfirming(false);
        }}
      >
        <div className="exq-panelbody">
          <p>Bookings, photos and every change you made are replaced with the sample data.</p>
          <div className="exq-panelbody__row">
            <Button loading={working} onClick={() => void reset()}>
              Reset it
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setConfirming(false);
              }}
            >
              Keep it
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
