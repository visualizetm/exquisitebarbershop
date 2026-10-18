import { describe, expect, it } from 'vitest';
import { mediaIdOf, sniffImageType } from '../../server/storage/mongo';

const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('media ids', () => {
  it('takes the uuid out of every kind of photo key and nothing else', () => {
    expect(mediaIdOf(`hero/${UUID}.webp`)).toBe(`${UUID}.webp`);
    expect(mediaIdOf(`gallery/${UUID}.webp`)).toBe(`${UUID}.webp`);
    expect(mediaIdOf(`staff/${'a'.repeat(24)}/${UUID}.webp`)).toBe(`${UUID}.webp`);
    expect(mediaIdOf(`preview/hero/${UUID}.webp`)).toBe(`${UUID}.webp`);
    expect(mediaIdOf(`_doctor/${UUID}.txt`)).toBeNull();
    expect(mediaIdOf(`hero/${UUID}.png`)).toBeNull();
    expect(mediaIdOf('hero/not-a-uuid.webp')).toBeNull();
  });
});

describe('sniffImageType', () => {
  it('reads the type from the first bytes, not from anything the client says', () => {
    expect(sniffImageType(Buffer.from('RIFF....WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('image/jpeg');
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe('image/png');
    expect(sniffImageType(Buffer.from('RIFF....WAVEfmt '))).toBeNull();
    expect(sniffImageType(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});
