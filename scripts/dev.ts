import { spawn } from 'node:child_process';

/** Runs the Vite dev server and the local API server together. */
const children = [
  spawn('npm', ['run', 'dev:api'], { stdio: 'inherit', shell: process.platform === 'win32' }),
  spawn('npm', ['run', 'dev:web'], { stdio: 'inherit', shell: process.platform === 'win32' }),
];

function shutdown(): void {
  for (const child of children) child.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
for (const child of children) child.on('exit', shutdown);
