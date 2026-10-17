import type { ClientSession } from 'mongodb';
import { slotLocksRepo, timeBlocksRepo } from '../repos';

/**
 * After a booking's locks are released, any blocked period ("block" time block)
 * that covers those slots takes them back, so an online booking can never land on
 * blocked time even where the block once shared slots with a kept booking.
 */
export async function relockBlocks(
  staffId: string,
  range: { start: Date; end: Date },
  now: Date,
  session: ClientSession,
): Promise<void> {
  const blocks = await timeBlocksRepo.listTimeBlocksForStaff(staffId, range, { session });
  for (const block of blocks) {
    if (block.kind !== 'block') continue;
    await slotLocksRepo.acquireUnheldSlotLocks(
      staffId,
      { start: block.startAt, end: block.endAt },
      { holderType: 'timeBlock', holderId: block._id },
      now,
      { session },
    );
  }
}
