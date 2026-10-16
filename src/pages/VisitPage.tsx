import { publicShopSchema } from '@shared/api/public';
import { formatUsPhone } from '@shared/lib/phone';
import { DAY_KEYS, type DayKey } from '@shared/lib/time';
import { Status } from '@/components/Status';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';

const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

function to12Hour(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function VisitPage() {
  usePageTitle('Visit');
  const result = useApi('/api/shop', publicShopSchema);
  return (
    <article className="exq-visit" data-state={result.status}>
      <h1 className="exq-visit__title">Visit</h1>
      {result.status === 'loading' ? <Status state="loading" /> : null}
      {result.status === 'error' ? <Status state="error" /> : null}
      {result.status === 'ready' ? (
        <>
          <section className="exq-visit__address" aria-labelledby="exq-visit-address">
            <h2 id="exq-visit-address">Address</h2>
            <address className="exq-visit__address-text">
              {result.data.address.line1}
              {result.data.address.line2 ? <>, {result.data.address.line2}</> : null}
              <br />
              {result.data.address.city}, {result.data.address.state}{' '}
              {result.data.address.postalCode}
            </address>
          </section>
          <section className="exq-visit__contact" aria-labelledby="exq-visit-contact">
            <h2 id="exq-visit-contact">Contact</h2>
            <p>
              <a href={`tel:${result.data.phone}`}>{formatUsPhone(result.data.phone)}</a>
            </p>
            <p>
              <a href={`mailto:${result.data.email}`}>{result.data.email}</a>
            </p>
          </section>
          <section className="exq-visit__hours" aria-labelledby="exq-visit-hours">
            <h2 id="exq-visit-hours">Hours</h2>
            <dl className="exq-hours">
              {DAY_KEYS.map((day) => {
                const intervals = result.data.hours[day];
                return (
                  <div
                    key={day}
                    className="exq-hours__row"
                    data-state={intervals.length === 0 ? 'closed' : 'open'}
                  >
                    <dt className="exq-hours__day">{DAY_LABELS[day]}</dt>
                    <dd className="exq-hours__times">
                      {intervals.length === 0
                        ? 'Closed'
                        : intervals
                            .map((i) => `${to12Hour(i.start)} to ${to12Hour(i.end)}`)
                            .join(', ')}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        </>
      ) : null}
    </article>
  );
}
