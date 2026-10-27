import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import AlertTriangle from '@untitled-ui/icons-react/build/esm/AlertTriangle';
import Announcement01 from '@untitled-ui/icons-react/build/esm/Announcement01';
import Plus from '@untitled-ui/icons-react/build/esm/Plus';
import SlashCircle01 from '@untitled-ui/icons-react/build/esm/SlashCircle01';
import UserPlus01 from '@untitled-ui/icons-react/build/esm/UserPlus01';
import UserX01 from '@untitled-ui/icons-react/build/esm/UserX01';
import {
  bookingResponseSchema,
  overviewResponseSchema,
  type AdminBookingView,
  type FloorChair,
} from '@shared/api/admin';
import { progressOf } from '@shared/lib/floor';
import { Button, EmptyState, ErrorState, useToast } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { firstNameLastInitial, money, shopDateLabel, shopTime } from '../format';
import { useQuick } from '../shell/quick';
import { useFloor } from './useFloor';

const SOURCE_WORDS: Record<AdminBookingView['source'], string> = {
  online: 'Booked online',
  phone: 'Booked by phone',
  walkIn: 'Walk-in',
  owner: 'Booked by the shop',
  barber: 'Booked by the barber',
};

const CHAIR_WORDS: Record<FloorChair['kind'], string> = {
  inChair: 'In chair',
  free: 'Free now',
  off: 'Off today',
  instagram: 'Instagram',
};

type FloorAction = 'arrived' | 'start' | 'done' | 'noShow';

/** "Haircut and Beard" or "Haircut + 1 more" for a card. */
function serviceLine(b: AdminBookingView): string {
  const [first, ...rest] = b.services;
  if (!first) return '';
  return rest.length ? `${first.name} + ${String(rest.length)} more` : first.name;
}

function chairLabel(n: number | null): string {
  return n === null ? 'Chair' : `Chair ${String(n).padStart(2, '0')}`;
}

/**
 * Shop, Today: the floor. One card per chair, who is coming up, what is done and today's
 * numbers, all from today's bookings and the server clock; refreshed every 30 seconds and after
 * every action. The alerts strip comes from the overview.
 */
export function TodayPage() {
  usePageTitle('Today');
  const quick = useQuick();
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const floor = useFloor(quick.version + tick);
  const overview = useApi('/api/admin/overview', overviewResponseSchema, {
    version: quick.version,
  });
  const data = floor.data;
  const ov = overview.status === 'ready' ? overview.data : null;
  const [busy, setBusy] = useState<string | null>(null);

  const act = useCallback(
    async (b: AdminBookingView, action: FloorAction) => {
      const name = firstNameLastInitial(b.customer.name);
      setBusy(b.id);
      try {
        if (action === 'arrived' || action === 'start') {
          await apiRequest(`/api/admin/bookings/${b.id}/${action}`, bookingResponseSchema, {
            method: 'POST',
            body: {},
          });
          toast({
            tone: 'ok',
            text:
              action === 'arrived' ? `${name} arrived.` : `Started ${name} with ${b.staff.name}.`,
          });
          await floor.refresh();
        } else {
          const status = action === 'done' ? 'completed' : 'noShow';
          await apiRequest(`/api/admin/bookings/${b.id}/status`, bookingResponseSchema, {
            method: 'POST',
            body: { status, notify: false },
          });
          toast({
            tone: action === 'done' ? 'ok' : 'warn',
            text: action === 'done' ? `${name} is done.` : `${name} marked as a no show.`,
            action: {
              label: 'Undo',
              onClick: () => {
                void apiRequest(`/api/admin/bookings/${b.id}/status`, bookingResponseSchema, {
                  method: 'POST',
                  body: { status: 'confirmed', notify: false },
                }).then(() => {
                  quick.changed();
                });
              },
            },
          });
          quick.changed();
        }
      } catch (error) {
        toast({
          tone: 'danger',
          text: error instanceof Error ? error.message : 'That did not go through.',
        });
        setTick((t) => t + 1);
      } finally {
        setBusy(null);
      }
    },
    [floor, quick, toast],
  );

  const doneHref = '/admin/shop/bookings?range=today&status=completed';

  return (
    <div className="exq-today" data-state={data ? 'ready' : floor.error ? 'error' : 'loading'}>
      <div className="exq-dash-head">
        <div>
          <p className="exq-dash-head__kicker exq-label">Live now</p>
          <h1>The floor</h1>
          <p className="exq-dash-head__sub">{data ? shopDateLabel(data.date) : ' '}</p>
        </div>
        {data ? (
          <ul className="exq-bare exq-today__pills" aria-label="Right now">
            <li className="exq-today__pill" data-tone="accent">
              {data.counts.inChairs} in {data.counts.inChairs === 1 ? 'chair' : 'chairs'}
            </li>
            <li className="exq-today__pill">{data.counts.waiting} waiting</li>
            <li className="exq-today__pill">{data.counts.done} done</li>
          </ul>
        ) : null}
      </div>

      {ov && ov.alerts.length > 0 ? (
        <div className="exq-alerts" role="region" aria-label="Needs a decision">
          {ov.alerts.map((alert) => (
            <button
              key={alert.id}
              type="button"
              className="exq-alert"
              data-kind={alert.kind}
              onClick={() => {
                quick.openAlert(alert.id);
              }}
            >
              <AlertTriangle aria-hidden="true" />
              <span className="exq-alert__text">
                {alert.kind === 'barberOut'
                  ? `${alert.staffName} is out ${alert.fromDate === ov.date ? 'today' : shopDateLabel(alert.fromDate)}.`
                  : `${alert.staffName} asked for ${shopDateLabel(alert.fromDate)}${alert.toDate !== alert.fromDate ? ` to ${shopDateLabel(alert.toDate)}` : ''} off.`}{' '}
                {alert.affectedCount}{' '}
                {alert.affectedCount === 1 ? 'booking needs' : 'bookings need'} a decision.
              </span>
              <span className="exq-alert__go">Decide</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="exq-quick" role="group" aria-label="Quick actions">
        <Button
          size="sm"
          icon={<Plus aria-hidden="true" />}
          onClick={() => {
            quick.openNewBooking();
          }}
        >
          New booking
        </Button>
        <Button
          size="sm"
          variant="outline"
          icon={<UserPlus01 aria-hidden="true" />}
          onClick={() => {
            quick.openNewBooking({ source: 'walkIn' });
          }}
        >
          Walk-in
        </Button>
        <Button
          size="sm"
          variant="outline"
          icon={<SlashCircle01 aria-hidden="true" />}
          onClick={() => {
            quick.openBlock();
          }}
        >
          Block time
        </Button>
        <Button
          size="sm"
          variant="outline"
          icon={<UserX01 aria-hidden="true" />}
          onClick={() => {
            quick.openBarberOut();
          }}
        >
          Barber out today
        </Button>
        <Button
          size="sm"
          variant="outline"
          icon={<Announcement01 aria-hidden="true" />}
          onClick={() => {
            quick.openAnnouncement();
          }}
        >
          Edit announcement
        </Button>
      </div>

      {floor.error && !data ? (
        <ErrorState title="The floor did not load">
          Check the connection and reload the page.
        </ErrorState>
      ) : (
        <div className="exq-today__grid">
          <div className="exq-today__main">
            <section aria-labelledby="exq-floor-head">
              <h2 id="exq-floor-head" className="exq-today__h2 exq-label">
                Chairs
              </h2>
              {data ? (
                <ul className="exq-bare exq-floor">
                  {data.chairs.map((chair) => (
                    <ChairCard
                      key={chair.staff.id}
                      chair={chair}
                      now={data.now}
                      busy={busy}
                      onAct={act}
                      onOpen={quick.openBooking}
                    />
                  ))}
                </ul>
              ) : (
                <ul className="exq-bare exq-floor" aria-busy="true">
                  {Array.from({ length: 4 }, (_, i) => (
                    <li key={i} className="exq-floorcard" data-kind="loading">
                      <span className="exq-skeleton">Loading the chair</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="exq-panel" aria-labelledby="exq-coming-head">
              <div className="exq-panel__head">
                <h2 id="exq-coming-head">Coming up</h2>
                {data ? <span className="exq-muted">{data.comingUp.length} today</span> : null}
              </div>
              {!data ? (
                <p className="exq-skeleton exq-activity__placeholder" aria-busy="true">
                  Loading the day
                </p>
              ) : data.comingUp.length === 0 ? (
                <EmptyState title="No one else today">
                  New bookings and walk-ins show here as they come in.
                </EmptyState>
              ) : (
                <ul className="exq-bare exq-coming">
                  {data.comingUp.map((b) => (
                    <li
                      key={b.id}
                      className="exq-coming__row"
                      data-state={b.arrivedAt ? 'arrived' : 'booked'}
                    >
                      <span className="exq-coming__time exq-num">{shopTime(b.startAt)}</span>
                      <button
                        type="button"
                        className="exq-coming__who"
                        onClick={() => {
                          quick.openBooking(b.id);
                        }}
                        aria-label={`Open booking for ${b.customer.name}`}
                      >
                        <span className="exq-coming__name">{b.customer.name}</span>
                        <span className="exq-coming__sub">
                          {serviceLine(b)} with {b.staff.name}
                        </span>
                        <span className="exq-coming__source exq-label">
                          {b.arrivedAt
                            ? `Arrived ${shopTime(b.arrivedAt)}`
                            : SOURCE_WORDS[b.source]}
                        </span>
                      </button>
                      <span className="exq-coming__actions">
                        {b.arrivedAt ? null : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === b.id}
                            onClick={() => void act(b, 'arrived')}
                          >
                            Arrived
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={b.arrivedAt ? 'primary' : 'outline'}
                          disabled={busy === b.id}
                          onClick={() => void act(b, 'start')}
                        >
                          Start
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            quick.openBooking(b.id);
                          }}
                        >
                          Move
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === b.id}
                          onClick={() => void act(b, 'noShow')}
                        >
                          No show
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="exq-today__aside">
            <section className="exq-panel" aria-labelledby="exq-sofar-head">
              <div className="exq-panel__head">
                <h2 id="exq-sofar-head">Today so far</h2>
              </div>
              <dl className="exq-sofar">
                {(
                  [
                    ['Booked', data ? String(data.counts.booked) : null],
                    ['Done', data ? String(data.counts.done) : null],
                    ['Walk-ins', data ? String(data.counts.walkIns) : null],
                    ['Takings', data ? money(data.counts.takingsCents) : null],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="exq-sofar__tile">
                    <dt className="exq-label">{label}</dt>
                    <dd className="exq-num">
                      {value ?? (
                        <span className="exq-skeleton" aria-busy="true">
                          00
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="exq-panel" aria-labelledby="exq-done-head">
              <div className="exq-panel__head">
                <h2 id="exq-done-head">Done today</h2>
                {data && data.counts.done > 0 ? (
                  <Link to={doneHref} className="exq-label exq-today__all">
                    All {data.counts.done}
                  </Link>
                ) : null}
              </div>
              {!data ? (
                <p className="exq-skeleton exq-activity__placeholder" aria-busy="true">
                  Loading
                </p>
              ) : data.done.length === 0 ? (
                <p className="exq-muted">Nothing finished yet.</p>
              ) : (
                <ul className="exq-bare exq-donelist">
                  {data.done.map((b) => (
                    <li key={b.id} className="exq-donelist__row">
                      <button
                        type="button"
                        className="exq-donelist__btn"
                        onClick={() => {
                          quick.openBooking(b.id);
                        }}
                      >
                        <span className="exq-donelist__who">
                          {b.customer.name}
                          <span className="exq-donelist__sub">
                            {serviceLine(b)} with {b.staff.name}
                          </span>
                        </span>
                        <span className="exq-num exq-donelist__price">
                          {money(b.totalPriceCents)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function ChairCard({
  chair,
  now,
  busy,
  onAct,
  onOpen,
}: {
  chair: FloorChair;
  now: string;
  busy: string | null;
  onAct: (b: AdminBookingView, action: FloorAction) => Promise<void>;
  onOpen: (id: string) => void;
}) {
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!more) return;
    const onDown = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMore(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMore(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [more]);

  const b = chair.current;
  const window = chair.window;
  const progress =
    window && now
      ? progressOf(
          { startAt: new Date(window.startAt), endAt: new Date(window.endAt) },
          new Date(now),
        )
      : 0;
  const nextLine = chair.next ? (
    <p className="exq-floorcard__next">
      <b>Next</b> {shopTime(chair.next.startAt)} {firstNameLastInitial(chair.next.customer.name)}
    </p>
  ) : null;

  return (
    <li className="exq-floorcard" data-kind={chair.kind}>
      <p className="exq-floorcard__chair exq-label">{chairLabel(chair.staff.chairNumber)}</p>
      <div className="exq-floorcard__head">
        <h3 className="exq-floorcard__name">{chair.staff.name}</h3>
        <span className="exq-floorcard__state exq-label">{CHAIR_WORDS[chair.kind]}</span>
      </div>
      {chair.kind === 'inChair' && b && window ? (
        <>
          <button
            type="button"
            className="exq-floorcard__client"
            onClick={() => {
              onOpen(b.id);
            }}
            aria-label={`Open booking for ${b.customer.name}`}
          >
            <span className="exq-floorcard__who">{b.customer.name}</span>
            <span className="exq-floorcard__service">
              {serviceLine(b)} <span aria-hidden="true">·</span>{' '}
              <span className="exq-num">{money(b.totalPriceCents)}</span>
            </span>
          </button>
          <div
            className="exq-floorcard__bar"
            role="progressbar"
            aria-label={`${b.customer.name}'s cut`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <span className="exq-floorcard__fill" style={{ width: `${String(progress * 100)}%` }} />
          </div>
          <p className="exq-floorcard__times exq-label">
            Started {shopTime(window.startAt)} <span aria-hidden="true">·</span> done about{' '}
            {shopTime(window.endAt)}
          </p>
          {nextLine}
          <div className="exq-floorcard__actions">
            <Button size="sm" disabled={busy === b.id} onClick={() => void onAct(b, 'done')}>
              Done
            </Button>
            <div
              ref={moreRef}
              className="exq-floorcard__more"
              data-state={more ? 'open' : 'closed'}
            >
              <Button
                size="sm"
                variant="outline"
                aria-haspopup="true"
                aria-expanded={more}
                onClick={() => {
                  setMore((m) => !m);
                }}
              >
                More
              </Button>
              {more ? (
                <div className="exq-floorcard__menu">
                  <button
                    type="button"
                    className="exq-floorcard__item"
                    onClick={() => {
                      setMore(false);
                      void onAct(b, 'noShow');
                    }}
                  >
                    No show
                  </button>
                  <button
                    type="button"
                    className="exq-floorcard__item"
                    onClick={() => {
                      setMore(false);
                      onOpen(b.id);
                    }}
                  >
                    Move
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : chair.kind === 'free' ? (
        <>
          <p className="exq-floorcard__who">Open chair</p>
          <p className="exq-floorcard__service">
            {chair.next
              ? `Free until ${shopTime(chair.next.startAt)}`
              : 'Free for the rest of the day'}
          </p>
          {nextLine}
        </>
      ) : chair.kind === 'instagram' ? (
        <>
          <p className="exq-floorcard__who">{chair.specialty || chair.staff.name}</p>
          <p className="exq-floorcard__service">Books through Instagram</p>
        </>
      ) : (
        <>
          <p className="exq-floorcard__who">Off today</p>
          {chair.specialty ? <p className="exq-floorcard__service">{chair.specialty}</p> : null}
        </>
      )}
    </li>
  );
}
