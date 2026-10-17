import 'dotenv/config';
import { closeMongoClient } from '../server/db/client';
import { runDoctor } from '../server/services/doctor';

/** `npm run doctor`: the same checklist as GET /api/internal/doctor, from the local environment. */
async function main(): Promise<void> {
  const report = await runDoctor();
  console.log(`Doctor for the ${report.environment} environment, ${report.checkedAt}\n`);
  for (const check of report.checks) {
    const word = check.status === 'pass' ? 'PASS' : check.status === 'warn' ? 'WARN' : 'FAIL';
    console.log(`${word}  ${check.label}: ${check.detail}`);
    if (check.fix && check.status !== 'pass') console.log(`      Fix: ${check.fix}`);
  }
  console.log(report.ok ? '\nEverything checks out.' : '\nSome checks failed.');
  if (!report.ok) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
