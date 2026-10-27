import { useState } from 'react';
import { okResponseSchema } from '@shared/api/auth';
import { publicShopSchema, publicStaffListResponseSchema } from '@shared/api/public';
import { DEMO_PIN } from '@shared/lib/pin';
import { Button, EmptyState, ErrorState, Mark, PinPad } from '@/components/ui';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { Avatar } from '@/admin/components/Avatar';
import { useTeamSession } from './useTeamSession';

/**
 * One shared link for the whole shop: tap your card, then your six digit PIN on a big pad. Nobody
 * types a name. Every wrong try gets the same words, so the screen never says whether the name
 * or the PIN was at fault.
 */
export function SignIn() {
  usePageTitle('Team sign in');
  const { refresh } = useTeamSession();
  const staff = useApi('/api/staff', publicStaffListResponseSchema);
  // Public and cached for a minute: says whether this deployment is the showcase.
  const shop = useApi('/api/shop', publicShopSchema);
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const demo = shop.status === 'ready' && shop.data.demo === true;

  async function submit(pin: string) {
    if (!chosen) return;
    setWorking(true);
    setError(null);
    try {
      await apiRequest('/api/team/login', okResponseSchema, {
        method: 'POST',
        body: { staffId: chosen.id, pin },
      });
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiRequestError &&
          (err.code === 'ACCOUNT_LOCKED' || err.code === 'RATE_LIMITED')
          ? err.message
          : err instanceof ApiRequestError && err.status === 401
            ? 'That PIN did not work. Try again.'
            : 'Could not sign in. Try again.',
      );
      setResetKey((k) => k + 1);
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="exq-team-signin" data-state={chosen ? 'pin' : 'names'}>
      <header className="exq-team-signin__top">
        <Mark name="disc" alt="Exquisite" width={44} height={44} />
        <span className="exq-label">Team portal</span>
      </header>
      {chosen ? (
        <section aria-labelledby="exq-team-pin-title" className="exq-team-signin__panel">
          <h1 id="exq-team-pin-title" className="exq-team-signin__title">
            Hi, {chosen.name}
          </h1>
          <p className="exq-muted">Enter your 6 digit PIN.</p>
          <PinPad
            label={`PIN for ${chosen.name}`}
            onComplete={(pin) => void submit(pin)}
            disabled={working}
            error={error}
            resetKey={resetKey}
            revealable
          />
          {demo ? <p className="exq-team-signin__demo">Demo PIN: {DEMO_PIN}</p> : null}
          <Button
            variant="ghost"
            onClick={() => {
              setChosen(null);
              setError(null);
            }}
          >
            Not {chosen.name}? Choose again
          </Button>
        </section>
      ) : (
        <section aria-labelledby="exq-team-names-title" className="exq-team-signin__panel">
          <h1 id="exq-team-names-title" className="exq-team-signin__title">
            Who's working?
          </h1>
          <p className="exq-muted">Tap your name, then your PIN.</p>
          {staff.status === 'loading' ? (
            <p className="exq-skeleton exq-team-signin__placeholder" aria-busy="true">
              Loading the team
            </p>
          ) : staff.status === 'error' ? (
            <ErrorState title="The team did not load">Check the connection and reload.</ErrorState>
          ) : staff.data.staff.length === 0 ? (
            <EmptyState title="No one is set up yet">Ask the owner to add you.</EmptyState>
          ) : (
            <ul className="exq-team-signin__names exq-bare">
              {staff.data.staff.map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    className="exq-team-name"
                    onClick={() => {
                      setChosen({ id: member.id, name: member.name });
                    }}
                  >
                    <Avatar name={member.name} photo={member.photo} />
                    <span className="exq-team-name__text">
                      <strong>{member.name}</strong>
                      <span>
                        {member.chairNumber !== null
                          ? `Chair ${String(member.chairNumber).padStart(2, '0')}`
                          : member.title}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {demo ? <p className="exq-team-signin__demo">Demo PIN: {DEMO_PIN}</p> : null}
          <p className="exq-muted exq-team-signin__help">
            Not you? Ask the owner for your setup link.
          </p>
        </section>
      )}
    </main>
  );
}
