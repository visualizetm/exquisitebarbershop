import { useState } from 'react';
import type { ConflictAction, ConflictResolution } from '@shared/api/admin';
import { shopDateTime } from '../format';
import type { AffectedBooking } from '../useConflictAction';

const ACTION_LABEL: Record<ConflictAction, string> = {
  keep: 'Keep as an exception',
  cancel: 'Cancel, do not tell the customer',
  cancelAndNotify: 'Cancel and email the customer',
};

/**
 * Shown when a change would leave booked clients outside working time. Nothing
 * was applied yet: the owner picks keep or cancel for every booking, then the
 * same change is sent again with those choices.
 */
export function ConflictResolver({
  affected,
  keepOnly = false,
  working,
  onSubmit,
  onCancel,
}: {
  affected: AffectedBooking[];
  /** Barbers may only keep bookings; cancelling is the owner's call. */
  keepOnly?: boolean;
  working: boolean;
  onSubmit: (resolutions: ConflictResolution[]) => void;
  onCancel: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, ConflictAction | undefined>>({});
  const missing = affected.filter((b) => !choices[b.bookingId]).length;

  return (
    <section
      className="exq-adm-conflict"
      data-state={working ? 'working' : missing > 0 ? 'choosing' : 'ready'}
      aria-labelledby="exq-adm-conflict-title"
    >
      <h2 id="exq-adm-conflict-title" className="exq-adm-conflict__title">
        This change affects {affected.length} booked {affected.length === 1 ? 'client' : 'clients'}
      </h2>
      <p className="exq-adm-conflict__intro">
        Nothing has changed yet. Choose what happens to each booking, then apply the change.
      </p>
      <ul className="exq-adm-conflict__list">
        {affected.map((b) => (
          <li
            key={b.bookingId}
            className="exq-adm-conflict__item"
            data-state={choices[b.bookingId] ?? 'unset'}
          >
            <fieldset className="exq-adm-conflict__fieldset">
              <legend className="exq-adm-conflict__booking">
                {shopDateTime(b.startAt)}, {b.customerName} with {b.staffName} (
                {b.services.join(', ')}), {b.referenceCode}
              </legend>
              {(keepOnly
                ? (['keep'] as const)
                : (['keep', 'cancel', 'cancelAndNotify'] as const)
              ).map((action) => {
                const disabled = action === 'cancelAndNotify' && !b.hasEmail;
                return (
                  <label
                    key={action}
                    className="exq-adm-conflict__option"
                    data-state={disabled ? 'disabled' : 'enabled'}
                  >
                    <input
                      type="radio"
                      name={`conflict-${b.bookingId}`}
                      value={action}
                      disabled={disabled}
                      checked={choices[b.bookingId] === action}
                      onChange={() => {
                        setChoices((prev) => ({ ...prev, [b.bookingId]: action }));
                      }}
                    />{' '}
                    {ACTION_LABEL[action]}
                    {disabled ? ' (no email on file)' : ''}
                  </label>
                );
              })}
            </fieldset>
          </li>
        ))}
      </ul>
      <p className="exq-adm-conflict__actions">
        <button
          type="button"
          className="exq-adm-conflict__apply"
          disabled={working || missing > 0}
          onClick={() => {
            onSubmit(
              affected.map((b) => ({
                bookingId: b.bookingId,
                action: choices[b.bookingId] ?? 'keep',
              })),
            );
          }}
        >
          Apply the change
        </button>{' '}
        <button type="button" className="exq-adm-conflict__back" onClick={onCancel}>
          Go back without changing anything
        </button>
      </p>
    </section>
  );
}
