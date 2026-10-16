/**
 * Minimal structured logger. One JSON object per line so Vercel log search works.
 * Level comes from LOG_LEVEL and is read lazily to keep imports side effect free.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const raw = process.env.LOG_LEVEL;
  return raw && raw in ORDER ? ORDER[raw as Level] : ORDER.info;
}

function emit(level: Level, message: string, fields: Record<string, unknown>): void {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...fields });
  if (level === 'error' || level === 'warn') console.error(line);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  debug(message: string, fields: Record<string, unknown> = {}): void {
    emit('debug', message, fields);
  },
  info(message: string, fields: Record<string, unknown> = {}): void {
    emit('info', message, fields);
  },
  warn(message: string, fields: Record<string, unknown> = {}): void {
    emit('warn', message, fields);
  },
  error(message: string, fields: Record<string, unknown> = {}): void {
    emit('error', message, fields);
  },
};

/** Serializes an unknown thrown value for logging without leaking it to clients. */
export function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { value: String(error) };
}
