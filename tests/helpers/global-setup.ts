import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

/**
 * One in-memory replica set for the whole run. Transactions need a replica set,
 * so a plain MongoMemoryServer would not do. Each test file uses its own database
 * name, so files can run in parallel.
 */
let replSet: MongoMemoryReplSet | null = null;

export async function setup(project: TestProject): Promise<void> {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  project.provide('mongoUri', replSet.getUri());
}

export async function teardown(): Promise<void> {
  await replSet?.stop();
  replSet = null;
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
