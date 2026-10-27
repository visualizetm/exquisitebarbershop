import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import CalendarCheck01 from '@untitled-ui/icons-react/build/esm/CalendarCheck01';
import UserPlus01 from '@untitled-ui/icons-react/build/esm/UserPlus01';
import { DateTime } from 'luxon';
import {
  checkInArrivedResponseSchema,
  checkInLookupResponseSchema,
  type CheckInMatch,
} from '@shared/api/checkIn';
import { kioskBoardResponseSchema, type KioskBoardResponse } from '@shared/api/kiosk';
import { publicShopSchema } from '@shared/api/public';
import { z } from 'zod';
import { SHOP_TIMEZONE } from '@shared/lib/constants';
import { shopTime } from '@/admin/format';
import { chairStateLabel } from '@/admin/today/estimateLabel';
import { NewBookingFlow, type FlowResult } from '@/booking-flow/NewBookingFlow';
import { useChairEstimates, type FlowSession } from '@/booking-flow/flowData';
import { Button, Input } from '@/components/ui';
import { Mark } from '@/components/ui/Mark';
import { initialsOf } from '@/lib/initials';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { CodePad } from './CodePad';
import { usePageTitle } from '@/lib/usePageTitle';
import '@/styles/checkin.css';

/** How long an end screen counts down before the tablet goes back to the start (D13g-01). */
export const END_SCREEN_SECONDS = 15;
/** The locked tablet: back to the start after this long without a tap, hold the logo this long to exit. */
const IDLE_MS = 45_000;
const HOLD_MS = 3000;
const okSchema = z.object({ ok: z.literal(true) });
const pairedSchema = z.object({ device: z.object({ name: z.string() }) });
const SAVE_FAILED = "Didn't go through. Try again or tell the front desk.";

type Screen =
  | { kind: 'start' }
  | { kind: 'walkIn' }
  | { kind: 'find' }
  | { kind: 'exit' }
  | { kind: 'exitMenu'; exitPin: string }
  | { kind: 'done'; title: string; sub: string | null };

/** The check in API for each session; the kiosk's paths carry no client details. */
const CHECKIN_API: Record<
  FlowSession,
  { lookup: (q: string) => string; arrived: (id: string) => string }
> = {
  owner: {
    lookup: (q) => `/api/admin/checkin/lookup?q=${encodeURIComponent(q)}`,
    arrived: (id) => `/api/admin/checkin/${id}/arrived`,
  },
  team: {
    lookup: (q) => `/api/team/checkin/lookup?q=${encodeURIComponent(q)}`,
    arrived: (id) => `/api/team/checkin/${id}/arrived`,
  },
  kiosk: {
    lookup: (q) => `/api/kiosk/lookup?q=${encodeURIComponent(q)}`,
    arrived: (id) => `/api/kiosk/bookings/${id}/arrived`,
  },
};

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
  /** Where Exit goes; null on the locked tablet, which has no Exit at all. */
  exitTo: string | null;
}) {
  const kiosk = session === 'kiosk';
  usePageTitle(kiosk ? 'Front desk tablet' : 'Front desk check in');
  const [screen, setScreen] = useState<Screen>({ kind: 'start' });
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => {
    setTick((t) => t + 1);
  }, []);
  // The tablet: paired or not is known from the board's answer (401 means not paired).
  const [paired, setPaired] = useState<boolean | null>(kiosk ? null : true);
  const board = useKioskBoard(kiosk && paired !== false && screen.kind === 'start', tick, () => {
    setPaired(false);
  });
  const strip = useChairEstimates(session, !kiosk && screen.kind === 'start', tick);
  const estimates = kiosk ? board : strip;
  const clock = useClock();
  useWakeLock();
  // The hours rule: Walk in is only offered while the shop is open and somebody is in.
  const walkInOpen = estimates.firstAvailable === null || estimates.firstAvailable.kind === 'open';
  useIdleReset(kiosk && screen.kind !== 'start', () => {
    setScreen({ kind: 'start' });
    bump();
  });

  // The start screen refreshes the chairs (every 20 seconds on the tablet, 30 on the owner's
  // screen); an end screen goes back on its own.
  useEffect(() => {
    if (screen.kind === 'start') {
      const id = window.setInterval(
        () => {
          setTick((t) => t + 1);
        },
        kiosk ? 20_000 : 30_000,
      );
      return () => {
        window.clearInterval(id);
      };
    }
    return undefined;
  }, [screen, kiosk]);

  const finish = (result: FlowResult) => {
    setScreen({
      kind: 'done',
      title: result.text,
      sub: result.kind === 'line' ? 'Have a seat. We will call your name.' : null,
    });
  };

  if (kiosk && paired === false) {
    return (
      <PairingScreen
        onPaired={() => {
          setPaired(true);
          setScreen({ kind: 'start' });
          bump();
        }}
      />
    );
  }

  return (
    <div
      className="exq-checkin"
      data-state={screen.kind}
      data-mode={kiosk ? 'kiosk' : 'staff'}
      onContextMenu={
        kiosk
          ? (e) => {
              e.preventDefault();
            }
          : undefined
      }
    >
      <header className="exq-checkin__head">
        {kiosk ? (
          <HoldLogo
            onHeld={() => {
              setScreen({ kind: 'exit' });
            }}
          />
        ) : (
          <p className="exq-checkin__brand">Front desk check in</p>
        )}
        <p className="exq-checkin__clock exq-label">{clock}</p>
        {session === 'owner' ? (
          <p className="exq-checkin__hint">
            For the front desk, set up a locked tablet in{' '}
            <Link to="/admin/settings?tab=tablets">Settings, Check in tablets</Link>.
          </p>
        ) : null}
        {exitTo ? (
          <Link to={exitTo} className="exq-checkin__exit">
            Exit
          </Link>
        ) : null}
      </header>

      {screen.kind === 'start' || screen.kind === 'walkIn' ? (
        <main className="exq-checkin__main">
          <h1 className="exq-checkin__title">Who's coming in?</h1>
          <div className="exq-checkin__choices">
            <button
              type="button"
              className="exq-checkin__choice"
              data-variant="accent"
              data-state={walkInOpen ? 'open' : 'closed'}
              disabled={!walkInOpen}
              onClick={() => {
                setScreen({ kind: 'walkIn' });
              }}
            >
              <span className="exq-checkin__choice-icon" aria-hidden="true">
                <UserPlus01 />
              </span>
              <span className="exq-checkin__choice-title">Walk in</span>
              <span className="exq-checkin__choice-sub">
                {walkInOpen
                  ? 'Pick a service and barber, or the first chair free'
                  : (estimates.firstAvailable?.text ?? 'Not right now')}
              </span>
            </button>
            <button
              type="button"
              className="exq-checkin__choice"
              onClick={() => {
                setScreen({ kind: 'find' });
              }}
            >
              <span className="exq-checkin__choice-icon" aria-hidden="true">
                <CalendarCheck01 />
              </span>
              <span className="exq-checkin__choice-title">I have an appointment</span>
              <span className="exq-checkin__choice-sub">
                Find it by name or the last 4 of your phone
              </span>
            </button>
          </div>
          {kiosk ? (
            <Board board={board.data} />
          ) : (
            <section className="exq-checkin__chairs" aria-labelledby="exq-checkin-chairs">
              <h2 id="exq-checkin-chairs" className="exq-label">
                Chairs right now
              </h2>
              <ul className="exq-bare exq-checkin__chair-list">
                {estimates.chairs.map((c) => (
                  <li
                    key={c.staffId}
                    className="exq-checkin__chair"
                    data-state={c.gate.kind === 'open' ? c.estimate.kind : 'closed'}
                  >
                    <span className="exq-checkin__chair-name">{c.name}</span>
                    <span className="exq-checkin__chair-state">
                      {chairStateLabel(c.gate, c.estimate)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
      ) : null}

      {screen.kind === 'exit' ? (
        <main className="exq-checkin__main exq-checkin__pairing">
          <h1 className="exq-checkin__title">Exit PIN</h1>
          <ExitPad
            onVerified={(exitPin) => {
              setScreen({ kind: 'exitMenu', exitPin });
            }}
            onBack={() => {
              setScreen({ kind: 'start' });
            }}
          />
        </main>
      ) : null}

      {screen.kind === 'exitMenu' ? (
        <ExitMenu
          exitPin={screen.exitPin}
          onClose={() => {
            setScreen({ kind: 'start' });
            bump();
          }}
          onUnpaired={() => {
            setPaired(false);
          }}
        />
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
            bump();
          }}
        />
      ) : null}

      {screen.kind === 'done' ? (
        <EndScreen
          title={screen.title}
          sub={screen.sub}
          onClose={() => {
            setScreen({ kind: 'start' });
            bump();
          }}
        />
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
  const api = CHECKIN_API[session];
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setMatches(null);
      return undefined;
    }
    const mine = (latest.current += 1);
    const id = window.setTimeout(() => {
      apiRequest(api.lookup(q), checkInLookupResponseSchema, { fresh: true })
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
  }, [query, api]);

  async function arrive(m: CheckInMatch) {
    setWorking(m.id);
    setError(null);
    try {
      const done = await apiRequest(api.arrived(m.id), checkInArrivedResponseSchema, {
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

// ---------------------------------------------------------------------------
// The locked tablet (prompt 13f)
// ---------------------------------------------------------------------------

/** The board for the tablet, shaped like the chair estimates the start screen reads; 401 means not paired. */
function useKioskBoard(
  on: boolean,
  tick: number,
  onUnpaired: () => void,
): {
  data: KioskBoardResponse | null;
  chairs: KioskBoardResponse['chairs'];
  firstAvailable: KioskBoardResponse['firstAvailable'] | null;
} {
  const [data, setData] = useState<KioskBoardResponse | null>(null);
  useEffect(() => {
    if (!on) return;
    let gone = false;
    apiRequest('/api/kiosk/board', kioskBoardResponseSchema, { fresh: true })
      .then((d) => {
        if (!gone) setData(d);
      })
      .catch((err: unknown) => {
        if (!gone && err instanceof ApiRequestError && err.status === 401) onUnpaired();
      });
    return () => {
      gone = true;
    };
    // onUnpaired is a fresh closure each render; the board is keyed by `on` and `tick` only.
  }, [on, tick]);
  return { data, chairs: data?.chairs ?? [], firstAvailable: data?.firstAvailable ?? null };
}

/** After 45 seconds without a tap in any flow, back to the start with the form cleared. */
function useIdleReset(armed: boolean, reset: () => void): void {
  const latest = useRef(reset);
  latest.current = reset;
  useEffect(() => {
    if (!armed) return;
    let id = window.setTimeout(() => {
      latest.current();
    }, IDLE_MS);
    const touch = () => {
      window.clearTimeout(id);
      id = window.setTimeout(() => {
        latest.current();
      }, IDLE_MS);
    };
    const events = ['pointerdown', 'keydown', 'touchstart'] as const;
    for (const e of events) document.addEventListener(e, touch, { passive: true });
    return () => {
      window.clearTimeout(id);
      for (const e of events) document.removeEventListener(e, touch);
    };
  }, [armed]);
}

/** Not paired yet: the logo, the pad, one line. In the showcase, one tap pairs a demo tablet. */
function PairingScreen({ onPaired }: { onPaired: () => void }) {
  const shop = useApi('/api/shop', publicShopSchema);
  const demo = shop.status === 'ready' && shop.data.demo === true;
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  async function pair(path: string, body: Record<string, string>) {
    setWorking(true);
    setError(null);
    try {
      await apiRequest(path, pairedSchema, { method: 'POST', body });
      onPaired();
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.code === 'RATE_LIMITED'
          ? 'Too many tries. Wait 15 minutes and ask for a new code.'
          : 'That code did not work. Ask the owner for a new one.',
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="exq-checkin exq-checkin--pairing" data-state="pairing" data-mode="kiosk">
      <main className="exq-checkin__main exq-checkin__pairing">
        <Mark name="disc" width={56} height={56} className="exq-checkin__logo" />
        <h1 className="exq-checkin__title">Front desk tablet</h1>
        <p className="exq-checkin__sub">Ask the owner for a code.</p>
        <CodePad
          label="Pairing code"
          disabled={working}
          error={error}
          onComplete={(code) => void pair('/api/kiosk/pair', { code })}
        />
        {demo ? (
          <Button
            size="lg"
            variant="outline"
            loading={working}
            onClick={() => void pair('/api/kiosk/pair-demo', {})}
          >
            Use the demo tablet
          </Button>
        ) : null}
      </main>
    </div>
  );
}

/** The logo; press and hold for three seconds to reach the exit PIN. Nothing else on the page leaves it. */
function HoldLogo({ onHeld }: { onHeld: () => void }) {
  const timer = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);
  const start = () => {
    setHolding(true);
    timer.current = window.setTimeout(() => {
      setHolding(false);
      onHeld();
    }, HOLD_MS);
  };
  const stop = () => {
    setHolding(false);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <button
      type="button"
      className="exq-checkin__brand exq-checkin__hold"
      data-state={holding ? 'holding' : 'idle'}
      aria-label="Exquisite. Press and hold for three seconds to exit."
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && timer.current === null) start();
      }}
      onKeyUp={stop}
    >
      <Mark name="disc" width={32} height={32} />
      <span>Front desk</span>
    </button>
  );
}

function ExitPad({
  onVerified,
  onBack,
}: {
  onVerified: (pin: string) => void;
  onBack: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  async function check(exitPin: string) {
    setWorking(true);
    setError(null);
    try {
      await apiRequest('/api/kiosk/exit', okSchema, { method: 'POST', body: { exitPin } });
      onVerified(exitPin);
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.code === 'ACCOUNT_LOCKED'
          ? 'Too many wrong tries. Wait 15 minutes.'
          : 'That PIN is not right.',
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <>
      <CodePad
        label="Exit PIN"
        disabled={working}
        error={error}
        onComplete={(pin) => void check(pin)}
      />
      <div className="exq-checkin__back">
        <Button size="lg" variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>
    </>
  );
}

/** After the exit PIN: reload, unpair this tablet, or close. Nothing else. */
function ExitMenu({
  exitPin,
  onClose,
  onUnpaired,
}: {
  exitPin: string;
  onClose: () => void;
  onUnpaired: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function unpair() {
    setWorking(true);
    try {
      await apiRequest('/api/kiosk/unpair', okSchema, { method: 'POST', body: { exitPin } });
      onUnpaired();
    } catch {
      setError(SAVE_FAILED);
      setWorking(false);
    }
  }
  return (
    <main
      className="exq-checkin__main exq-checkin__pairing"
      role="dialog"
      aria-labelledby="exq-checkin-exit"
    >
      <h1 id="exq-checkin-exit" className="exq-checkin__title">
        Tablet
      </h1>
      {error ? (
        <p className="exq-checkin__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="exq-checkin__exit-actions">
        <Button
          size="lg"
          variant="outline"
          onClick={() => {
            window.location.reload();
          }}
        >
          Reload
        </Button>
        <Button size="lg" variant="outline" loading={working} onClick={() => void unpair()}>
          Unpair this tablet
        </Button>
        <Button size="lg" onClick={onClose}>
          Close
        </Button>
      </div>
    </main>
  );
}

/** Who's in today: one tile per barber working, the off row, and the closed line. */
function Board({ board }: { board: KioskBoardResponse | null }) {
  if (!board) {
    return (
      <section className="exq-board" aria-busy="true" aria-label="Who's in today">
        <h2 className="exq-board__title">Who's in today</h2>
      </section>
    );
  }
  return (
    <section
      className="exq-board"
      aria-labelledby="exq-board-title"
      data-state={board.shop.open ? 'open' : 'closed'}
    >
      <div className="exq-board__head">
        <h2 id="exq-board-title" className="exq-board__title">
          Who's in today
        </h2>
        <p className="exq-board__hours">
          {board.shop.closedText ?? `Open today ${board.shop.hoursToday}`}
        </p>
      </div>
      {board.tiles.length === 0 ? (
        <p className="exq-checkin__sub">Nobody is in today.</p>
      ) : (
        <ul className="exq-bare exq-board__tiles">
          {board.tiles.map((t) => (
            <li key={t.staffId} className="exq-board__tile" data-tone={t.tone}>
              <span className="exq-board__photo" aria-hidden="true">
                {t.photo ? (
                  <img src={t.photo.url} alt="" width={56} height={56} />
                ) : (
                  <span className="exq-board__initials">{initialsOf(t.name)}</span>
                )}
              </span>
              <span className="exq-board__who">
                <strong className="exq-board__name">{t.name}</strong>
                {t.chairNumber !== null ? (
                  <span className="exq-board__chair exq-label">
                    Chair {String(t.chairNumber).padStart(2, '0')}
                  </span>
                ) : null}
              </span>
              <span className="exq-board__status">{t.status}</span>
              {t.waiting > 0 ? (
                <span className="exq-board__waiting">{String(t.waiting)} waiting</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {board.offToday.length > 0 ? (
        <p className="exq-board__off">Off today: {board.offToday.join(', ')}.</p>
      ) : null}
    </section>
  );
}

/**
 * An end screen: the message, "Closing in 15" counting to 1 with a stepped red bar, and a big Done.
 * One interval drives the count; it is cleared on Done, at 0 and on unmount, so no timer outlives
 * the screen. Taps elsewhere neither restart nor extend it. A screen reader hears the message and
 * "Closing in 15 seconds" once; the changing number is hidden from it.
 */
function EndScreen({
  title,
  sub,
  onClose,
}: {
  title: string;
  sub: string | null;
  onClose: () => void;
}) {
  const [left, setLeft] = useState(END_SCREEN_SECONDS);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const id = window.setInterval(() => {
      setLeft((n) => n - 1);
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, []);
  useEffect(() => {
    if (left <= 0) close.current();
  }, [left]);
  return (
    <main className="exq-checkin__main exq-checkin__done">
      <div role="status">
        <h1 className="exq-checkin__title">{title}</h1>
        {sub ? <p className="exq-checkin__sub">{sub}</p> : null}
        <p className="exq-visually-hidden">{`Closing in ${String(END_SCREEN_SECONDS)} seconds`}</p>
      </div>
      <div className="exq-countdown" aria-hidden="true" data-testid="countdown">
        <p className="exq-countdown__line">
          Closing in <span className="exq-countdown__n exq-num">{Math.max(left, 1)}</span>
        </p>
        <div className="exq-countdown__track">
          <div
            className="exq-countdown__bar"
            style={{ width: `${String((Math.max(left, 0) / END_SCREEN_SECONDS) * 100)}%` }}
          />
        </div>
        <p className="exq-countdown__sub">The next client can start right after.</p>
      </div>
      <Button size="lg" variant="outline" className="exq-countdown__done" onClick={onClose}>
        Done
      </Button>
    </main>
  );
}
