import Users01 from '@untitled-ui/icons-react/build/esm/Users01';
import type { PublicService, PublicStaff } from '@shared/api/public';
import { formatCents } from '@shared/lib/money';
import { quoteFirstAvailable, quoteForStaff } from '@shared/lib/servicePricing';
import { Button, OptionCard, PhotoFrame } from '@/components/ui';
import { qualifiedStaff } from '@/lib/booking/helpers';
import { inChairOrder } from '@/lib/chairStatus';

export interface StaffPickerProps {
  staff: PublicStaff[];
  serviceIds: string[];
  /** The services chosen, so each chair can show what they come to with that person. */
  services?: PublicService[] | undefined;
  selected: string | null;
  allowFirstAvailable: boolean;
  onChange: (selector: string) => void;
  onContinue: () => void;
}

function QuoteMeta({ cents, minutes, from }: { cents: number; minutes: number; from: boolean }) {
  return (
    <>
      <span className="exq-service-option__price exq-price">
        {from ? 'From ' : ''}
        {formatCents(cents)}
      </span>
      <span className="exq-service-option__duration">{minutes} min</span>
    </>
  );
}

/** What the chosen services come to with this person: their own prices and times. */
function chairMeta(services: PublicService[], member: PublicStaff) {
  const quote = services.length > 0 ? quoteForStaff(services, member) : null;
  return quote ? (
    <QuoteMeta cents={quote.totalCents} minutes={quote.totalMinutes} from={quote.from} />
  ) : undefined;
}

/** Chairs as option cards plus "Anyone available". Only chairs that do every chosen service appear. */
export function StaffPicker({
  staff,
  serviceIds,
  services = [],
  selected,
  allowFirstAvailable,
  onChange,
  onContinue,
}: StaffPickerProps) {
  const qualified = inChairOrder(qualifiedStaff(staff, serviceIds));
  const anyQuote = services.length > 0 ? quoteFirstAvailable(services, qualified) : null;
  return (
    <div
      className="exq-staff-picker"
      data-state={qualified.length === 0 ? 'none' : selected ? 'selected' : 'idle'}
    >
      {qualified.length === 0 ? (
        <p className="exq-staff-picker__empty" role="alert">
          No one offers that combination of services online. Try fewer services or call the shop.
        </p>
      ) : (
        <fieldset className="exq-staff-picker__group">
          <legend className="exq-staff-picker__legend exq-label">Who would you like?</legend>
          <ul className="exq-staff-picker__list exq-bare">
            {allowFirstAvailable ? (
              <li
                className="exq-staff-option exq-staff-option--any"
                data-state={selected === 'any' ? 'selected' : 'idle'}
              >
                <OptionCard
                  kind="radio"
                  name="barber"
                  selected={selected === 'any'}
                  title="Anyone available"
                  description="We pick the least booked chair."
                  meta={
                    anyQuote ? (
                      <QuoteMeta
                        cents={anyQuote.totalCents}
                        minutes={anyQuote.totalMinutes}
                        from={anyQuote.from}
                      />
                    ) : undefined
                  }
                  lead={
                    <span className="exq-option__mark" aria-hidden="true">
                      <Users01 />
                    </span>
                  }
                  onChange={() => {
                    onChange('any');
                  }}
                />
              </li>
            ) : null}
            {qualified.map((member) => (
              <li
                key={member.id}
                className="exq-staff-option"
                data-state={selected === member.slug ? 'selected' : 'idle'}
              >
                <OptionCard
                  kind="radio"
                  name="barber"
                  selected={selected === member.slug}
                  title={member.name}
                  description={member.specialty || member.title}
                  meta={chairMeta(services, member)}
                  lead={
                    <PhotoFrame
                      photo={member.photo ?? null}
                      name={member.name}
                      ratio="1:1"
                      sizes="56px"
                    />
                  }
                  onChange={() => {
                    onChange(member.slug);
                  }}
                />
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <p className="exq-book__inline-action">
        <Button disabled={!selected || qualified.length === 0} onClick={onContinue}>
          Continue
        </Button>
      </p>
    </div>
  );
}
