import { describe, expect, it } from 'vitest';
import { shopSettingsSeed } from '../../seed/shop';
import { collection } from '../../server/db/collections';
import { shopSettingsRepo } from '../../server/repos';
import { SHOP_SETTINGS_ID } from '../../shared/lib/constants';
import {
  DEFAULT_HERO,
  DEFAULT_LAUNCH_OFFER,
  DEFAULT_VISIT,
} from '../../shared/schemas/shopSettings';
import { NOW, useTestDb } from '../helpers/db';

useTestDb();

describe('shopSettingsRepo', () => {
  it('requires settings, creates them once, and never overwrites on a second create', async () => {
    expect(await shopSettingsRepo.getShopSettings()).toBeNull();
    await expect(shopSettingsRepo.requireShopSettings()).rejects.toMatchObject({
      code: 'CONFIG_ERROR',
    });
    expect(await shopSettingsRepo.createShopSettingsIfMissing(shopSettingsSeed, NOW)).toEqual({
      created: true,
    });
    const edited = await shopSettingsRepo.updateShopSettings(
      { ...shopSettingsSeed, tagline: 'Edited by owner' },
      NOW,
    );
    expect(edited.tagline).toBe('Edited by owner');
    expect(await shopSettingsRepo.createShopSettingsIfMissing(shopSettingsSeed, NOW)).toEqual({
      created: false,
    });
    expect((await shopSettingsRepo.requireShopSettings()).tagline).toBe('Edited by owner');
  });

  it('normalizes phone and applies booking defaults', async () => {
    const settings = await shopSettingsRepo.requireShopSettings();
    expect(settings.phone).toMatch(/^\+1\d{10}$/);
    expect(settings.booking.slotStepMinutes).toBe(15);
    expect(settings.timezone).toBe('America/New_York');
  });

  it('fills hero, visit and launchOffer for a document written before they existed', async () => {
    const col = await collection('shopSettings');
    await col.updateOne(
      { _id: SHOP_SETTINGS_ID },
      { $unset: { hero: '', visit: '', launchOffer: '' } },
    );
    const settings = await shopSettingsRepo.requireShopSettings();
    expect(settings.hero).toEqual(DEFAULT_HERO);
    expect(settings.visit).toEqual(DEFAULT_VISIT);
    expect(settings.launchOffer).toEqual(DEFAULT_LAUNCH_OFFER);
  });

  it('rejects invalid settings', async () => {
    await expect(
      shopSettingsRepo.updateShopSettings(
        { ...shopSettingsSeed, booking: { ...shopSettingsSeed.booking, slotStepMinutes: 10 } },
        NOW,
      ),
    ).rejects.toThrow();
  });
});
