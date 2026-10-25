import Clock from '@untitled-ui/icons-react/build/esm/Clock';
import Mail01 from '@untitled-ui/icons-react/build/esm/Mail01';
import MarkerPin01 from '@untitled-ui/icons-react/build/esm/MarkerPin01';
import NavigationPointer01 from '@untitled-ui/icons-react/build/esm/NavigationPointer01';
import Phone01 from '@untitled-ui/icons-react/build/esm/Phone01';
import type { PublicShop } from '@shared/api/public';
import { formatUsPhone } from '@shared/lib/phone';
import { HoursTable } from '@/components/site/HoursTable';
import { ButtonAnchor, ErrorState, Reveal, SectionHead } from '@/components/ui';
import { Status } from '@/components/Status';
import { usePageMeta } from '@/lib/usePageTitle';
import { useShop } from '@/app/useShop';
import { hoursLabel } from '@/lib/hours';
import { addressLine, directionsUrl, todayKey } from '@/lib/shop';

/** One sentence about today, above the table of the whole week. */
function todayHoursLine(hours: PublicShop['hours']): string {
  const today = hours[todayKey()];
  return today.length === 0 ? 'Closed today' : `Open today ${hoursLabel(today)}`;
}

export function VisitPage() {
  const result = useShop();
  usePageMeta({
    title: 'Visit',
    description:
      result.status === 'ready'
        ? `Hours, address and phone for ${result.data.name} at ${addressLine(result.data.address)}.`
        : undefined,
  });
  return (
    <article className="exq-visit exq-wrap exq-section" data-state={result.status}>
      <SectionHead label="Visit" title="Find us" level={1} />
      {result.status === 'loading' ? <Status state="loading" /> : null}
      {result.status === 'error' ? (
        <ErrorState>We could not load the shop details.</ErrorState>
      ) : null}
      {result.status === 'ready' ? (
        <div className="exq-visit__grid">
          <Reveal as="section" className="exq-visit__hours" aria-labelledby="exq-visit-hours">
            <h2 id="exq-visit-hours" className="exq-visit__heading">
              Hours
            </h2>
            <p className="exq-visit__fact">
              <Clock aria-hidden="true" />
              {todayHoursLine(result.data.hours)}
            </p>
            <HoursTable hours={result.data.hours} />
          </Reveal>
          <div className="exq-visit__where">
            <Reveal as="section" className="exq-visit__address" aria-labelledby="exq-visit-address">
              <h2 id="exq-visit-address" className="exq-visit__heading">
                Address
              </h2>
              <div className="exq-visit__fact">
                <MarkerPin01 aria-hidden="true" />
                <address className="exq-visit__address-text">
                  {result.data.address.line1}
                  {result.data.address.line2 ? <>, {result.data.address.line2}</> : null}
                  <br />
                  {result.data.address.city}, {result.data.address.state}{' '}
                  {result.data.address.postalCode}
                </address>
              </div>
              <p className="exq-visit__actions">
                <ButtonAnchor
                  href={directionsUrl(result.data)}
                  target="_blank"
                  rel="noopener noreferrer"
                  icon={<NavigationPointer01 aria-hidden="true" />}
                >
                  Directions
                </ButtonAnchor>
                <ButtonAnchor
                  href={`tel:${result.data.phone}`}
                  variant="outline"
                  icon={<Phone01 aria-hidden="true" />}
                >
                  Call
                </ButtonAnchor>
              </p>
            </Reveal>
            <Reveal as="section" className="exq-visit__contact" aria-labelledby="exq-visit-contact">
              <h2 id="exq-visit-contact" className="exq-visit__heading">
                Contact
              </h2>
              <p className="exq-visit__fact">
                <Phone01 aria-hidden="true" />
                <a href={`tel:${result.data.phone}`}>{formatUsPhone(result.data.phone)}</a>
              </p>
              {result.data.email ? (
                <p className="exq-visit__fact">
                  <Mail01 aria-hidden="true" />
                  <a href={`mailto:${result.data.email}`}>{result.data.email}</a>
                </p>
              ) : null}
              <p>
                <a
                  href={`https://instagram.com/${result.data.instagramHandle}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  @{result.data.instagramHandle}
                </a>
              </p>
            </Reveal>
            <Reveal
              as="section"
              className="exq-visit__policies"
              aria-labelledby="exq-visit-policies"
            >
              <h2 id="exq-visit-policies" className="exq-visit__heading">
                Walk-ins and changes
              </h2>
              <ul className="exq-visit__policy-list">
                <li>Walk-ins welcome when a chair is free.</li>
                <li>Cancel or move your booking up to 2 hours before.</li>
              </ul>
              <h3 className="exq-visit__subheading">Good to know</h3>
              <ul className="exq-visit__policy-list">
                <li>Kids welcome</li>
                <li>Wheelchair accessible parking lot</li>
              </ul>
              <h3 className="exq-visit__subheading">Parking</h3>
              <p data-state="placeholder">Parking details coming soon.</p>
            </Reveal>
          </div>
        </div>
      ) : null}
    </article>
  );
}
