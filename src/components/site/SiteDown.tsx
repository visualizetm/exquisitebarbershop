import Phone from '@untitled-ui/icons-react/build/esm/Phone';
import { formatUsPhone } from '@shared/lib/phone';
import { ButtonAnchor, ErrorState } from '@/components/ui';

/**
 * The public site when the API is down or MAINTENANCE_MODE is on: one friendly
 * message with the shop phone, built from the kit. The admin keeps working.
 * `code` is the API's error code (CONFIG_ERROR, DATABASE_UNAVAILABLE...), shown in a small
 * Details disclosure so a screenshot says what is wrong. Never a value, never a stack.
 */
export function SiteDown({
  reason,
  phone,
  code,
}: {
  reason: 'down' | 'maintenance';
  phone: string;
  code?: string | undefined;
}) {
  const tel = phone.replace(/[^\d+]/g, '');
  return (
    <section className="exq-site-down exq-wrap exq-section" data-state={reason}>
      <ErrorState
        title={reason === 'maintenance' ? 'Back in a moment' : 'Online booking is having a moment'}
        action={
          <ButtonAnchor href={`tel:${tel}`} icon={<Phone aria-hidden="true" />}>
            Call {formatUsPhone(phone)}
          </ButtonAnchor>
        }
      >
        {reason === 'maintenance'
          ? `We are doing some work on the site. Call the shop at ${formatUsPhone(phone)} to book.`
          : "Call the shop and we'll get you in."}
      </ErrorState>
      {reason === 'down' && code ? (
        <details className="exq-site-down__details">
          <summary>Details</summary>
          <p>
            Error code: <code className="exq-site-down__code">{code}</code>
          </p>
        </details>
      ) : null}
    </section>
  );
}
