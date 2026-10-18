/** Barbers sign in with a six digit PIN. The rules live here so the pad and the server agree. */
export const PIN_LENGTH = 6;
export const PIN_PATTERN = /^\d{6}$/;

/** The PIN shown on the sign-in screen in demo mode, and given to every seeded barber there. */
export const DEMO_PIN = '246810';

const REJECTED = 'Pick a PIN that is harder to guess. Avoid repeats and runs like 123456.';

/**
 * Why a PIN is too easy to guess, or null when it is fine. Rejects the same digit six times,
 * a straight run up or down (123456, 654321, 567890), and a short block repeated (121212, 123123).
 */
export function pinProblem(pin: string): string | null {
  if (!PIN_PATTERN.test(pin)) return `Use exactly ${String(PIN_LENGTH)} digits.`;
  const digits = [...pin].map(Number);
  const step = (a: number, b: number) => (b - a + 10) % 10;
  const steps = digits.slice(1).map((d, i) => step(digits[i] ?? 0, d));
  if (steps.every((s) => s === 0)) return REJECTED;
  if (steps.every((s) => s === 1) || steps.every((s) => s === 9)) return REJECTED;
  for (const size of [2, 3]) {
    if (pin === pin.slice(0, size).repeat(PIN_LENGTH / size)) return REJECTED;
  }
  return null;
}
