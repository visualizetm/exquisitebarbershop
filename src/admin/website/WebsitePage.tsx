import { useSearchParams } from 'react-router';
import { ButtonAnchor, Tabs } from '@/components/ui';
import { usePageTitle } from '@/lib/usePageTitle';
import { AnnouncementPanel } from '../panels/AnnouncementPanel';
import { GalleryPanel } from './GalleryPanel';
import { HomePhotoPanel } from './HomePhotoPanel';
import { HoursPanel } from './HoursPanel';
import { ServicesPanel } from './ServicesPanel';

const TABS = [
  { id: 'hours', label: 'Hours', path: '/visit' },
  { id: 'announcement', label: 'Announcement', path: '/' },
  { id: 'services', label: 'Services', path: '/services' },
  { id: 'photo', label: 'Home photo', path: '/' },
  { id: 'gallery', label: 'Gallery', path: '/gallery' },
] as const;

/**
 * Everything on the public site the owner edits. Each change saves on its own and shows on the
 * site right away; "View on site" opens the page the open tab changes in a new browser tab.
 */
export function WebsitePage() {
  usePageTitle('Website');
  const [params, setParams] = useSearchParams();
  const current = TABS.find((t) => t.id === params.get('tab')) ?? TABS[0];
  return (
    <div className="exq-website">
      <div className="exq-dash-head">
        <h1>Website</h1>
        <ButtonAnchor
          variant="outline"
          size="sm"
          href={current.path}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on site
        </ButtonAnchor>
      </div>
      <Tabs
        label="Website sections"
        tabs={TABS.map((t) => ({ id: t.id, label: t.label }))}
        value={current.id}
        onChange={(id) => {
          setParams({ tab: id }, { replace: true });
        }}
      >
        {current.id === 'hours' ? <HoursPanel /> : null}
        {current.id === 'announcement' ? (
          <div className="exq-tabbody">
            <AnnouncementPanel showViewLink={false} />
          </div>
        ) : null}
        {current.id === 'services' ? <ServicesPanel /> : null}
        {current.id === 'photo' ? <HomePhotoPanel /> : null}
        {current.id === 'gallery' ? <GalleryPanel /> : null}
      </Tabs>
    </div>
  );
}
