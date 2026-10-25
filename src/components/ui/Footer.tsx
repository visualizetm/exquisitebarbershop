import type { PublicShop } from '@shared/api/public';
import { formatUsPhone } from '@shared/lib/phone';
import { DAY_KEYS, type DayKey } from '@shared/lib/time';
import { hoursLabel } from '@/lib/hours';
import { Mark } from './Mark';
import { SocialIcon, type Network } from './SocialIcon';

const SOCIAL: {
  network: Network;
  label: string;
  key: 'instagramUrl' | 'tiktokUrl' | 'facebookUrl';
}[] = [
  { network: 'instagram', label: 'Instagram', key: 'instagramUrl' },
  { network: 'tiktok', label: 'TikTok', key: 'tiktokUrl' },
  { network: 'facebook', label: 'Facebook', key: 'facebookUrl' },
];

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
  // An icon shows only for a link the owner has set in Settings.
  const links = SOCIAL.flatMap((n) => {
    const href = shop?.social?.[n.key] ?? '';
    return href === '' ? [] : [{ network: n.network, label: n.label, href }];
  });
  return (
    <footer
      className="exq-site-footer exq-footer exq-dark"
      data-state={shop ? 'ready' : 'loading'}
      data-menu-inert
    >
      <div className="exq-wrap exq-footer__inner">
        <div className="exq-footer__grid">
          <Mark name="crest" className="exq-footer__crest" width={72} height={72} />
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
                {shop.address.line2 ? <>, {shop.address.line2}</> : null}
                <br />
                {shop.address.city}, {shop.address.state} {shop.address.postalCode}
                <br />
                <a href={`tel:${shop.phone}`}>{formatUsPhone(shop.phone)}</a>
              </address>
            ) : null}
          </div>
          {links.length > 0 ? (
            <div>
              <p className="exq-footer__title">Follow</p>
              <ul className="exq-footer__social exq-bare">
                {links.map((link) => (
                  <li key={link.network}>
                    <a
                      className="exq-footer__social-link"
                      href={link.href}
                      aria-label={`Exquisite on ${link.label}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <SocialIcon network={link.network} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <p className="exq-footer__meta">&copy; {year} Exquisite Barber &amp; Beauty Lounge</p>
        {shop?.demo ? (
          <p className="exq-footer__demo">
            <a href="https://visualizestudio.org" target="_blank" rel="noopener noreferrer">
              Demo by Visualize Studio
            </a>
          </p>
        ) : null}
      </div>
    </footer>
  );
}
