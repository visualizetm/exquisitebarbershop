import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { webpSize } from '../../server/lib/webpSize';
import { fakeWebp } from '../helpers/seedPhotoFixtures';

/** The RIFF container around one chunk. */
function riff(chunk: string, body: number[]): Buffer {
  const payload = Buffer.from([...body, ...Array<number>(16).fill(0)]);
  const head = Buffer.alloc(20);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(12 + payload.length, 4);
  head.write('WEBP', 8, 'ascii');
  head.write(chunk, 12, 'ascii');
  head.writeUInt32LE(payload.length, 16);
  return Buffer.concat([head, payload]);
}

/** Lossy: frame tag, start code 9d 01 2a, then 14 bit width and height. */
function vp8(width: number, height: number): Buffer {
  return riff('VP8 ', [
    0x10,
    0x02,
    0x00,
    0x9d,
    0x01,
    0x2a,
    width & 0xff,
    (width >> 8) & 0x3f,
    height & 0xff,
    (height >> 8) & 0x3f,
  ]);
}

/** Lossless: signature 2f, then width minus one and height minus one packed in 14 bits each. */
function vp8l(width: number, height: number): Buffer {
  const bits = ((width - 1) | ((height - 1) << 14)) >>> 0;
  return riff('VP8L', [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, bits >>> 24]);
}

describe('webpSize', () => {
  it('reads lossy, lossless and extended headers', () => {
    expect(webpSize(vp8(1200, 1600))).toEqual({ width: 1200, height: 1600 });
    expect(webpSize(vp8l(1290, 1290))).toEqual({ width: 1290, height: 1290 });
    expect(webpSize(vp8l(16384, 1))).toEqual({ width: 16384, height: 1 });
    expect(webpSize(fakeWebp(1280, 1600))).toEqual({ width: 1280, height: 1600 });
    expect(webpSize(fakeWebp(70000, 3))).toEqual({ width: 70000, height: 3 });
  });

  it('reads the real photos delivered in seed/photos', () => {
    const real = {
      'exq-01-hero.webp': { width: 1200, height: 1600 },
      'exq-08-curly-taper.webp': { width: 1280, height: 1600 },
      'exq-09-color-waves.webp': { width: 1290, height: 1290 },
    };
    for (const [file, size] of Object.entries(real)) {
      expect(webpSize(readFileSync(`seed/photos/${file}`)), file).toEqual(size);
    }
  });

  it('returns null for anything that is not a whole WebP header', () => {
    expect(webpSize(Buffer.from('not an image at all, just some text here'))).toBeNull();
    expect(webpSize(fakeWebp(800, 1000).subarray(0, 20))).toBeNull();
    expect(webpSize(Buffer.concat([Buffer.from('RIFF....WEBPVP8 '), Buffer.alloc(40)]))).toBeNull();
    const badSignature = vp8l(10, 10);
    badSignature[20] = 0;
    expect(webpSize(badSignature)).toBeNull();
    expect(webpSize(riff('ALPH', Array<number>(10).fill(1)))).toBeNull();
    expect(webpSize(vp8(0, 10))).toBeNull();
  });
});
