/** Logins the end to end server seeds. Test-only values, never used outside the e2e run. */
export const E2E_OWNER = {
  email: 'owner.e2e@example.com',
  password: 'e2e-owner-long-phrase-correct-48',
};

export const E2E_BARBER = {
  email: 'marcus.e2e@example.com',
  password: 'e2e-barber-long-phrase-correct-73',
  staffKey: 'marcus',
};

/**
 * The owner the production-like run creates through /setup, from
 * SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD. Test-only values.
 */
export const PRODLIKE_OWNER = {
  email: 'owner.prodlike@example.com',
  password: 'prodlike-owner-long-phrase-correct-91',
};
