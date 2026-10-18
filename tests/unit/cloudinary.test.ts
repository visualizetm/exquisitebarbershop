import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signParams, splitKey } from '../../server/storage/cloudinary';
import { CLOUDINARY_WIDTHS, cloudinarySrcSet, cloudinaryUrl } from '../../shared/lib/cloudinary';
import { photoKeySchema } from '../../shared/schemas/photo';

describe('signing', () => {
  it('sorts the parameters, joins them with &, appends the secret and hashes with SHA-1', () => {
    const secret = 'abcd';
    const signature = signParams(
      { timestamp: 1315060510, public_id: 'sample', folder: 'x/y' },
      secret,
    );
    const expected = createHash('sha1')
      .update('folder=x/y&public_id=sample&timestamp=1315060510abcd')
      .digest('hex');
    expect(signature).toBe(expected);
    expect(signature).toMatch(/^[0-9a-f]{40}$/);
  });

  it('leaves out the file, the api key, the cloud name and the resource type', () => {
    const plain = signParams({ folder: 'f', timestamp: 1 }, 's');
    const noisy = signParams(
      {
        folder: 'f',
        timestamp: 1,
        file: 'x',
        api_key: 'k',
        cloud_name: 'c',
        resource_type: 'image',
      },
      's',
    );
    expect(noisy).toBe(plain);
  });

  it('changes with any signed value or the secret', () => {
    const base = signParams({ folder: 'f', public_id: 'p', timestamp: 1 }, 's');
    expect(signParams({ folder: 'g', public_id: 'p', timestamp: 1 }, 's')).not.toBe(base);
    expect(signParams({ folder: 'f', public_id: 'q', timestamp: 1 }, 's')).not.toBe(base);
    expect(signParams({ folder: 'f', public_id: 'p', timestamp: 2 }, 's')).not.toBe(base);
    expect(signParams({ folder: 'f', public_id: 'p', timestamp: 1 }, 't')).not.toBe(base);
  });

  it('splits a key into its folder and its uuid', () => {
    expect(splitKey('exquisite/production/6f1c8b9e-0000-4000-8000-123456789abc')).toEqual({
      folder: 'exquisite/production',
      publicId: '6f1c8b9e-0000-4000-8000-123456789abc',
    });
  });
});

describe('delivery URLs', () => {
  const asset = { cloud: 'demo', publicId: 'exquisite/production/abc' };

  it('crops to the frame: f_auto, q_auto, c_fill, g_auto, the width and the ratio', () => {
    expect(cloudinaryUrl(asset, 800, '4:5')).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_fill,g_auto,w_800,ar_4:5/exquisite/production/abc',
    );
    expect(cloudinaryUrl(asset, 400, '1:1')).toContain('w_400,ar_1:1/');
    expect(cloudinaryUrl(asset, 1200, '16:9')).toContain('w_1200,ar_16:9/');
  });

  it('keeps the whole photo, limited in width, when there is no frame', () => {
    expect(cloudinaryUrl(asset, 1600, null)).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_1600/exquisite/production/abc',
    );
  });

  it('builds the four widths of the srcset', () => {
    expect(CLOUDINARY_WIDTHS).toEqual([400, 800, 1200, 1600]);
    const set = cloudinarySrcSet(asset, '4:5');
    const parts = set.split(', ');
    expect(parts).toHaveLength(4);
    expect(parts.map((p) => p.split(' ')[1])).toEqual(['400w', '800w', '1200w', '1600w']);
    expect(parts[0]).toContain('w_400,ar_4:5');
  });
});

describe('photo keys', () => {
  it('accepts a file key and a Cloudinary public id, and nothing else', () => {
    const uuid = '6f1c8b9e-0000-4000-8000-123456789abc';
    expect(photoKeySchema.safeParse(`gallery/${uuid}.webp`).success).toBe(true);
    expect(photoKeySchema.safeParse(`exquisite/production/${uuid}`).success).toBe(true);
    expect(photoKeySchema.safeParse(`exquisite/${uuid}`).success).toBe(true);
    expect(photoKeySchema.safeParse(uuid).success).toBe(false);
    expect(photoKeySchema.safeParse(`../exquisite/${uuid}`).success).toBe(false);
    expect(photoKeySchema.safeParse(`exquisite//production/${uuid}`).success).toBe(false);
    expect(photoKeySchema.safeParse(`Exquisite/${uuid}`).success).toBe(false);
  });
});
