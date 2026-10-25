import { describe, expect, it } from 'vitest';
import { shopSettingsSeed } from '../../seed/shop';
import { cancelPolicyLabel, changePolicyLabel, cutoffSpan } from '../../src/lib/booking/policy';

describe('the cancel and change policy lines come from the cutoff setting', () => {
  it('says the cutoff in hours or minutes', () => {
    expect(cutoffSpan(120)).toBe('2 hours');
    expect(cutoffSpan(60)).toBe('1 hour');
    expect(cutoffSpan(90)).toBe('90 minutes');
  });

  it('prints the line for the booking card and for the Visit page', () => {
    expect(cancelPolicyLabel(120)).toBe('Free to cancel up to 2 hours before.');
    expect(changePolicyLabel(120)).toBe('Cancel or move your booking up to 2 hours before.');
    expect(changePolicyLabel(1440)).toBe('Cancel or move your booking up to 24 hours before.');
    expect(changePolicyLabel(45)).toBe('Cancel or move your booking up to 45 minutes before.');
  });

  it('has a line for no cutoff at all', () => {
    expect(cancelPolicyLabel(0)).toBe('Free to cancel any time before your appointment.');
    expect(changePolicyLabel(0)).toBe('Cancel or move your booking any time before it starts.');
  });

  it('matches the seeded setting, so the Visit page says what the booking rules do', () => {
    const cutoff = shopSettingsSeed.booking.cancelCutoffMinutes;
    expect(cutoff).toBe(120);
    expect(changePolicyLabel(cutoff ?? 0)).toBe(
      'Cancel or move your booking up to 2 hours before.',
    );
  });
});
