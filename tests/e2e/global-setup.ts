/**
 * Runs once per Playwright run: clears the e2e server's rate-limit windows and
 * lockouts so a rerun against the same server starts fresh. The hook exists only
 * in scripts/e2e-server.ts; production has no such route.
 */
export default async function globalSetup(): Promise<void> {
  const api = `http://127.0.0.1:${process.env.API_PORT ?? '3002'}`;
  try {
    const res = await fetch(`${api}/__e2e/reset`, { method: 'POST' });
    if (!res.ok) throw new Error(`reset answered ${res.status}`);
  } catch (error) {
    // A server started by Playwright itself is fresh anyway.
    process.stderr.write(
      `e2e reset skipped: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}
