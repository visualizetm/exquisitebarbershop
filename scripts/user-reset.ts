import 'dotenv/config';
import { parseArgs } from 'node:util';
import { operatorResetPassword } from '../server/auth/authService';
import { closeMongoClient } from '../server/db/client';

/**
 * Resets a login's password from the server shell, for when the owner is locked
 * out (there is no email reset flow). Usage:
 *
 *   npm run user:reset -- --email owner@example.com
 *     prints a temporary password that must be changed at the next sign-in
 *   echo 'a long new password' | npm run user:reset -- --email owner@example.com --password-stdin
 *     sets that password directly
 *
 * Either way every session of the login ends, any lockout is cleared and the
 * reset is written to the audit log.
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, 'password-stdin': { type: 'boolean', default: false } },
  });
  if (!values.email) {
    console.error('Usage: npm run user:reset -- --email <address> [--password-stdin]');
    process.exitCode = 2;
    return;
  }
  const password = values['password-stdin'] ? await readStdin() : null;
  const result = await operatorResetPassword({ email: values.email, password }, new Date());
  console.log(
    `Password reset for ${result.user.email} (${result.user.role}). Every session was ended.`,
  );
  if (result.temporary) {
    console.log(`Temporary password: ${result.password}`);
    console.log('It must be changed at the next sign-in.');
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
