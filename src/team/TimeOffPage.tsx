import { useRef, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { conflictOnlyResponseSchema, timeBlockResponseSchema } from '@shared/api/admin';
import {
  teamDaysOffResponseSchema,
  teamOutTodayResponseSchema,
  teamTimeOffResponseSchema,
  type TeamTimeOffResponse,
} from '@shared/api/team';
import { Button, EmptyState, ErrorState, Input, Modal, Sheet, useToast } from '@/components/ui';
import { Status } from '@/components/Status';
import { ApiRequestError } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { addDays, shopDateLabel, shopDateTime, shopTime, todayInShop } from '@/admin/format';
import { TeamError } from './TeamError';
import { useTeamAction, useTeamApi } from './useTeamSession';

/**
 * Time off in three kinds of ask. "I'm out today" never cancels a client: it tells the owner,
 * who decides about each one. Days ahead apply at once when empty, otherwise they become a
 * request. A block is for an hour (lunch) and only works over free time.
 */
export function TimeOffPage() {
  usePageTitle('Time off');
  const act = useTeamAction();
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const off = useTeamApi('/api/team/time-off', teamTimeOffResponseSchema, version);
  const last = useRef<TeamTimeOffResponse | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  const [sheet, setSheet] = useState<'block' | 'ahead' | null>(null);
  const [working, setWorking] = useState(false);

  if (off.status === 'ready') last.current = off.data;
  const data = off.status === 'ready' ? off.data : last.current;
  const reload = () => {
    setVersion((v) => v + 1);
  };

  async function imOut() {
    setWorking(true);
    try {
      const result = await act('/api/team/out-today', teamOutTodayResponseSchema, { body: {} });
      setConfirmOut(false);
      reload();
      toast({
        text:
          result.clients > 0
            ? `The owner will handle your ${String(result.clients)} ${result.clients === 1 ? 'client' : 'clients'}.`
            : 'You are marked out today.',
        tone: 'ok',
        duration: 7000,
      });
    } catch {
      toast({ text: 'That did not save. Try again.', tone: 'danger' });
    } finally {
      setWorking(false);
    }
  }

  async function removeBlock(id: string) {
    try {
      await act(`/api/team/time-blocks/${id}`, conflictOnlyResponseSchema, {
        method: 'DELETE',
        body: {},
      });
      reload();
      toast({ text: 'Removed.', tone: 'ok' });
    } catch {
      toast({ text: 'That did not save. Try again.', tone: 'danger' });
    }
  }

  if (!data) {
    return off.status === 'error' ? (
      <ErrorState title="Time off did not load">Check the connection and try again.</ErrorState>
    ) : (
      <Status state="loading" />
    );
  }
  return (
    <div className="exq-team-page">
      <header className="exq-team-head">
        <div>
          <h1>Time off</h1>
          <p className="exq-muted">Block time, or tell the owner you are out.</p>
        </div>
      </header>

      <div className="exq-team-asks">
        {data.isOutToday ? (
          <p className="exq-team-note" role="status">
            You are marked out today.
          </p>
        ) : (
          <Button
            size="lg"
            variant="accent"
            block
            onClick={() => {
              setConfirmOut(true);
            }}
          >
            I am out today
          </Button>
        )}
        <Button
          size="lg"
          variant="outline"
          block
          onClick={() => {
            setSheet('block');
          }}
        >
          Block time
        </Button>
        <Button
          size="lg"
          variant="outline"
          block
          onClick={() => {
            setSheet('ahead');
          }}
        >
          Days off ahead
        </Button>
      </div>

      <section aria-labelledby="exq-team-wait-title">
        <h2 id="exq-team-wait-title" className="exq-team-sub">
          Waiting for the owner
        </h2>
        {data.requests.length === 0 ? (
          <p className="exq-muted">Nothing waiting.</p>
        ) : (
          <ul className="exq-team-list exq-bare">
            {data.requests.map((r) => (
              <li key={r.id} className="exq-team-row exq-team-row--static">
                <span className="exq-team-row__body">
                  <strong>
                    {r.fromDate === r.toDate
                      ? shopDateLabel(r.fromDate)
                      : `${shopDateLabel(r.fromDate)} to ${shopDateLabel(r.toDate)}`}
                  </strong>
                  <span>{r.reason ?? 'Days off request'}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="exq-team-coming-title">
        <h2 id="exq-team-coming-title" className="exq-team-sub">
          Coming up
        </h2>
        {data.blocks.length === 0 ? (
          <EmptyState title="No time off set">Blocks and days off you set show here.</EmptyState>
        ) : (
          <ul className="exq-team-list exq-bare">
            {data.blocks.map((b) => (
              <li key={b.id} className="exq-team-row exq-team-row--static">
                <span className="exq-team-row__body">
                  <strong>
                    {b.kind === 'block'
                      ? `Blocked ${shopDateTime(b.startAt)} to ${shopTime(b.endAt)}`
                      : b.kind === 'dayOff'
                        ? `Out ${shopDateLabel(b.startAt.slice(0, 10))}`
                        : `Off ${shopDateTime(b.startAt)}`}
                  </strong>
                  <span>{b.reason ?? (b.kind === 'dayOff' ? 'Marked out' : 'Time off')}</span>
                </span>
                {b.kind === 'block' || b.kind === 'timeOff' ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      void removeBlock(b.id);
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={confirmOut}
        title="Out today?"
        onClose={() => {
          setConfirmOut(false);
        }}
      >
        <div className="exq-team-form">
          <p>Your clients stay booked. The owner is told and decides what to do with each one.</p>
          <Button size="lg" variant="accent" loading={working} onClick={() => void imOut()}>
            Yes, I am out today
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              setConfirmOut(false);
            }}
          >
            Keep working
          </Button>
        </div>
      </Modal>

      <Sheet
        open={sheet === 'block'}
        title="Block time"
        onClose={() => {
          setSheet(null);
        }}
      >
        <BlockForm
          onDone={() => {
            setSheet(null);
            reload();
            toast({ text: 'Time blocked.', tone: 'ok' });
          }}
        />
      </Sheet>
      <Sheet
        open={sheet === 'ahead'}
        title="Days off ahead"
        onClose={() => {
          setSheet(null);
        }}
      >
        <AheadForm
          onDone={(message) => {
            setSheet(null);
            reload();
            toast({ text: message, tone: 'ok', duration: 7000 });
          }}
        />
      </Sheet>
    </div>
  );
}

function BlockForm({ onDone }: { onDone: () => void }) {
  const act = useTeamAction();
  const [date, setDate] = useState(todayInShop());
  const [start, setStart] = useState('13:00');
  const [end, setEnd] = useState('14:00');
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await act('/api/team/time-blocks', timeBlockResponseSchema, {
        body: { date, start, end, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      });
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.code === 'SCHEDULE_CONFLICT'
          ? 'You have a client booked then. Call the shop to move them first.'
          : err instanceof ApiRequestError && err.details?.[0]
            ? err.details[0].message
            : 'That did not save. Try again.',
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <form className="exq-team-form" onSubmit={(e) => void submit(e)}>
      <Input
        label="Day"
        type="date"
        required
        min={todayInShop()}
        value={date}
        onChange={(e) => {
          setDate(e.target.value);
        }}
      />
      <div className="exq-team-form__row">
        <Input
          label="From"
          type="time"
          step={900}
          required
          value={start}
          onChange={(e) => {
            setStart(e.target.value);
          }}
        />
        <Input
          label="To"
          type="time"
          step={900}
          required
          value={end}
          onChange={(e) => {
            setEnd(e.target.value);
          }}
        />
      </div>
      <Input
        label="Reason (optional)"
        maxLength={200}
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
        }}
      />
      <TeamError message={error} />
      <Button type="submit" size="lg" loading={working}>
        Block this time
      </Button>
    </form>
  );
}

function AheadForm({ onDone }: { onDone: (message: string) => void }) {
  const act = useTeamAction();
  const [from, setFrom] = useState(addDays(todayInShop(), 1));
  const [to, setTo] = useState(addDays(todayInShop(), 1));
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const result = await act('/api/team/days-off', teamDaysOffResponseSchema, {
        body: { fromDate: from, toDate: to, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      });
      onDone(
        result.applied
          ? 'Your days off are saved.'
          : `Request sent. ${String(result.clients)} ${result.clients === 1 ? 'client is' : 'clients are'} booked, so the owner decides.`,
      );
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.details?.[0]
          ? err.details[0].message
          : 'That did not save. Try again.',
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <form className="exq-team-form" onSubmit={(e) => void submit(e)}>
      <p className="exq-muted">
        Empty days are set right away. If a client is booked, the owner gets a request first.
      </p>
      <div className="exq-team-form__row">
        <Input
          label="First day"
          type="date"
          required
          min={todayInShop()}
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            if (to < e.target.value) setTo(e.target.value);
          }}
        />
        <Input
          label="Last day"
          type="date"
          required
          min={from}
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
          }}
        />
      </div>
      <Input
        label="Reason (optional)"
        maxLength={200}
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
        }}
      />
      <TeamError message={error} />
      <Button type="submit" size="lg" loading={working}>
        Ask for these days
      </Button>
    </form>
  );
}
