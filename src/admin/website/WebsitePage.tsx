import { Navigate, useParams } from 'react-router';
import { ButtonAnchor } from '@/components/ui';
import { usePageTitle } from '@/lib/usePageTitle';
import { SIDE_HOME } from '../shell/ownerNav';
import { AnnouncementPanel } from '../panels/AnnouncementPanel';
import { GalleryPanel } from './GalleryPanel';
import { HomePhotoPanel } from './HomePhotoPanel';
import { HoursPanel } from './HoursPanel';
import { ReviewsPanel } from './ReviewsPanel';
import { ServicesPanel } from './ServicesPanel';

/** The Website side, one address per section; the shell's section tabs move between them. */
const TABS = [
  { id: 'announcement', label: 'Announcement', path: '/' },
  { id: 'top', label: 'Top of page', path: '/' },
  { id: 'hours', label: 'Hours', path: '/visit' },
  { id: 'services', label: 'Services and prices', path: '/services' },
  { id: 'gallery', label: 'Gallery', path: '/gallery' },
  { id: 'reviews', label: 'Reviews', path: '/' },
] as const;

/**
 * Everything on the public site the owner edits. Each change saves on its own and shows on the
 * site right away; "View on site" opens the page the open section changes in a new browser tab.
 */
export function WebsitePage() {
  const { tab } = useParams();
  const current = TABS.find((t) => t.id === tab);
  usePageTitle(current ? `Website, ${current.label}` : 'Website');
  if (!current) return <Navigate to={SIDE_HOME.website} replace />;
  return (
    <div className="exq-website">
      <div className="exq-dash-head">
        <div>
          <p className="exq-dash-head__kicker exq-label">Website</p>
          <h1>{current.label}</h1>
        </div>
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
      <div className="exq-website__panel" data-tab={current.id}>
        {current.id === 'hours' ? <HoursPanel /> : null}
        {current.id === 'announcement' ? (
          <div className="exq-tabbody">
            <AnnouncementPanel showViewLink={false} />
          </div>
        ) : null}
        {current.id === 'services' ? <ServicesPanel /> : null}
        {current.id === 'top' ? <HomePhotoPanel /> : null}
        {current.id === 'gallery' ? <GalleryPanel /> : null}
        {current.id === 'reviews' ? <ReviewsPanel /> : null}
      </div>
    </div>
  );
}
