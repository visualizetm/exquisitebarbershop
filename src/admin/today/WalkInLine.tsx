import { useState } from 'react';
import ChevronDown from '@untitled-ui/icons-react/build/esm/ChevronDown';
import ChevronUp from '@untitled-ui/icons-react/build/esm/ChevronUp';
import type { ChairEstimate, WalkInView } from '@shared/api/line';
import { Button, IconButton, Sheet } from '@/components/ui';
import { estimateLabel } from './estimateLabel';

export interface LineActions {
  seat: (w: WalkInView, staffId?: string) => Promise<void>;
  left: (w: WalkInView) => Promise<void>;
  move: (w: WalkInView, direction: 'up' | 'down') => Promise<void>;
  changeChair: (w: WalkInView, staffId: string | null) => Promise<void>;
  add: () => void;
}

/**
 * The walk-in line on Today: numbered cards with the wait so far and the estimate, Seat (a real
 * booking starting now), Move to another chair (a sheet with every chair's estimate), Left, and
 * up and down to reorder. Nothing drags.
 */
export function WalkInLine({
  line,
  busy,
  actions,
}: {
  line: WalkInView[];
  busy: string | null;
  actions: LineActions;
}) {
  const [moving, setMoving] = useState<WalkInView | null>(null);
  return (
    <section className="exq-panel exq-line" aria-labelledby="exq-line-head">
      <div className="exq-panel__head">
        <h2 id="exq-line-head">Walk-in line</h2>
        <span className="exq-label exq-line__count">
          {line.length} {line.length === 1 ? 'waiting' : 'waiting'}
        </span>
      </div>
      {line.length === 0 ? (
        <p className="exq-muted exq-line__empty">Nobody is waiting.</p>
      ) : (
        <ol className="exq-bare exq-line__list">
          {line.map((w, i) => (
            <li key={w.id} className="exq-line__card" data-state={busy === w.id ? 'busy' : 'idle'}>
              <span className="exq-line__number exq-num" aria-hidden="true">
                {i + 1}
              </span>
              <div className="exq-line__body">
                <p className="exq-line__name">{w.name}</p>
                <p className="exq-line__sub">
                  {w.services.map((s) => s.name).join(', ')} <span aria-hidden="true">·</span>{' '}
                  {w.staffName}
                </p>
                <p className="exq-line__wait exq-label">
                  Waiting {w.waitingMinutes} min <span aria-hidden="true">·</span>{' '}
                  {estimateLabel(
                    w.estimate,
                    w.staffId === null && w.expectedStaffId
                      ? (w.options.find((o) => o.staffId === w.expectedStaffId)?.name ?? '')
                      : '',
                  )}
                </p>
                <div className="exq-line__actions">
                  <Button
                    size="sm"
                    disabled={busy === w.id}
                    onClick={() => void actions.seat(w)}
                    aria-label={`Seat ${w.name}`}
                  >
                    Seat
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === w.id}
                    onClick={() => {
                      setMoving(w);
                    }}
                    aria-label={`Move ${w.name} to another chair`}
                  >
                    Move
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === w.id}
                    onClick={() => void actions.left(w)}
                    aria-label={`${w.name} left`}
                  >
                    Left
                  </Button>
                </div>
              </div>
              <span className="exq-line__order">
                <IconButton
                  label={`Move ${w.name} up`}
                  icon={<ChevronUp aria-hidden="true" />}
                  disabled={i === 0 || busy === w.id}
                  onClick={() => void actions.move(w, 'up')}
                />
                <IconButton
                  label={`Move ${w.name} down`}
                  icon={<ChevronDown aria-hidden="true" />}
                  disabled={i === line.length - 1 || busy === w.id}
                  onClick={() => void actions.move(w, 'down')}
                />
              </span>
            </li>
          ))}
        </ol>
      )}
      <Button variant="outline" block onClick={actions.add}>
        Add walk-in
      </Button>

      <Sheet
        open={moving !== null}
        title={moving ? `Move ${moving.name}` : ''}
        onClose={() => {
          setMoving(null);
        }}
      >
        {moving ? (
          <ul className="exq-bare exq-line__options">
            <li>
              <button
                type="button"
                className="exq-line__option"
                data-state={moving.staffId === null ? 'selected' : 'idle'}
                onClick={() => {
                  setMoving(null);
                  void actions.changeChair(moving, null);
                }}
              >
                <span className="exq-line__option-name">First available</span>
                <span className="exq-line__option-wait">Whoever frees up first</span>
              </button>
            </li>
            {moving.options.map((o: ChairEstimate) => (
              <li key={o.staffId}>
                <button
                  type="button"
                  className="exq-line__option"
                  data-state={moving.staffId === o.staffId ? 'selected' : 'idle'}
                  onClick={() => {
                    setMoving(null);
                    void actions.changeChair(moving, o.staffId);
                  }}
                >
                  <span className="exq-line__option-name">{o.name}</span>
                  <span className="exq-line__option-wait">{estimateLabel(o.estimate)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Sheet>
    </section>
  );
}
