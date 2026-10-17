import { useState, type SyntheticEvent } from 'react';
import { normalizeUsPhone } from '@shared/lib/phone';
import type { CustomerDetails } from '@/lib/booking/state';
import { Button } from '@/components/ui';

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
      <div className="exq-field" data-state={errors.name ? 'invalid' : 'valid'}>
        <label className="exq-field__label" htmlFor="exq-name">
          Name
        </label>
        <input
          id="exq-name"
          className="exq-field__input"
          type="text"
          autoComplete="name"
          value={details.name}
          onChange={update('name')}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'exq-name-error' : undefined}
          required
        />
        {errors.name ? (
          <p id="exq-name-error" className="exq-field__error" role="alert">
            {errors.name}
          </p>
        ) : null}
      </div>
      <div className="exq-field" data-state={errors.phone ? 'invalid' : 'valid'}>
        <label className="exq-field__label" htmlFor="exq-phone">
          Mobile phone
        </label>
        <input
          id="exq-phone"
          className="exq-field__input"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          value={details.phone}
          onChange={update('phone')}
          aria-invalid={Boolean(errors.phone)}
          aria-describedby={errors.phone ? 'exq-phone-error' : 'exq-phone-hint'}
          required
        />
        <p id="exq-phone-hint" className="exq-field__hint">
          US numbers only. We use it to reach you about this appointment.
        </p>
        {errors.phone ? (
          <p id="exq-phone-error" className="exq-field__error" role="alert">
            {errors.phone}
          </p>
        ) : null}
      </div>
      <div className="exq-field" data-state={errors.email ? 'invalid' : 'valid'}>
        <label className="exq-field__label" htmlFor="exq-email">
          Email {requireEmail ? '' : '(optional, for your confirmation)'}
        </label>
        <input
          id="exq-email"
          className="exq-field__input"
          type="email"
          autoComplete="email"
          value={details.email}
          onChange={update('email')}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'exq-email-error' : undefined}
          required={requireEmail}
        />
        {errors.email ? (
          <p id="exq-email-error" className="exq-field__error" role="alert">
            {errors.email}
          </p>
        ) : null}
      </div>
      <div className="exq-field" data-state="valid">
        <label className="exq-field__label" htmlFor="exq-notes">
          Notes (optional)
        </label>
        <textarea
          id="exq-notes"
          className="exq-field__input"
          rows={3}
          maxLength={500}
          value={details.notes}
          onChange={update('notes')}
        />
      </div>
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
      <Button type="submit">Review booking</Button>
    </form>
  );
}
