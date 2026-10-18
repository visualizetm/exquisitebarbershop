import { useEffect, useState } from 'react';
import { customerResponseSchema } from '@shared/api/admin';
import { Button, Sheet, StatusChip, Textarea, useToast } from '@/components/ui';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { money, shopDateTime } from '../format';
import { useQuick } from '../shell/quick';

/** One customer: visits, history, the usual barber and a note only the owner sees. */
export function CustomerSheet({ phone, onClose }: { phone: string | null; onClose: () => void }) {
  return (
    <Sheet open={phone !== null} title="Customer" size="lg" onClose={onClose}>
      <div className="exq-panelhost">
        {phone ? <CustomerBody key={phone} phone={phone} /> : null}
      </div>
    </Sheet>
  );
}

function CustomerBody({ phone }: { phone: string }) {
  const quick = useQuick();
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const loaded = useApi(`/api/admin/customers?phone=${phone}`, customerResponseSchema, { version });
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (loaded.status === 'ready') setNotes(loaded.data.notes ?? '');
  }, [loaded]);

  if (loaded.status !== 'ready') {
    return (
      <div className="exq-panelbody">
        <Status state={loaded.status === 'error' ? 'error' : 'loading'} />
      </div>
    );
  }
  const c = loaded.data;

  async function save() {
    setSaving(true);
    try {
      await apiRequest('/api/admin/customers/notes', customerResponseSchema.pick({ notes: true }), {
        method: 'PUT',
        body: { phone: c.phoneE164, notes },
      });
      setVersion((v) => v + 1);
      quick.changed();
      toast({ text: 'Note saved.', tone: 'ok' });
    } catch {
      toast({ text: 'The note did not save. Try again.', tone: 'danger' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="exq-bsheet">
      <h3 className="exq-bsheet__name">{c.names[0] ?? 'Customer'}</h3>
      {c.names.length > 1 ? (
        <p className="exq-muted">Also booked as {c.names.slice(1).join(', ')}.</p>
      ) : null}
      <dl className="exq-bsheet__facts">
        <Fact term="Phone">
          <a href={`tel:${c.phoneE164}`}>{c.phone}</a>
        </Fact>
        <Fact term="Email">{c.emails.length > 0 ? c.emails.join(', ') : 'None given'}</Fact>
        <Fact term="Visits">{c.counts.completed}</Fact>
        <Fact term="Upcoming">{c.counts.upcoming}</Fact>
        <Fact term="No-shows">{c.counts.noShow}</Fact>
        <Fact term="Cancelled">{c.counts.cancelled}</Fact>
        <Fact term="Spent">{money(c.completedSpendCents)}</Fact>
        <Fact term="Usual barber">{c.usualBarber?.name ?? 'None yet'}</Fact>
      </dl>

      <form
        className="exq-bsheet__panel"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Textarea
          label="Private notes"
          hint="Only you see these. Barbers and the customer never do."
          maxLength={2000}
          rows={4}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          loading={saving}
          disabled={notes.trim() === (c.notes ?? '')}
        >
          Save note
        </Button>
      </form>

      <section aria-labelledby="exq-cust-history">
        <h3 id="exq-cust-history" className="exq-bsheet__h">
          Visit history
        </h3>
        <ul className="exq-activity exq-bare">
          {c.bookings.map((b) => (
            <li key={b.id} className="exq-activity__item">
              <button
                type="button"
                className="exq-activity__btn exq-activity__btn--wide"
                onClick={() => {
                  quick.openBooking(b.id);
                }}
              >
                <span className="exq-activity__who">
                  {shopDateTime(b.startAt)}
                  <span className="exq-activity__sub">
                    {b.services.map((s) => s.name).join(', ')} with {b.staff.name}
                  </span>
                </span>
                <StatusChip status={b.status} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="exq-bsheet__fact">
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}
