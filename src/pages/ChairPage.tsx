import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { galleryResponseSchema } from '@shared/api/photos';
import {
  publicServicesResponseSchema,
  publicStaffResponseSchema,
  staffOpeningsResponseSchema,
} from '@shared/api/public';
import { priceLabel } from '@shared/lib/money';
import { PhotoGrid } from '@/components/site/PhotoGrid';
import { ButtonLink, Chips, ErrorState, PhotoFrame, TimeChipLink, useBar } from '@/components/ui';
import { useShop } from '@/app/useShop';
import { Status } from '@/components/Status';
import { ApiRequestError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePageMeta } from '@/lib/usePageTitle';

export function ChairPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const encoded = encodeURIComponent(slug);
  const result = useApi(slug ? `/api/staff/${encoded}` : null, publicStaffResponseSchema);
  const openings = useApi(
    slug ? `/api/staff/${encoded}/openings?count=3` : null,
    staffOpeningsResponseSchema,
  );
  const services = useApi('/api/services', publicServicesResponseSchema);
  const work = useApi(slug ? `/api/gallery?staff=${encoded}&limit=6` : null, galleryResponseSchema);
  const profile = result.status === 'ready' ? result.data.staff : null;
  const shop = useShop();
  const phone = (shop.status === 'ready' ? shop.data.phone : __SHOP_PHONE__).replace(/[^\d+]/g, '');
  // On a profile the phone bar books this barber, and the booking opens with them chosen.
  useBar(
    profile?.acceptsOnlineBooking
      ? {
          left: { label: 'Call', href: `tel:${phone}`, tone: 'ink' },
          right: {
            label: `Book ${profile.name}`,
            to: `/book?barber=${encodeURIComponent(profile.slug)}`,
            tone: 'paper',
          },
        }
      : null,
  );
  usePageMeta({
    title: profile?.name ?? 'The chairs',
    description: profile
      ? `${profile.name}, ${profile.title} at Exquisite Barber & Beauty Lounge in Brookhaven, PA. ${profile.specialty}. See the next openings and book online.`
      : undefined,
  });

  // An old slug (from a printed card) resolves, then the address is replaced with the current one.
  useEffect(() => {
    if (result.status === 'ready' && !result.data.canonical) {
      void navigate(`/chairs/${result.data.staff.slug}`, { replace: true });
    }
  }, [result, navigate]);

  if (result.status === 'loading') return <Status state="loading" />;
  if (result.status === 'error') {
    const notFound = result.error instanceof ApiRequestError && result.error.status === 404;
    return (
      <article className="exq-chair exq-wrap exq-section" data-state="error">
        <ErrorState
          title={notFound ? 'That chair is no longer listed' : undefined}
          action={
            <ButtonLink to="/chairs" variant="outline">
              See all chairs
            </ButtonLink>
          }
        />
      </article>
    );
  }
  const { staff } = result.data;
  const bookPath = `/book?barber=${encodeURIComponent(staff.slug)}`;
  const offered =
    services.status === 'ready'
      ? services.data.services.filter((s) => staff.serviceIds.includes(s.id))
      : [];
  const open = openings.status === 'ready' ? openings.data : null;
  const badge =
    staff.chairNumber !== null ? `Chair ${String(staff.chairNumber).padStart(2, '0')}` : null;

  return (
    <article className="exq-chair exq-wrap exq-section" data-state="ready">
      <div className="exq-chair__top">
        <div className="exq-chair__photo">
          <PhotoFrame
            photo={staff.photo ?? null}
            name={staff.name}
            priority
            sizes="(min-width: 768px) 360px, 100vw"
          />
        </div>
        <div className="exq-chair__intro">
          {badge ? <p className="exq-chair__chair exq-chaircard__badge">{badge}</p> : null}
          <h1 className="exq-chair__name">{staff.name}</h1>
          <p className="exq-chair__title">{staff.title}</p>
          {staff.specialty ? <p className="exq-chair__specialty">{staff.specialty}</p> : null}
          {staff.bio ? <p className="exq-chair__bio">{staff.bio}</p> : null}
          {staff.instagramHandle ? (
            <p className="exq-chair__social">
              <a
                href={`https://instagram.com/${staff.instagramHandle}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                @{staff.instagramHandle}
              </a>
            </p>
          ) : null}
          <p className="exq-chair__actions">
            {staff.acceptsOnlineBooking ? (
              <ButtonLink to={bookPath} size="lg">
                Book {staff.name}
              </ButtonLink>
            ) : (
              <span className="exq-chair__walk-in">Walk-ins only</span>
            )}
          </p>
        </div>
      </div>

      {staff.acceptsOnlineBooking ? (
        <section
          className="exq-chair__openings"
          aria-labelledby="exq-chair-openings"
          data-state={openings.status}
        >
          <p className="exq-label">Next openings</p>
          <h2 id="exq-chair-openings">Next openings</h2>
          {open?.service && open.openings.length > 0 ? (
            <>
              <Chips label="Next openings">
                {open.openings.map((o) => (
                  <TimeChipLink
                    key={o.startAt}
                    label={o.label}
                    startAt={o.startAt}
                    to={`${bookPath}&service=${encodeURIComponent(open.service?.id ?? '')}&date=${o.date}&time=${encodeURIComponent(o.startAt)}`}
                  />
                ))}
              </Chips>
              <p className="exq-chair__openings-note exq-muted">
                For a {open.service.name}. Other services may start at different times.
              </p>
            </>
          ) : openings.status === 'loading' ? (
            <Status state="loading" />
          ) : (
            <p className="exq-muted">
              No open times in the next two weeks. Call the shop for walk-ins.
            </p>
          )}
        </section>
      ) : null}

      {offered.length > 0 ? (
        <section className="exq-chair__services" aria-labelledby="exq-chair-services">
          <p className="exq-label">Services</p>
          <h2 id="exq-chair-services">What {staff.name} does</h2>
          <ul className="exq-services__list">
            {offered.map((service) => (
              <li
                key={service.id}
                className="exq-service"
                data-state={service.priceFrom ? 'from' : 'fixed'}
              >
                <Link
                  to={`${bookPath}&service=${encodeURIComponent(service.id)}`}
                  className="exq-service__row"
                  aria-label={`Book ${service.name} with ${staff.name}, ${service.durationMinutes} minutes, ${priceLabel(service)}`}
                >
                  <span className="exq-service__main">
                    <span className="exq-service__name">{service.name}</span>
                  </span>
                  <span className="exq-service__meta">
                    <span className="exq-service__duration">{service.durationMinutes} min</span>
                    <span className="exq-service__price exq-price">{priceLabel(service)}</span>
                    <span className="exq-service__book">Book</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {work.status === 'ready' && work.data.photos.length > 0 ? (
        <section className="exq-chair__work" aria-labelledby="exq-chair-work">
          <p className="exq-label">Gallery</p>
          <h2 id="exq-chair-work">{staff.name}'s work</h2>
          <PhotoGrid photos={work.data.photos} columns="work" />
          <p className="exq-home__more">
            <Link to={`/gallery?staff=${encodeURIComponent(staff.slug)}`}>
              See all of {staff.name}'s work
            </Link>
          </p>
        </section>
      ) : null}
    </article>
  );
}
