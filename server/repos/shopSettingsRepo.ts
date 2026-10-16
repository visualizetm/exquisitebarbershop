import { SHOP_SETTINGS_ID } from '../../shared/lib/constants';
import {
  shopSettingsDocumentSchema,
  shopSettingsInputSchema,
  type ShopSettingsDocument,
  type ShopSettingsInput,
} from '../../shared/schemas/shopSettings';
import { collection } from '../db/collections';
import { AppError } from '../lib/errors';
import { sessionOf, type RepoOptions } from './types';

export async function getShopSettings(options?: RepoOptions): Promise<ShopSettingsDocument | null> {
  const col = await collection('shopSettings');
  return col.findOne({ _id: SHOP_SETTINGS_ID }, sessionOf(options));
}

/** Like getShopSettings but fails loudly: the app cannot run without settings. */
export async function requireShopSettings(options?: RepoOptions): Promise<ShopSettingsDocument> {
  const settings = await getShopSettings(options);
  if (!settings) {
    throw new AppError('INTERNAL_ERROR', 'Shop settings are missing. Run the seed script.');
  }
  return settings;
}

/** Creates settings only when none exist. Never overwrites owner edits. */
export async function createShopSettingsIfMissing(
  input: ShopSettingsInput,
  now: Date,
  options?: RepoOptions,
): Promise<{ created: boolean }> {
  const parsed = shopSettingsInputSchema.parse(input);
  const doc = shopSettingsDocumentSchema.parse({
    _id: SHOP_SETTINGS_ID,
    ...parsed,
    createdAt: now,
    updatedAt: now,
  });
  const col = await collection('shopSettings');
  const result = await col.updateOne(
    { _id: SHOP_SETTINGS_ID },
    { $setOnInsert: doc },
    { upsert: true, ...sessionOf(options) },
  );
  return { created: result.upsertedCount === 1 };
}

export async function updateShopSettings(
  input: ShopSettingsInput,
  now: Date,
  options?: RepoOptions,
): Promise<ShopSettingsDocument> {
  const parsed = shopSettingsInputSchema.parse(input);
  const col = await collection('shopSettings');
  const updated = await col.findOneAndUpdate(
    { _id: SHOP_SETTINGS_ID },
    { $set: { ...parsed, updatedAt: now } },
    { returnDocument: 'after', ...sessionOf(options) },
  );
  if (!updated) throw new AppError('NOT_FOUND', 'Shop settings were not found');
  return updated;
}
