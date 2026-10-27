import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { DateTime } from 'luxon';
import {
  checkInArrivedResponseSchema,
  checkInLookupResponseSchema,
  type CheckInMatch,
} from '@shared/api/checkIn';
import { SHOP_TIMEZONE } from '@shared/lib/constants';
import { shopTime } from '@/admin/format';
import { chairEstimateLabel } from '@/admin/today/estimateLabel';
import { NewBookingFlow, type FlowResult } from '@/booking-flow/NewBookingFlow';
import { useChairEstimates, type FlowSession } from '@/booking-flow/flowData';
import { Button, Input } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import '@/styles/checkin.css';

/** How long an end screen stays before the tablet goes back to the start. */
const BACK_AFTER_MS = 6000;
const SAVE_FAILED = "Didn't go through. Try again or tell the front desk.";

type Screen =
  | { kind: 'start' }
  | { kind: 'walkIn' }
  | { kind: 'find' }
  | { kind: 'done'; title: string; sub: string | null };

/**
 * The front desk check-in tablet: a full screen with no shell, giant targets, nothing hover-only,
 * and every customer detail masked. Walk in opens the booking flow in check-in mode (always NOW);
 * I have an appointment finds today's bookings by name or the last 4 of a phone.
 */
export function CheckInPage({
  session,
  ownChair,
  exitTo,
}: {
  session: FlowSession;
  ownChair?: { id: string; name: string } | undefined;
  exitTo: string;
}) {
  usePageTitle('Front desk check in');
  const [screen, setScreen] = useState<Screen>({ kind: 'start' });
  const [tick, setTick] = useState(0);
  const estimates = useChairEstimates(session, screen.kind === 'start', tick);
  const clock = useClock();
  useWakeLock();

  // The start screen refreshes the chairs every 30 seconds; an end screen goes back on its own.
  useEffect(() => {
    if (screen.kind === 'start') {
      const id = window.setInterval(() => {
        setTick((t) => t + 1);
      }, 30_000);
      return () => {
        window.clearInterval(id);
      };
    }
    if (screen.kind === 'done') {
      const id = window.setTimeout(() => {
        setScreen({ kind: 'start' });
      }, BACK_AFTER_MS);
      return () => {
        window.clearTimeout(id);
      };
    }
    return undefined;
  }, [screen]);

  const finish = (result: FlowResult) => {
    setScreen({
      kind: 'done',
      title: result.text,
      sub: result.kind === 'line' ? 'Have a seat. We will call your name.' : null,
    });
  };

  return (
    <div className="exq-checkin" data-state={screen.kind}>
      <header className="exq-checkin__head">
        <p className="exq-checkin__brand">Front desk check in</p>
        <p className="exq-checkin__clock exq-label">{clock}</p>
        <Link to={exitTo} className="exq-checkin__exit">
          Exit
        </Link>
      </header>

      {screen.kind === 'start' || screen.kind === 'walkIn' ? (
        <main className="exq-checkin__main">
          <h1 className="exq-checkin__title">Who's coming in?</h1>
          <div className="exq-checkin__choices">
            <button
              type="button"
              className="exq-checkin__choice"
              data-variant="accent"
              onClick={() => {
                setScreen({ kind: 'walkIn' });
              }}
            >
              <span className="exq-checkin__choice-title">Walk in</span>
              <span className="exq-checkin__choice-sub">
                Pick a service and barber, or the first chair free
              </span>
            </button>
            <button
              type="button"
              className="exq-checkin__choice"
              onClick={() => {
                setScreen({ kind: 'find' });
              }}
            >
              <span className="exq-checkin__choice-title">I have an appointment</span>
              <span className="exq-checkin__choice-sub">
                Find it by name or the last 4 of your phone
              </span>
            </button>
          </div>
          <section className="exq-checkin__chairs" aria-labelledby="exq-checkin-chairs">
            <h2 id="exq-checkin-chairs" className="exq-label">
              Chairs right now
            </h2>
            <ul className="exq-bare exq-checkin__chair-list">
              {estimates.chairs.map((c) => (
                <li key={c.staffId} className="exq-checkin__chair" data-state={c.estimate.kind}>
                  <span className="exq-checkin__chair-name">{c.name}</span>
                  <span className="exq-checkin__chair-state">{chairEstimateLabel(c.estimate)}</span>
                </li>
              ))}
            </ul>
          </section>
        </main>
      ) : null}

      {screen.kind === 'find' ? (
        <FindAppointment
          session={session}
          onBack={() => {
            setScreen({ kind: 'start' });
          }}
          onArrived={(m) => {
            setScreen({
              kind: 'done',
              title: `Thanks, ${m.name.split(' ')[0] ?? m.name}. You're checked in.`,
              sub: `${m.staffName} will be right with you${
                m.chairNumber !== null ? ` at chair ${String(m.chairNumber)}` : ''
              }.`,
            });
          }}
        />
      ) : null}

      {screen.kind === 'done' ? (
        <main className="exq-checkin__main exq-checkin__done" role="status">
          <h1 className="exq-checkin__title">{screen.title}</h1>
          {screen.sub ? <p className="exq-checkin__sub">{screen.sub}</p> : null}
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              setScreen({ kind: 'start' });
            }}
          >
            Done
          </Button>
        </main>
      ) : null}

      <NewBookingFlow
        open={screen.kind === 'walkIn'}
        session={session}
        ownChair={ownChair}
        checkIn
        intent={{ kind: 'new', now: true }}
        onClose={() => {
          // The dialog's own close (after a finished walk-in) must not replace the end screen.
          setScreen((s) => (s.kind === 'walkIn' ? { kind: 'start' } : s));
        }}
        onDone={finish}
      />
    </div>
  );
}

function FindAppointment({
  session,
  onBack,
  onArrived,
}: {
  session: FlowSession;
  onBack: () => void;
  onArrived: (m: CheckInMatch) => void;
}) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<CheckInMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const base = session === 'owner' ? '/api/admin/checkin' : '/api/team/checkin';
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setMatches(null);
      return undefined;
    }
    const mine = (latest.current += 1);
    const id = window.setTimeout(() => {
      apiRequest(`${base}/lookup?q=${encodeURIComponent(q)}`, checkInLookupResponseSchema, {
        fresh: true,
      })
        .then((r) => {
          if (latest.current === mine) setMatches(r.matches);
        })
        .catch(() => {
          if (latest.current === mine) setError(SAVE_FAILED);
        });
    }, 250);
    return () => {
      window.clearTimeout(id);
    };
  }, [query, base]);

  async function arrive(m: CheckInMatch) {
    setWorking(m.id);
    setError(null);
    try {
      const done = await apiRequest(`${base}/${m.id}/arrived`, checkInArrivedResponseSchema, {
        method: 'POST',
        body: {},
      });
      onArrived(done.match);
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setWorking(null);
    }
  }

  return (
    <main className="exq-checkin__main">
      <h1 className="exq-checkin__title">Find your appointment</h1>
      <div className="exq-checkin__search">
        <Input
          label="Your name or the last 4 of your phone"
          value={query}
          autoFocus
          autoComplete="off"
          inputMode="text"
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
      </div>
      {error ? (
        <p className="exq-checkin__error" role="alert">
          {error}
        </p>
      ) : null}
      {matches !== null ? (
        matches.length === 0 ? (
          <p className="exq-checkin__sub" role="status">
            Nothing for today under that. Try the last 4 of your phone, or walk in.
          </p>
        ) : (
          <ul className="exq-bare exq-checkin__matches">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="exq-checkin__match"
                  data-state={m.arrived ? 'arrived' : 'open'}
                  disabled={working !== null}
                  onClick={() => void arrive(m)}
                >
                  <span className="exq-checkin__match-time exq-num">{shopTime(m.startAt)}</span>
                  <span className="exq-checkin__match-name">{m.name}</span>
                  <span className="exq-checkin__match-sub">
                    with {m.staffName}
                    {m.arrived ? ', already checked in' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
      <div className="exq-checkin__back">
        <Button size="lg" variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>
    </main>
  );
}

function useClock(): string {
  const [text, setText] = useState(() => clockText());
  useEffect(() => {
    const id = window.setInterval(() => {
      setText(clockText());
    }, 15_000);
    return () => {
      window.clearInterval(id);
    };
  }, []);
  return text;
}

function clockText(): string {
  return DateTime.now().setZone(SHOP_TIMEZONE).toFormat("ccc, LLL d 'at' h:mm a");
}

/** Keeps the tablet awake where the browser allows it; silently does nothing elsewhere. */
function useWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return undefined;
    const wakeLock = navigator.wakeLock;
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const take = () => {
      if (document.visibilityState !== 'visible') return;
      wakeLock
        .request('screen')
        .then((l) => {
          if (gone) void l.release();
          else lock = l;
        })
        .catch(() => undefined);
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', take);
      void lock?.release();
    };
  }, []);
}
