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

/**
 * The public footer: the seal, hours, address and phone, Instagram and the year. It carries no
 * build stamp (the build is in /api/health only) and no staff link: /admin is reached by address.
 */
export function Footer({ shop }: { shop: PublicShop | null }) {
  const year = new Date().getFullYear();
  const instagram = shop?.instagramHandle ?? 'exquisitebarberbeauty';
  return (
    <footer
      className="exq-site-footer exq-footer exq-dark"
      data-state={shop ? 'ready' : 'loading'}
      data-menu-inert
    >
      <div className="exq-wrap exq-footer__inner">
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
              <address>
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
            <p>
              <a
                href={`https://instagram.com/${instagram}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                @{instagram}
              </a>
            </p>
          </div>
        </div>
        <p className="exq-footer__meta">&copy; {year} Exquisite Barber &amp; Beauty Lounge</p>
      </div>
    </footer>
  );
}
