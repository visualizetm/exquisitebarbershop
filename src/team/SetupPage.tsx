import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { okResponseSchema } from '@shared/api/auth';
import { teamSetupInfoResponseSchema } from '@shared/api/team';
import { pinProblem } from '@shared/lib/pin';
import { EmptyState, Mark, PinPad } from '@/components/ui';
import { Status } from '@/components/Status';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { useTeamSession } from './useTeamSession';

/**
 * The one-time link the owner sends. The barber chooses a PIN and types it again; the server
 * checks it too, so a hand-made request cannot get past the same rules.
 */
export function SetupPage() {
  usePageTitle('Choose your PIN');
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { refresh } = useTeamSession();
  const info = useApi(`/api/team/setup/${token}`, teamSetupInfoResponseSchema);
  const [first, setFirst] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  async function chosen(pin: string) {
    setError(null);
    if (first === null) {
      const problem = pinProblem(pin);
      if (problem) {
        setError(problem);
        setResetKey((k) => k + 1);
        return;
      }
      setFirst(pin);
      setResetKey((k) => k + 1);
      return;
    }
    if (pin !== first) {
      setError('Those two did not match. Start again.');
      setFirst(null);
      setResetKey((k) => k + 1);
      return;
    }
    setWorking(true);
    try {
      await apiRequest(`/api/team/setup/${token}`, okResponseSchema, {
        method: 'POST',
        body: { pin, confirmPin: pin },
      });
      await refresh();
      void navigate('/team', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.details?.[0]
          ? err.details[0].message
          : err instanceof ApiRequestError && err.status === 404
            ? 'This link has expired or was already used. Ask the owner for a new one.'
            : 'Could not save your PIN. Try again.',
      );
      setFirst(null);
      setResetKey((k) => k + 1);
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="exq-team-signin" data-state="setup">
      <span className="exq-team-signin__mark">
        <Mark name="disc" alt="Exquisite" width={72} height={72} />
      </span>
      <section className="exq-team-signin__panel" aria-labelledby="exq-team-setup-title">
        {info.status === 'loading' ? (
          <Status state="loading" />
        ) : info.status === 'error' ? (
          <EmptyState title="This link does not work">
            It has expired or was already used. Ask the owner for a new one.
          </EmptyState>
        ) : (
          <>
            <h1 id="exq-team-setup-title" className="exq-team-signin__title">
              Welcome, {info.data.staffName}
            </h1>
            <p className="exq-muted">
              {first === null
                ? 'Choose a 6 digit PIN. You will use it to sign in on this phone.'
                : 'Enter it once more to confirm.'}
            </p>
            <PinPad
              label={first === null ? 'Choose your PIN' : 'Confirm your PIN'}
              onComplete={(pin) => void chosen(pin)}
              disabled={working}
              error={error}
              resetKey={resetKey}
            />
          </>
        )}
      </section>
    </main>
  );
}
