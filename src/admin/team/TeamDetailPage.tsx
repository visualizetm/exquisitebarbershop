import { Link, useParams, useSearchParams } from 'react-router';
import ChevronLeft from '@untitled-ui/icons-react/build/esm/ChevronLeft';
import {
  hoursResponseSchema,
  serviceListResponseSchema,
  staffListResponseSchema,
} from '@shared/api/admin';
import { ErrorState, Tabs } from '@/components/ui';
import { Status } from '@/components/Status';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { useQuick } from '../shell/quick';
import { AccessTab } from './AccessTab';
import { HoursTab } from './HoursTab';
import { PricesTab } from './PricesTab';
import { ProfileTab } from './ProfileTab';
import { ServicesTab } from './ServicesTab';
import { TimeOffTab } from './TimeOffTab';

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'services', label: 'Services' },
  { id: 'prices', label: 'Prices' },
  { id: 'hours', label: 'Working hours' },
  { id: 'timeoff', label: 'Time off' },
  { id: 'access', label: 'Access' },
];

/** One barber: profile, the services they do, their own prices, weekly hours, time off and how they sign in. */
export function TeamDetailPage() {
  const { id = '' } = useParams();
  const quick = useQuick();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab'))
    ? (params.get('tab') ?? 'profile')
    : 'profile';
  const staff = useApi('/api/admin/staff', staffListResponseSchema, { version: quick.version });
  const services = useApi('/api/admin/services', serviceListResponseSchema);
  const hours = useApi('/api/admin/hours', hoursResponseSchema, { version: quick.version });
  const member = staff.status === 'ready' ? staff.data.staff.find((s) => s.id === id) : undefined;
  usePageTitle(member?.name ?? 'Team');

  if (staff.status === 'error' || services.status === 'error' || hours.status === 'error') {
    return (
      <ErrorState title="That profile did not load">
        Check the connection and reload the page.
      </ErrorState>
    );
  }
  if (staff.status === 'loading' || services.status === 'loading' || hours.status === 'loading') {
    return <Status state="loading" />;
  }
  if (!member || member.deletedAt) {
    return (
      <ErrorState title="That barber was not found">
        They may have been removed. <Link to="/admin/shop/team">Back to the team</Link>
      </ErrorState>
    );
  }
  const live = services.data.services.filter((s) => !s.deletedAt);
  const days = hours.data.staff.find((h) => h.staffId === member.id)?.days ?? hours.data.shop;

  return (
    <div className="exq-teamdetail">
      <p className="exq-teamdetail__back">
        <Link to="/admin/shop/team" className="exq-link-row">
          <ChevronLeft aria-hidden="true" width={16} height={16} />
          Team
        </Link>
      </p>
      <div className="exq-dash-head">
        <div>
          <h1>{member.name}</h1>
          <p className="exq-dash-head__sub">{member.title}</p>
        </div>
        <a
          className="exq-btn"
          data-variant="outline"
          data-size="sm"
          href={`/chairs/${member.slug}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="exq-btn__label">View on site</span>
        </a>
      </div>
      <section className="exq-panel">
        <Tabs
          label={`${member.name}, sections`}
          tabs={TABS}
          value={tab}
          onChange={(next) => {
            setParams({ tab: next }, { replace: true });
          }}
        >
          {tab === 'profile' ? <ProfileTab member={member} onChanged={quick.changed} /> : null}
          {tab === 'services' ? (
            <ServicesTab member={member} services={live} onChanged={quick.changed} />
          ) : null}
          {tab === 'prices' ? (
            <PricesTab
              member={member}
              services={live}
              onChanged={quick.changed}
              onChooseServices={() => {
                setParams({ tab: 'services' }, { replace: true });
              }}
            />
          ) : null}
          {tab === 'hours' ? (
            <HoursTab member={member} hours={days} onChanged={quick.changed} />
          ) : null}
          {tab === 'timeoff' ? <TimeOffTab member={member} /> : null}
          {tab === 'access' ? <AccessTab member={member} /> : null}
        </Tabs>
      </section>
    </div>
  );
}
