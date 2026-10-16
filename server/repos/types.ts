import type { ClientSession } from 'mongodb';

/** Every repository call accepts the session of the surrounding transaction, if any. */
export interface RepoOptions {
  session?: ClientSession;
}

export function sessionOf(options: RepoOptions | undefined): { session?: ClientSession } {
  return options?.session ? { session: options.session } : {};
}
