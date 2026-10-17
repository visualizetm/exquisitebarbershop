import { Link } from 'react-router';
import type { PublicShop } from '@shared/api/public';
import { formatUsPhone } from '@shared/lib/phone';
import { DAY_KEYS, type DayKey } from '@shared/lib/time';
import { hoursLabel } from '@/lib/hours';

const DAY_SHORT: Record<DayKey, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

/** The public footer: seal, hours, address, Instagram, the year and the build stamp. */
export function Footer({ shop }: { shop: PublicShop | null }) {
  const sha = __BUILD_SHA__;
  const year = new Date().getFullYear();
  return (
    <footer className="exq-site-footer exq-footer exq-dark" data-state={shop ? 'ready' : 'loading'}>
      <div className="exq-wrap exq-site-footer__inner">
        <div className="exq-footer__grid">
          <img
            className="exq-footer__seal"
            src="/brand/exq-seal-white.svg"
            alt=""
            width="56"
            height="56"
          />
          <div>
            <p className="exq-footer__title">Hours</p>
            {shop ? (
              <dl className="exq-footer__hours">
                {DAY_KEYS.map((day) => (
                  <div key={day} style={{ display: 'contents' }}>
                    <dt>{DAY_SHORT[day]}</dt>
                    <dd>{hoursLabel(shop.hours[day])}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
          <div>
            <p className="exq-footer__title">Visit</p>
            {shop ? (
              <address className="exq-site-footer__address" style={{ fontStyle: 'normal' }}>
                {shop.address.line1}
                <br />
                {shop.address.city}, {shop.address.state} {shop.address.postalCode}
                <br />
                <a href={`tel:${shop.phone}`}>{formatUsPhone(shop.phone)}</a>
              </address>
            ) : null}
          </div>
          <div>
            <p className="exq-footer__title">Follow</p>
            <p className="exq-site-footer__social">
              <a
                href={`https://instagram.com/${shop?.instagramHandle ?? 'exquisitebarberbeauty'}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                @{shop?.instagramHandle ?? 'exquisitebarberbeauty'}
              </a>
            </p>
          </div>
        </div>
        <p className="exq-footer__meta">
          <span>&copy; {year} Exquisite Barber &amp; Beauty Lounge</span>
          <Link to="/admin" className="exq-site-footer__links">
            Staff sign in
          </Link>
          <span
            className="exq-site-footer__build"
            data-state={sha === 'unknown' ? 'unknown' : 'known'}
          >
            Build {sha.slice(0, 7)}
          </span>
        </p>
      </div>
    </footer>
  );
}
