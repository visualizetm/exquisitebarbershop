import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A tiny extended WebP (a VP8X header) with the given canvas size, padded with filler. Anything
 * that reads the header takes it as a WebP of that size; nothing decodes it. Built at test time, so
 * no fixture is ever committed to seed/photos.
 */
export function fakeWebp(width: number, height: number, padding = 64): Buffer {
  const bytes = Buffer.alloc(30 + padding);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WEBPVP8X', 8, 'ascii');
  bytes.writeUInt32LE(10, 16);
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}

export interface FixturePhoto {
  file: string;
  kind: 'hero' | 'gallery';
  alt: string;
  sortOrder: number;
  home?: boolean;
  /** Width and height of the file written, or null to leave the file out (a missing photo). */
  size: [number, number] | null;
}

/** A temp folder shaped like seed/photos: a manifest.json and a WebP for each photo that has a size. */
export function makeSeedPhotoDir(photos: FixturePhoto[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'exq-seed-photos-'));
  const entries = photos.map((photo) => ({
    file: photo.file,
    kind: photo.kind,
    alt: photo.alt,
    source: 'test fixture',
    ...(photo.home ? { home: true } : {}),
    sortOrder: photo.sortOrder,
  }));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ _note: 'fixture', photos: entries }));
  for (const photo of photos) {
    if (photo.size) writeFileSync(join(dir, photo.file), fakeWebp(photo.size[0], photo.size[1]));
  }
  return dir;
}
