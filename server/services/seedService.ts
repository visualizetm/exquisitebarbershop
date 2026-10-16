import type { Db } from 'mongodb';
import { ensureIndexes } from '../db/indexes';
import {
  servicesSeed,
  serviceSeedId,
  shopHoursSeed,
  shopSettingsSeed,
  staffSeed,
  staffSeedId,
} from '../../seed/shop';
import { servicesRepo, shopSettingsRepo, staffRepo, weeklyHoursRepo } from '../repos';

export interface SeedSummary {
  settingsCreated: boolean;
  shopHoursCreated: boolean;
  servicesCreated: number;
  staffCreated: number;
  staffHoursCreated: number;
}

/**
 * Loads the placeholder data without ever overwriting an existing record, so it is
 * safe on a database the owner has already edited. Also ensures indexes first so
 * uniqueness holds from the first insert.
 */
export async function runSeed(db: Db, now: Date = new Date()): Promise<SeedSummary> {
  await ensureIndexes(db);
  const summary: SeedSummary = {
    settingsCreated: false,
    shopHoursCreated: false,
    servicesCreated: 0,
    staffCreated: 0,
    staffHoursCreated: 0,
  };

  summary.settingsCreated = (
    await shopSettingsRepo.createShopSettingsIfMissing(shopSettingsSeed, now)
  ).created;

  if (!(await weeklyHoursRepo.getShopHours())) {
    await weeklyHoursRepo.setShopHours(shopHoursSeed, now);
    summary.shopHoursCreated = true;
  }

  for (const service of servicesSeed) {
    const id = serviceSeedId(service.key);
    if (await servicesRepo.findServiceById(id)) continue;
    await servicesRepo.insertService(service.input, now, { id });
    summary.servicesCreated += 1;
  }

  for (const member of staffSeed) {
    const id = staffSeedId(member.key);
    if (!(await staffRepo.findStaffById(id))) {
      await staffRepo.insertStaff(member.input, now, { id });
      summary.staffCreated += 1;
    }
    if (!(await weeklyHoursRepo.getStaffHours(id))) {
      await weeklyHoursRepo.setStaffHours(id, member.hours, now);
      summary.staffHoursCreated += 1;
    }
  }

  return summary;
}
