import { Link } from 'react-router';
import Phone from '@untitled-ui/icons-react/build/esm/Phone';
import { galleryResponseSchema } from '@shared/api/photos';
import { publicServicesResponseSchema, publicStaffListResponseSchema } from '@shared/api/public';
import { formatUsPhone } from '@shared/lib/phone';
import { HoursTable } from '@/components/site/HoursTable';
import { PhotoGrid } from '@/components/site/PhotoGrid';
import { ServiceRows } from '@/components/site/ServiceRows';
import { TodaysChairs } from '@/components/site/TodaysChairs';
import { ButtonAnchor, ButtonLink } from '@/components/ui';
import { useApi } from '@/lib/useApi';
import { usePageMeta } from '@/lib/usePageTitle';
import { useShop } from '@/app/useShop';
import { directionsUrl } from '@/lib/shop';

export function HomePage() {
  const shop = useShop();
  usePageMeta({
    title: null,
    description:
      shop.status === 'ready'
        ? `${shop.data.tagline}. Barbers and stylists under one roof at ${shop.data.address.line1}, ${shop.data.address.city}, ${shop.data.address.state}. Pick your chair and book online in under a minute.`
        : undefined,
  });
  const staff = useApi('/api/staff', publicStaffListResponseSchema);
  const services = useApi('/api/services', publicServicesResponseSchema);
  const gallery = useApi('/api/gallery?limit=6', galleryResponseSchema);
  const hero = shop.status === 'ready' ? (shop.data.heroPhoto ?? null) : null;
  const phone = shop.status === 'ready' ? shop.data.phone : null;

  return (
    <article className="exq-home" data-state={shop.status}>
      <section
        className={`exq-home__hero exq-hero${hero ? '' : ' exq-dark exq-band'}`}
        data-state={hero ? 'photo' : 'ink'}
      >
        {hero ? (
          <>
            <img
              className="exq-hero__img"
              src={hero.url}
              width={hero.width}
              height={hero.height}
              alt={hero.alt}
              fetchPriority="high"
              decoding="async"
              sizes="100vw"
            />
            <span className="exq-hero__scrim" aria-hidden="true" />
          </>
        ) : (
          <div className="exq-wrap exq-hero__brand">
            <img
              className="exq-hero__logo"
              src="/brand/exq-primary-white.svg"
              alt=""
              width="500"
              height="204"
            />
          </div>
        )}
        <div className="exq-wrap exq-hero__content exq-dark">
          <h1 className="exq-home__title exq-hero__title">Fresh cuts. Gifted hands.</h1>
          <p className="exq-home__lead exq-hero__lead">
            Barbers and stylists under one roof in Brookhaven. Pick your chair and book in under a
            minute.
          </p>
          <p className="exq-home__actions exq-hero__actions">
            <ButtonLink to="/book" size="lg">
              Book a chair
            </ButtonLink>
            <ButtonAnchor
              href={phone ? `tel:${phone}` : '/visit'}
              variant="inverse"
              size="lg"
              icon={<Phone aria-hidden="true" />}
            >
              Call the shop
            </ButtonAnchor>
          </p>
        </div>
      </section>

      <section className="exq-wrap exq-section exq-home__chairs" aria-labelledby="exq-home-chairs">
        <p className="exq-label">Today</p>
        <h2 id="exq-home-chairs">Today's chairs</h2>
        <TodaysChairs staff={staff.status === 'ready' ? staff.data.staff : null} />
      </section>

      <section
        className="exq-wrap exq-section exq-home__services"
        aria-labelledby="exq-home-services"
      >
        <p className="exq-label">Services</p>
        <h2 id="exq-home-services">The menu</h2>
        {services.status === 'ready' ? (
          <ServiceRows services={services.data.services} limit={5} showDescription={false} />
        ) : null}
        <p className="exq-home__more">
          <Link to="/services">Full menu</Link>
        </p>
      </section>

      {gallery.status === 'ready' && gallery.data.photos.length > 0 ? (
        <section className="exq-wrap exq-section exq-home__work" aria-labelledby="exq-home-work">
          <p className="exq-label">Gallery</p>
          <h2 id="exq-home-work">The work</h2>
          <PhotoGrid photos={gallery.data.photos} columns="work" />
          <p className="exq-home__more">
            <Link to="/gallery">See the gallery</Link>
          </p>
        </section>
      ) : null}

      <section className="exq-wrap exq-section exq-home__visit" aria-labelledby="exq-home-visit">
        <p className="exq-label">Visit</p>
        <h2 id="exq-home-visit">Find us</h2>
        {shop.status === 'ready' ? (
          <div className="exq-visit__grid">
            <HoursTable hours={shop.data.hours} />
            <div className="exq-visit__where">
              <address className="exq-visit__address-text">
                {shop.data.address.line1}
                {shop.data.address.line2 ? <>, {shop.data.address.line2}</> : null}
                <br />
                {shop.data.address.city}, {shop.data.address.state} {shop.data.address.postalCode}
              </address>
              <p className="exq-visit__actions">
                <ButtonAnchor
                  href={directionsUrl(shop.data.address)}
                  variant="secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Directions
                </ButtonAnchor>
                <ButtonAnchor
                  href={`tel:${shop.data.phone}`}
                  variant="secondary"
                  icon={<Phone aria-hidden="true" />}
                >
                  {formatUsPhone(shop.data.phone)}
                </ButtonAnchor>
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="exq-band exq-dark exq-home__cta" aria-labelledby="exq-home-cta">
        <div className="exq-wrap exq-section">
          <h2 id="exq-home-cta">Your chair is ready.</h2>
          <p>
            <ButtonLink to="/book" variant="inverse" size="lg">
              Book a chair
            </ButtonLink>
          </p>
        </div>
      </section>
    </article>
  );
}
