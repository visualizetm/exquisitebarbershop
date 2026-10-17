import Phone from '@untitled-ui/icons-react/build/esm/Phone';
import { formatUsPhone } from '@shared/lib/phone';
import { HoursTable } from '@/components/site/HoursTable';
import { ButtonAnchor, ErrorState } from '@/components/ui';
import { Status } from '@/components/Status';
import { usePageMeta } from '@/lib/usePageTitle';
import { useShop } from '@/app/useShop';
import { directionsUrl } from '@/lib/shop';

export function VisitPage() {
  const result = useShop();
  usePageMeta({
    title: 'Visit',
    description:
      result.status === 'ready'
        ? `Hours, address and phone for ${result.data.name} at ${result.data.address.line1}, ${result.data.address.city}, ${result.data.address.state} ${result.data.address.postalCode}.`
        : undefined,
  });
  return (
    <article className="exq-visit exq-wrap exq-section" data-state={result.status}>
      <p className="exq-label">Visit</p>
      <h1 className="exq-visit__title">Visit</h1>
      {result.status === 'loading' ? <Status state="loading" /> : null}
      {result.status === 'error' ? (
        <ErrorState>We could not load the shop details.</ErrorState>
      ) : null}
      {result.status === 'ready' ? (
        <div className="exq-visit__grid">
          <section className="exq-visit__hours" aria-labelledby="exq-visit-hours">
            <h2 id="exq-visit-hours">Hours</h2>
            <HoursTable hours={result.data.hours} />
          </section>
          <div className="exq-visit__where">
            <section className="exq-visit__address" aria-labelledby="exq-visit-address">
              <h2 id="exq-visit-address">Address</h2>
              <address className="exq-visit__address-text">
                {result.data.address.line1}
                {result.data.address.line2 ? <>, {result.data.address.line2}</> : null}
                <br />
                {result.data.address.city}, {result.data.address.state}{' '}
                {result.data.address.postalCode}
              </address>
              <p className="exq-visit__actions">
                <ButtonAnchor
                  href={directionsUrl(result.data.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Directions
                </ButtonAnchor>
                <ButtonAnchor
                  href={`tel:${result.data.phone}`}
                  variant="secondary"
                  icon={<Phone aria-hidden="true" />}
                >
                  Call
                </ButtonAnchor>
              </p>
            </section>
            <section className="exq-visit__contact" aria-labelledby="exq-visit-contact">
              <h2 id="exq-visit-contact">Contact</h2>
              <p>
                <a href={`tel:${result.data.phone}`}>{formatUsPhone(result.data.phone)}</a>
              </p>
              <p>
                <a href={`mailto:${result.data.email}`}>{result.data.email}</a>
              </p>
              <p>
                <a
                  href={`https://instagram.com/${result.data.instagramHandle}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  @{result.data.instagramHandle}
                </a>
              </p>
            </section>
            <section className="exq-visit__policies" aria-labelledby="exq-visit-policies">
              <h2 id="exq-visit-policies">Policies</h2>
              <ul className="exq-visit__policy-list">
                <li>Walk ins welcome when a chair is free.</li>
                <li>Cancel or move your booking up to 2 hours before.</li>
              </ul>
              <h3>Parking</h3>
              <p data-state="placeholder">Parking details coming soon.</p>
            </section>
          </div>
        </div>
      ) : null}
    </article>
  );
}
