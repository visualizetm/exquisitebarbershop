import { useMemo, useState } from 'react';
import type { ConflictAction, ConflictResolution } from '@shared/api/admin';
import { Button, Select } from '@/components/ui';
import { firstNameLastInitial, money, shopDateTime } from '../format';
import type { AffectedBooking } from '../useConflictAction';
import { optionLabel, type MoveOption } from './moveOption';

const LABEL: Record<ConflictAction, string> = {
  move: 'Move',
  keep: 'Keep',
  cancel: 'Cancel',
  cancelAndNotify: 'Cancel and notify',
};
const HELP: Record<ConflictAction, string> = {
  move: "Another chair takes it at the same time, at that chair's price and time.",
  keep: 'It stays where it is, as an exception.',
  cancel: 'Cancel it. The customer is not emailed.',
  cancelAndNotify: 'Cancel it and email the customer.',
};

interface Choice {
  action: ConflictAction;
  toStaffId?: string;
}

/**
 * The one place the owner decides what happens to booked clients when a change would leave them
 * outside working time. Nothing has been applied yet. Every booking needs exactly one choice
 * (Move, Keep, Cancel or Cancel and notify); the count says how many are decided and the change
 * can be applied only when all are. Move offers only the chairs the server says are free for the
 * whole booking and do its services, each with what the booking costs and takes with that chair:
 * a move takes the new chair's price and time, and the client is emailed the change.
 */
export function Resolver({
  affected,
  working,
  keepOnly = false,
  title,
  intro = 'Nothing has changed yet. Choose what happens to each booking, then apply the change.',
  applyLabel = 'Apply the change',
  onSubmit,
  onBack,
}: {
  affected: AffectedBooking[];
  working: boolean;
  /** Barbers may only keep. */
  keepOnly?: boolean;
  title?: string;
  intro?: string;
  applyLabel?: string;
  onSubmit: (resolutions: ConflictResolution[]) => void;
  onBack: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, Choice | undefined>>({});
  const decided = useMemo(
    () => affected.filter((b) => choices[b.bookingId]).length,
    [affected, choices],
  );
  const all = decided === affected.length;

  function choose(b: AffectedBooking, action: ConflictAction) {
    setChoices((prev) => ({
      ...prev,
      [b.bookingId]:
        action === 'move' ? { action, toStaffId: b.moveOptions?.[0]?.staffId ?? '' } : { action },
    }));
  }

  function submit() {
    onSubmit(
      affected.map((b) => {
        const c = choices[b.bookingId] ?? { action: 'keep' as const };
        return c.action === 'move'
          ? { bookingId: b.bookingId, action: 'move', toStaffId: c.toStaffId ?? '' }
          : { bookingId: b.bookingId, action: c.action };
      }),
    );
  }

  return (
    <section
      className="exq-resolver"
      aria-labelledby="exq-resolver-title"
      data-state={all ? 'ready' : 'choosing'}
    >
      <h3 id="exq-resolver-title" className="exq-resolver__title">
        {title ??
          `This change affects ${affected.length} booked ${affected.length === 1 ? 'client' : 'clients'}`}
      </h3>
      <p className="exq-muted">{intro}</p>
      <p className="exq-resolver__count" role="status" aria-live="polite">
        {decided} of {affected.length} decided
      </p>
      <ul className="exq-resolver__list exq-bare">
        {affected.map((b) => {
          const choice = choices[b.bookingId];
          const actions: ConflictAction[] = keepOnly
            ? ['keep']
            : ['move', 'keep', 'cancel', 'cancelAndNotify'];
          return (
            <li
              key={b.bookingId}
              className="exq-resolver__item"
              data-state={choice ? 'decided' : 'open'}
            >
              <fieldset className="exq-resolver__fieldset">
                <legend className="exq-resolver__who">
                  <strong>{shopDateTime(b.startAt)}</strong>, {firstNameLastInitial(b.customerName)}{' '}
                  with {b.staffName}
                  <span className="exq-resolver__meta">
                    {b.services.join(', ')}
                    {b.totalPriceCents !== undefined
                      ? `, ${money(b.totalPriceCents)}, ${String(b.durationMinutes ?? 0)} min`
                      : ''}{' '}
                    ({b.referenceCode})
                  </span>
                </legend>
                <div className="exq-resolver__choices">
                  {actions.map((action) => {
                    const noEmail = action === 'cancelAndNotify' && !b.hasEmail;
                    const noMove = action === 'move' && (b.moveOptions ?? []).length === 0;
                    const disabled = noEmail || noMove;
                    return (
                      <label
                        key={action}
                        className="exq-choice"
                        data-state={
                          choice?.action === action ? 'selected' : disabled ? 'disabled' : 'idle'
                        }
                      >
                        <input
                          type="radio"
                          name={`resolve-${b.bookingId}`}
                          value={action}
                          disabled={disabled}
                          checked={choice?.action === action}
                          onChange={() => {
                            choose(b, action);
                          }}
                        />
                        <span className="exq-choice__label">{LABEL[action]}</span>
                        <span className="exq-choice__help">
                          {noEmail
                            ? 'No email on file.'
                            : noMove
                              ? 'No one is free then.'
                              : HELP[action]}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {choice?.action === 'move' ? (
                  <>
                    <Select
                      label="Move to"
                      value={choice.toStaffId ?? ''}
                      onChange={(e) => {
                        setChoices((prev) => ({
                          ...prev,
                          [b.bookingId]: { action: 'move', toStaffId: e.target.value },
                        }));
                      }}
                    >
                      {(b.moveOptions ?? []).map((o) => (
                        <option key={o.staffId} value={o.staffId}>
                          {optionLabel(b, o)}
                        </option>
                      ))}
                    </Select>
                    <MoveNote
                      booking={b}
                      option={b.moveOptions?.find((o) => o.staffId === choice.toStaffId)}
                    />
                  </>
                ) : null}
              </fieldset>
            </li>
          );
        })}
      </ul>
      <div className="exq-resolver__actions">
        <Button disabled={!all} loading={working} onClick={submit}>
          {applyLabel}
        </Button>
        <Button variant="ghost" onClick={onBack} disabled={working}>
          Go back without changing anything
        </Button>
      </div>
    </section>
  );
}

/** What the move changes, before the owner applies it. */
function MoveNote({
  booking,
  option,
}: {
  booking: AffectedBooking;
  option: MoveOption | undefined;
}) {
  if (!option) return null;
  const was =
    booking.totalPriceCents === undefined
      ? ''
      : ` (now ${money(booking.totalPriceCents)}, ${String(booking.durationMinutes ?? 0)} min)`;
  const changed =
    option.totalPriceCents !== booking.totalPriceCents ||
    option.durationMinutes !== booking.durationMinutes;
  return (
    <p
      className="exq-resolver__move exq-muted"
      data-state={changed ? 'changed' : 'same'}
      aria-live="polite"
    >
      With {option.staffName}: {money(option.totalPriceCents)}, {String(option.durationMinutes)} min
      {was}.{' '}
      {booking.hasEmail
        ? 'The client is emailed the new barber and price.'
        : 'No email on file, so tell the client.'}
    </p>
  );
}
