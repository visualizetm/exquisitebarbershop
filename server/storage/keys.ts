import { z } from 'zod';
import { photoKeySchema } from '../../shared/schemas/photo';

const PREFIX = '(?:[a-z0-9][a-z0-9-]*/)?';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** The doctor writes one tiny object here and deletes it again. */
export const doctorKeySchema = z.string().regex(new RegExp(`^${PREFIX}_doctor/${UUID}\\.txt$`));
/** Daily exports: _backups/YYYY-MM-DD/<collection>.ndjson.gz plus a manifest.json. */
export const backupKeySchema = z
  .string()
  .regex(new RegExp(`^${PREFIX}_backups/\\d{4}-\\d{2}-\\d{2}/[a-zA-Z]+\\.(?:ndjson\\.gz|json)$`));

/** Every key the local driver and the uploads handler accept. Nothing else can touch the disk. */
export function isObjectKey(key: string): boolean {
  return (
    photoKeySchema.safeParse(key).success ||
    doctorKeySchema.safeParse(key).success ||
    backupKeySchema.safeParse(key).success
  );
}
