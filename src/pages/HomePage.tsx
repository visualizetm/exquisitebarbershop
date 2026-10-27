import Clock from '@untitled-ui/icons-react/build/esm/Clock';
import MarkerPin01 from '@untitled-ui/icons-react/build/esm/MarkerPin01';
import NavigationPointer01 from '@untitled-ui/icons-react/build/esm/NavigationPointer01';
import Phone01 from '@untitled-ui/icons-react/build/esm/Phone01';
import { galleryResponseSchema } from '@shared/api/photos';
import { publicServicesResponseSchema, publicStaffListResponseSchema } from '@shared/api/public';
import { formatUsPhone } from '@shared/lib/phone';
import { HOME_REVIEWS } from '@shared/lib/reviews';
import { heroLines } from '@shared/lib/hero';
import { DEFAULT_HERO } from '@shared/schemas/shopSettings';
import { HoursTable } from '@/components/site/HoursTable';
import { PhotoGrid } from '@/components/site/PhotoGrid';
import { RatingLine } from '@/components/site/RatingLine';
import { ReviewList } from '@/components/site/ReviewCard';
import { ServiceRows } from '@/components/site/ServiceRows';
import { TodaysChairs } from '@/components/site/TodaysChairs';
import {
  ButtonAnchor,
  ButtonLink,
  ErrorState,
  Label,
  Lines,
  Link,
  PhotoFrame,
  Reveal,
  SectionHead,
} from '@/components/ui';
import { menuServices } from '@/lib/menuPrices';
import { HOME_WORK_MAX, homeWork } from '@/lib/workPhotos';
import { useApi } from '@/lib/useApi';
import { usePageMeta } from '@/lib/usePageTitle';
import { useShop } from '@/app/useShop';
import { hoursLabel } from '@/lib/hours';
import { addressLine, directionsUrl, todayKey } from '@/lib/shop';

export function HomePage() {
  const shop = useShop();
  usePageMeta({
    title: null,
    description:
      shop.status === 'ready'
        ? `${shop.data.tagline}. Barbers and stylists under one roof at ${addressLine(shop.data.address)}. Pick your chair and book online in under a minute.`
        : undefined,
  });
  const staff = useApi('/api/staff', publicStaffListResponseSchema);
  const services = useApi('/api/services', publicServicesResponseSchema);
  // Home order: the photos the shop picked for Home first, then the rest of the gallery.
  const gallery = useApi(
    `/api/gallery?home=true&limit=${String(HOME_WORK_MAX)}`,
    galleryResponseSchema,
  );
  const work = gallery.status === 'ready' ? homeWork(gallery.data.photos) : [];
  const data = shop.status === 'ready' ? shop.data : null;
  const hero = data?.heroPhoto ?? null;
  // The words come from the settings; the seed copy stands in until the shop answers.
  const heroCopy = data?.hero ?? DEFAULT_HERO;
  const today = data ? data.hours[todayKey()] : null;
  const where = data ? `${data.address.city} ${data.address.state}` : 'Brookhaven PA';
  // The server sends only shown reviews, in the owner's order, and none while the section is off.
  const reviews = (data?.reviews ?? []).slice(0, HOME_REVIEWS);

  return (
    <article className="exq-home" data-state={shop.status}>
      {/* With a photo the hero is an ink band: on phones the photo fills it behind a scrim, from
          1024px it sits in its own column. Without one the text stands alone on the page. */}
      <section
        className={`exq-hero exq-home__hero${hero ? ' exq-dark' : ''}`}
        data-state={hero ? 'photo' : 'text'}
        aria-labelledby="exq-hero-title"
      >
        <div className="exq-wrap exq-hero__grid">
          <div className="exq-hero__text">
            <p className="exq-label exq-hero__label">Barber &amp; Beauty Lounge &middot; {where}</p>
            <Lines
              as="h1"
              id="exq-hero-title"
              mode="load"
              className="exq-display exq-home__title exq-hero__title"
              lines={heroLines(heroCopy)}
            />
            <p
              className="exq-hero__sub exq-hero__rise exq-home__lead"
              style={{ '--rise-i': 4 } as React.CSSProperties}
            >
              {heroCopy.subline}
            </p>
            <p
              className="exq-hero__actions exq-hero__rise exq-home__actions"
              style={{ '--rise-i': 5 } as React.CSSProperties}
            >
              <ButtonLink to="/book">Book a chair</ButtonLink>
              <ButtonLink to="/services" variant="outline">
                See services
              </ButtonLink>
            </p>
            <dl
              className="exq-hero__info exq-hero__rise"
              data-state={data ? 'ready' : 'loading'}
              style={{ '--rise-i': 6 } as React.CSSProperties}
            >
              <div>
                <dt>
                  <Clock aria-hidden="true" />
                  {today?.length === 0 ? 'Today' : 'Open today'}
                </dt>
                <dd>{today ? hoursLabel(today) : ''}</dd>
              </div>
              <div>
                <dt>
                  <MarkerPin01 aria-hidden="true" />
                  Find us
                </dt>
                <dd>{data?.address.line1 ?? ''}</dd>
              </div>
              <div>
                <dt>Walk-ins</dt>
                <dd>Welcome</dd>
              </div>
            </dl>
          </div>
          {hero ? (
            // The LCP image: eager, fetchpriority high, its own width and height, never hidden by
            // a reveal.
            <div className="exq-hero__photo">
              <PhotoFrame
                photo={hero}
                name="The shop"
                priority
                sizes="(min-width: 1024px) 480px, 100vw"
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="exq-wrap exq-section exq-home__chairs" aria-labelledby="exq-home-chairs">
        <SectionHead label="Today" title="Today's chairs" id="exq-home-chairs">
          <Link className="exq-link-row" to="/chairs">
            All chairs
          </Link>
        </SectionHead>
        {staff.status === 'error' ? (
          <ErrorState title="The chairs did not load">
            Call the shop and we will get you in.
          </ErrorState>
        ) : (
          <TodaysChairs staff={staff.status === 'ready' ? staff.data.staff : null} />
        )}
      </section>

      <section className="exq-band exq-dark exq-home__services" aria-labelledby="exq-home-services">
        <div className="exq-wrap exq-section">
          <SectionHead label="The menu" title="Services" id="exq-home-services" />
          {services.status === 'ready' && staff.status !== 'loading' ? (
            <ServiceRows
              services={menuServices(
                services.data.services,
                staff.status === 'ready' ? staff.data.staff : [],
              )}
              limit={5}
              showDescription
            />
          ) : services.status === 'error' ? (
            <ErrorState title="The menu did not load">Call the shop for prices.</ErrorState>
          ) : null}
          <p className="exq-home__more">
            <Link className="exq-link-row" to="/services">
              See all services
            </Link>
          </p>
        </div>
      </section>

      {work.length > 0 ? (
        <section
          className="exq-wrap exq-section exq-home__work"
          aria-labelledby="exq-home-work"
          data-count={String(work.length)}
        >
          <SectionHead label="The work" title="Fresh from the chairs" id="exq-home-work">
            <Link className="exq-link-row" to="/gallery">
              See the gallery
            </Link>
          </SectionHead>
          <PhotoGrid photos={work} columns="work" />
        </section>
      ) : null}

      {data && reviews.length > 0 ? (
        <section
          className="exq-wrap exq-section exq-home__reviews"
          aria-labelledby="exq-home-reviews"
        >
          <SectionHead label="Reviews" title="What clients say" id="exq-home-reviews" />
          {data.google ? <RatingLine google={data.google} shopName={data.name} /> : null}
          <ReviewList reviews={reviews} />
        </section>
      ) : null}

      <section className="exq-wrap exq-section exq-home__visit" aria-labelledby="exq-home-visit">
        <SectionHead label="Visit" title="Find us" id="exq-home-visit" />
        {data ? (
          <Reveal className="exq-visit__grid">
            <HoursTable hours={data.hours} />
            <div className="exq-visit__where">
              <Label quiet>Address</Label>
              <address className="exq-visit__address-text">
                {data.address.line1}
                {data.address.line2 ? <>, {data.address.line2}</> : null}
                <br />
                {data.address.city}, {data.address.state} {data.address.postalCode}
              </address>
              <p className="exq-visit__actions">
                <ButtonAnchor
                  href={directionsUrl(data)}
                  variant="outline"
                  target="_blank"
                  rel="noopener noreferrer"
                  icon={<NavigationPointer01 aria-hidden="true" />}
                >
                  Directions
                </ButtonAnchor>
                <ButtonAnchor
                  href={`tel:${data.phone}`}
                  variant="outline"
                  icon={<Phone01 aria-hidden="true" />}
                >
                  {formatUsPhone(data.phone)}
                </ButtonAnchor>
              </p>
            </div>
          </Reveal>
        ) : shop.status === 'error' ? (
          <ErrorState title="The shop details did not load">
            Call the shop for hours and directions.
          </ErrorState>
        ) : (
          <div className="exq-visit__grid exq-visit__grid--loading" aria-hidden="true" />
        )}
      </section>

      <section className="exq-band exq-dark exq-home__cta" aria-labelledby="exq-home-cta">
        <div className="exq-wrap exq-section exq-cta">
          <Lines
            id="exq-home-cta"
            mode="scroll"
            className="exq-display"
            lines={[{ text: 'Your chair' }, { text: 'is ready.', accent: true }]}
          />
          <Reveal as="p">
            <ButtonLink to="/book" size="lg">
              Book a chair
            </ButtonLink>
          </Reveal>
        </div>
      </section>
    </article>
  );
}
