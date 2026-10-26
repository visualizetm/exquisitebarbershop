import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import Plus from '@untitled-ui/icons-react/build/esm/Plus';
import {
  dayStatusResponseSchema,
  overviewResponseSchema,
  staffListResponseSchema,
  type AdminStaffView,
  type OverviewResponse,
} from '@shared/api/admin';
import { Button, EmptyState, ErrorState, Sheet, Switch, useToast } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { Avatar } from '../components/Avatar';
import { firstNameLastInitial, shopTime, todayInShop } from '../format';
import { useQuick } from '../shell/quick';
import { AddBarberPanel } from './AddBarberPanel';

type Chair = OverviewResponse['chairs'][number];

/**
 * One card per barber: photo, name, an In or Off today switch and their next booking. Turning
 * someone off goes through the resolver when clients are booked; turning them back in is one tap.
 */
export function TeamPage() {
  usePageTitle('Team');
  const quick = useQuick();
  const navigate = useNavigate();
  const toast = useToast();
  const staff = useApi('/api/admin/staff', staffListResponseSchema, { version: quick.version });
  const overview = useApi('/api/admin/overview', overviewResponseSchema, {
    version: quick.version,
  });
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const chairs = new Map<string, Chair>();
  if (overview.status === 'ready') for (const c of overview.data.chairs) chairs.set(c.staff.id, c);

  async function backIn(member: AdminStaffView) {
    setBusy(member.id);
    try {
      await apiRequest(`/api/admin/staff/${member.id}/day`, dayStatusResponseSchema, {
        method: 'POST',
        body: { date: todayInShop(), status: 'in' },
      });
      quick.changed();
      toast({ text: `${member.name} is back in today.`, tone: 'ok' });
    } catch {
      toast({ text: 'That did not save. Try again.', tone: 'danger' });
    } finally {
      setBusy(null);
    }
  }

  const members = staff.status === 'ready' ? staff.data.staff.filter((s) => !s.deletedAt) : [];
  return (
    <div className="exq-team" data-state={staff.status}>
      <div className="exq-dash-head">
        <h1>Team</h1>
        <Button
          size="sm"
          icon={<Plus aria-hidden="true" />}
          onClick={() => {
            setAdding(true);
          }}
        >
          Add barber
        </Button>
      </div>

      {staff.status === 'error' ? (
        <ErrorState title="The team did not load">
          Check the connection and reload the page.
        </ErrorState>
      ) : staff.status === 'loading' ? (
        <ul className="exq-team__grid exq-bare" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="exq-skeleton exq-team__placeholder">
              Loading the team
            </li>
          ))}
        </ul>
      ) : members.length === 0 ? (
        <EmptyState
          title="No one on the team yet"
          action={
            <Button
              size="sm"
              onClick={() => {
                setAdding(true);
              }}
            >
              Add barber
            </Button>
          }
        >
          Add the first barber to start taking bookings.
        </EmptyState>
      ) : (
        <ul className="exq-team__grid exq-bare">
          {members.map((m) => {
            const chair = chairs.get(m.id);
            const isIn = chair?.status === 'in';
            return (
              <li
                key={m.id}
                className="exq-card exq-teamcard"
                data-state={chair?.status ?? 'loading'}
              >
                <div className="exq-teamcard__top">
                  <Avatar name={m.name} photo={chair?.photo ?? null} />
                  <div>
                    <Link to={`/admin/shop/team/${m.id}`} className="exq-teamcard__name">
                      {m.name}
                    </Link>
                    <p className="exq-teamcard__title">
                      {m.title}
                      {m.showOnWebsite ? '' : ', hidden on the site'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isIn}
                  busy={busy === m.id}
                  disabled={!chair || chair.status === 'closed'}
                  label={
                    chair?.status === 'closed' ? 'Shop closed' : isIn ? 'In today' : 'Off today'
                  }
                  onChange={(next) => {
                    if (next) void backIn(m);
                    else quick.openBarberOut(m.id);
                  }}
                />
                <p className="exq-teamcard__next">
                  {chair?.next ? (
                    <button
                      type="button"
                      className="exq-chairrow__btn"
                      onClick={() => {
                        quick.openBooking(chair.next?.id ?? '');
                      }}
                    >
                      <b>Next</b> {shopTime(chair.next.startAt)}{' '}
                      {firstNameLastInitial(chair.next.customer.name)}
                    </button>
                  ) : (
                    <span>
                      <b>Next</b> {isIn ? 'Nobody else today' : 'Nothing today'}
                    </span>
                  )}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigate(`/admin/shop/team/${m.id}`);
                  }}
                >
                  Open profile
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet
        open={adding}
        title="Add barber"
        size="lg"
        onClose={() => {
          setAdding(false);
        }}
      >
        <div className="exq-panelhost">
          <AddBarberPanel
            onAdded={(id, name) => {
              setAdding(false);
              quick.changed();
              toast({ text: `${name} is added. Set their hours and services next.`, tone: 'ok' });
              void navigate(`/admin/shop/team/${id}`);
            }}
          />
        </div>
      </Sheet>
    </div>
  );
}
