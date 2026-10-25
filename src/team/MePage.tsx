import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { okResponseSchema } from '@shared/api/auth';
import { Button, Input, Sheet, ThemeSwitch, useToast } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { Avatar } from '@/admin/components/Avatar';
import { shopTime } from '@/admin/format';
import { TeamError } from './TeamError';
import { useTeamAction, useTeamMe, useTeamSession } from './useTeamSession';

/** Who is signed in, the PIN, the theme, and sign out. */
export function MePage() {
  usePageTitle('Me');
  const me = useTeamMe();
  const { signedOut } = useTeamSession();
  const act = useTeamAction();
  const toast = useToast();
  const [changing, setChanging] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function signOut() {
    setLeaving(true);
    try {
      await act('/api/team/logout', okResponseSchema, { body: {} });
    } finally {
      signedOut();
    }
  }

  return (
    <div className="exq-team-page">
      <header className="exq-team-head">
        <h1>Me</h1>
      </header>
      <section className="exq-team-me" aria-label="Your profile">
        <Avatar name={me.staff.name} photo={me.staff.photo} />
        <div>
          <p className="exq-team-me__name">{me.staff.name}</p>
          <p className="exq-muted">{me.staff.title}</p>
          <p className="exq-muted">Signed in until {shopTime(me.expiresAt)}</p>
        </div>
      </section>
      <p className="exq-muted">To change your photo or your details, ask the owner.</p>
      <div className="exq-team-asks">
        <Button
          size="lg"
          variant="outline"
          block
          onClick={() => {
            setChanging(true);
          }}
        >
          Change PIN
        </Button>
        <Button size="lg" variant="outline" block loading={leaving} onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
      <section aria-labelledby="exq-team-theme-title">
        <h2 id="exq-team-theme-title" className="exq-team-sub">
          Appearance
        </h2>
        <ThemeSwitch />
      </section>
      <Sheet
        open={changing}
        title="Change PIN"
        onClose={() => {
          setChanging(false);
        }}
      >
        <ChangePinForm
          onDone={() => {
            setChanging(false);
            toast({ text: 'PIN changed. Your other phones were signed out.', tone: 'ok' });
          }}
        />
      </Sheet>
    </div>
  );
}

function ChangePinForm({ onDone }: { onDone: () => void }) {
  const act = useTeamAction();
  const [currentPin, setCurrent] = useState('');
  const [newPin, setNew] = useState('');
  const [confirmPin, setConfirm] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await act('/api/team/pin', okResponseSchema, { body: { currentPin, newPin, confirmPin } });
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.details?.[0]
          ? err.details[0].message
          : err instanceof ApiRequestError && err.status === 401
            ? 'Your current PIN is not right.'
            : err instanceof ApiRequestError
              ? err.message
              : 'That did not save. Try again.',
      );
    } finally {
      setWorking(false);
    }
  }
  const field = (label: string, value: string, set: (v: string) => void, auto: string) => (
    <Input
      label={label}
      type="password"
      inputMode="numeric"
      autoComplete={auto}
      required
      minLength={6}
      maxLength={6}
      pattern="[0-9]{6}"
      value={value}
      onChange={(e) => {
        set(digits(e.target.value));
      }}
    />
  );
  return (
    <form className="exq-team-form" onSubmit={(e) => void submit(e)}>
      {field('Current PIN', currentPin, setCurrent, 'current-password')}
      {field('New PIN', newPin, setNew, 'new-password')}
      {field('New PIN again', confirmPin, setConfirm, 'new-password')}
      <TeamError message={error} />
      <Button type="submit" size="lg" loading={working}>
        Save new PIN
      </Button>
    </form>
  );
}
