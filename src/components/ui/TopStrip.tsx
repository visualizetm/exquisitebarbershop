import type { Announcement } from '@shared/schemas/shopSettings';
import { Link } from './Link';

/**
 * The thin ink strip above the header with the announcement in small caps and an optional link.
 * While the shop settings load it is an empty ink bar of the same height, so nothing shifts.
 */
export function TopStrip({
  announcement,
  loading,
}: {
  announcement: Announcement | undefined;
  loading: boolean;
}) {
  if (!loading && !announcement?.enabled) return null;
  const link = announcement && announcement.linkLabel !== '' ? announcement : null;
  const external = link ? link.linkUrl.startsWith('https:') : false;
  return (
    <div className="exq-topstrip exq-dark" data-state={loading ? 'loading' : 'ready'}>
      <div className="exq-wrap exq-topstrip__inner">
        <p className="exq-topstrip__text">{announcement?.text}</p>
        {link ? (
          external ? (
            <a
              className="exq-topstrip__link"
              href={link.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {link.linkLabel}
            </a>
          ) : (
            <Link className="exq-topstrip__link" to={link.linkUrl}>
              {link.linkLabel}
            </Link>
          )
        ) : null}
      </div>
    </div>
  );
}
