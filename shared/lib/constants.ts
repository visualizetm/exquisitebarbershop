/** IANA timezone of the shop. Every "local" time in the system is in this zone. */
export const SHOP_TIMEZONE = 'America/New_York';

/**
 * Granularity of slot locks. A booking holds one lock document per block of this
 * many minutes. This is a structural constant, not a setting: changing it would
 * misalign existing locks. The customer-facing slot step is configurable but must
 * be a multiple of this value.
 */
export const LOCK_GRANULARITY_MINUTES = 15;

/** Shop settings live in a single document with this fixed id. */
export const SHOP_SETTINGS_ID = 'shop';

/** Reference code alphabet. No 0, O, 1 or I so codes are unambiguous read aloud. */
export const REFERENCE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Maximum length of free text the public can submit. */
export const MAX_NOTE_LENGTH = 500;
