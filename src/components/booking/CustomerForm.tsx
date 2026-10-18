import { useState, type SyntheticEvent } from 'react';
import { normalizeUsPhone } from '@shared/lib/phone';
import type { CustomerDetails } from '@/lib/booking/state';
import { Button, Input, Textarea } from '@/components/ui';

export interface CustomerFormProps {
  initial: CustomerDetails;
  requireEmail: boolean;
  onSubmit: (details: CustomerDetails, honeypot: string) => void;
}

interface FieldErrors {
  name?: string;
  phone?: string;
  email?: string;
}

export function CustomerForm({ initial, requireEmail, onSubmit }: CustomerFormProps) {
  const [details, setDetails] = useState<CustomerDetails>(initial);
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const update = (field: keyof CustomerDetails) => (event: { target: { value: string } }) => {
    setDetails((d) => ({ ...d, [field]: event.target.value }));
  };

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: FieldErrors = {};
    if (details.name.trim().length === 0) next.name = 'Please enter your name.';
    if (!normalizeUsPhone(details.phone)) next.phone = 'Please enter a valid US phone number.';
    const email = details.email.trim();
    if (requireEmail && email.length === 0) next.email = 'Please enter your email.';
    else if (email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = 'Please enter a valid email address.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSubmit({ ...details, name: details.name.trim(), email }, honeypot);
  };

  const errorCount = Object.keys(errors).length;
  return (
    <form
      id="exq-details-form"
      className="exq-customer-form"
      data-state={errorCount > 0 ? 'invalid' : 'idle'}
      onSubmit={handleSubmit}
      noValidate
    >
      {errorCount > 0 ? (
        <p className="exq-customer-form__summary" role="alert">
          Please fix the highlighted fields.
        </p>
      ) : null}
      <Input
        label="Name"
        type="text"
        autoComplete="name"
        value={details.name}
        onChange={update('name')}
        error={errors.name}
        required
      />
      <Input
        label="Mobile phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        value={details.phone}
        onChange={update('phone')}
        hint="US numbers only. We use it to reach you about this appointment."
        error={errors.phone}
        required
      />
      <Input
        label={`Email ${requireEmail ? '' : '(optional, for your confirmation)'}`}
        type="email"
        autoComplete="email"
        value={details.email}
        onChange={update('email')}
        error={errors.email}
        required={requireEmail}
      />
      <Textarea
        label="Notes (optional)"
        rows={3}
        maxLength={500}
        value={details.notes}
        onChange={update('notes')}
      />
      <div className="exq-field exq-field--trap" aria-hidden="true">
        <label htmlFor="exq-website">Website</label>
        <input
          id="exq-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => {
            setHoneypot(e.target.value);
          }}
        />
      </div>
      <p className="exq-book__inline-action">
        <Button type="submit">Review booking</Button>
      </p>
    </form>
  );
}
