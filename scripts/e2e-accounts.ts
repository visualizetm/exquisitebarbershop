/** Logins the end to end server seeds. Test-only values, never used outside the e2e run. */
export const E2E_OWNER = {
  email: 'owner.e2e@example.com',
  password: 'e2e-owner-long-phrase-correct-48',
};

/**
 * Every barber has chosen this PIN, so the tests can sign in as any of them at /team. The portal
 * tests pick a chair at random, because a walk-in holds its chair for the next 40 minutes.
 */
export const E2E_BARBER_PIN = '482915';
export const E2E_BARBER_NAMES = ['Lee', 'Drew', 'Nelly', 'Iniya', 'Dontrise'] as const;

/**
 * The owner the production-like run creates through /setup, from
 * SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD. Test-only values.
 */
export const PRODLIKE_OWNER = {
  email: 'owner.prodlike@example.com',
  password: 'prodlike-owner-long-phrase-correct-91',
};
