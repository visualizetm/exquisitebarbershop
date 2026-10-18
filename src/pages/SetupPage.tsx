import { useState } from 'react';
import { z } from 'zod';
import { Button, EmptyState, Input } from '@/components/ui';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePageMeta } from '@/lib/usePageTitle';
import { NotFoundPage } from './NotFoundPage';

const setupStatusSchema = z.object({ enabled: z.boolean() });
const checkSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(['pass', 'warn', 'fail']),
  detail: z.string(),
  fix: z.string().optional(),
});
const doctorSchema = z.object({
  ok: z.boolean(),
  environment: z.string(),
  checkedAt: z.string(),
  checks: z.array(checkSchema),
});
const clearedSchema = z.object({ cleared: z.literal(true) });
const bootstrapSchema = z.object({
  firstRun: z.boolean(),
  runs: z.number(),
  created: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
});
type Doctor = z.infer<typeof doctorSchema>;
type Bootstrap = z.infer<typeof bootstrapSchema>;

const STATUS_WORD = { pass: 'OK', warn: 'Check', fail: 'Fix' } as const;
const CREATED_LABEL: Record<string, string> = {
  settingsCreated: 'Shop settings',
  shopHoursCreated: 'Shop hours',
  servicesCreated: 'Services',
  staffCreated: 'Chairs',
  staffHoursCreated: 'Chair hours',
  ownerLogin: 'Owner login',
  indexes: 'Database indexes',
  sampleBookings: 'Sample bookings',
  demo: 'Demo data',
};

/**
 * First-time setup from the browser: paste BOOTSTRAP_SECRET, run the doctor
 * and run setup. Exists only while BOOTSTRAP_SECRET is set; never indexed.
 */
export function SetupPage() {
  usePageMeta({ title: 'Setup', noindex: true });
  const status = useApi('/api/setup', setupStatusSchema);
  const [secret, setSecret] = useState('');
  const [working, setWorking] = useState<'doctor' | 'setup' | 'clear' | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [result, setResult] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [force, setForce] = useState(false);

  if (status.status === 'loading') return <Status state="loading" />;
  if (status.status === 'error' || !status.data.enabled) return <NotFoundPage />;

  const headers = { Authorization: `Bearer ${secret}` };
  const run = async (what: 'doctor' | 'setup' | 'clear') => {
    setWorking(what);
    setError(null);
    try {
      if (what === 'clear') {
        await apiRequest('/api/internal/demo/clear', clearedSchema, {
          method: 'POST',
          body: {},
          headers,
        });
        setCleared(true);
        setConfirmClear(false);
        setResult(null);
        setDoctor(null);
      } else if (what === 'doctor') {
        setDoctor(await apiRequest('/api/internal/doctor', doctorSchema, { headers, fresh: true }));
      } else {
        setResult(
          await apiRequest('/api/internal/bootstrap', bootstrapSchema, {
            method: 'POST',
            body: { force },
            headers,
          }),
        );
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message !== 'Not allowed'
          ? err.message
          : 'That secret is not right. Paste BOOTSTRAP_SECRET exactly as it is set in Vercel.',
      );
    } finally {
      setWorking(null);
    }
  };

  return (
    <article className="exq-setup exq-wrap exq-section" data-state={working ?? 'idle'}>
      <p className="exq-label">Setup</p>
      <h1 className="exq-setup__title">Set up the site</h1>
      <p className="exq-setup__intro">
        Paste the setup secret from Vercel, run the doctor to see what is ready, then run setup once
        to load the shop and create the owner login.
      </p>
      <form
        className="exq-setup__form"
        onSubmit={(event) => {
          event.preventDefault();
          void run('doctor');
        }}
      >
        <Input
          id="exq-setup-secret"
          label="Setup secret (BOOTSTRAP_SECRET)"
          type="password"
          autoComplete="off"
          value={secret}
          onChange={(e) => {
            setSecret(e.target.value);
          }}
          required
        />
        <p className="exq-setup__actions">
          <Button type="submit" variant="secondary" loading={working === 'doctor'}>
            Run doctor
          </Button>
          <Button
            loading={working === 'setup'}
            disabled={secret.length === 0 || working !== null}
            onClick={() => void run('setup')}
          >
            Run setup
          </Button>
        </p>
        <label className="exq-setup__force">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => {
              setForce(e.target.checked);
            }}
          />{' '}
          Run setup again even though it already ran (adds nothing that exists)
        </label>
      </form>
      <section className="exq-setup__demo" aria-labelledby="exq-setup-demo">
        <h2 id="exq-setup-demo">Leaving the showcase</h2>
        <p className="exq-muted">
          Turn DEMO_MODE off in Vercel and redeploy, then clear the sample shop here and run setup
          again with the real owner login. Clearing only works on a database the demo filled, and it
          removes everything in it: bookings, photos, logins and settings.
        </p>
        <label className="exq-setup__force">
          <input
            type="checkbox"
            checked={confirmClear}
            onChange={(e) => {
              setConfirmClear(e.target.checked);
            }}
          />{' '}
          I understand this deletes the whole demo shop
        </label>
        <p className="exq-setup__actions">
          <Button
            variant="secondary"
            loading={working === 'clear'}
            disabled={secret.length === 0 || !confirmClear || working !== null}
            onClick={() => void run('clear')}
          >
            Clear demo data
          </Button>
        </p>
        {cleared ? (
          <p className="exq-setup__notice" role="status">
            Demo data cleared. Run setup now to create the real shop and owner login.
          </p>
        ) : null}
      </section>
      {error ? (
        <p className="exq-setup__error" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <section className="exq-setup__result" aria-labelledby="exq-setup-result">
          <h2 id="exq-setup-result">
            {result.firstRun ? 'Setup ran' : `Setup ran again (run ${result.runs})`}
          </h2>
          <ul className="exq-setup__list">
            {Object.entries(result.created).map(([key, value]) => (
              <li key={key} className="exq-setup__check" data-state="pass">
                <span className="exq-setup__status">OK</span>
                <span>
                  <strong>{CREATED_LABEL[key] ?? key}</strong>:{' '}
                  {typeof value === 'boolean'
                    ? value
                      ? 'created or present'
                      : 'already there'
                    : String(value)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {doctor ? (
        <section
          className="exq-setup__result"
          aria-labelledby="exq-setup-doctor"
          data-state={doctor.ok ? 'ok' : 'problems'}
        >
          <h2 id="exq-setup-doctor">
            {doctor.ok ? 'Everything checks out' : 'Some things need fixing'}
          </h2>
          <p className="exq-muted">
            Environment: {doctor.environment}. Checked {new Date(doctor.checkedAt).toLocaleString()}
            .
          </p>
          <ul className="exq-setup__list">
            {doctor.checks.map((check) => (
              <li key={check.id} className="exq-setup__check" data-state={check.status}>
                <span className="exq-setup__status">{STATUS_WORD[check.status]}</span>
                <span>
                  <strong>{check.label}</strong>: {check.detail}
                  {check.fix && check.status !== 'pass' ? (
                    <span className="exq-setup__fix"> {check.fix}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : result === null ? (
        <EmptyState title="Nothing checked yet">Run the doctor to see the checklist.</EmptyState>
      ) : null}
    </article>
  );
}
