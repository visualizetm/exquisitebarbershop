/**
 * The cancel and change lines customers read, from the shop's cutoff setting, so the booking card,
 * the manage page and the Visit page always say what the booking rules do.
 */

/** "2 hours", "1 hour" or "90 minutes": the shop's cutoff setting in words. */
export function cutoffSpan(cutoffMinutes: number): string {
  const hours = cutoffMinutes / 60;
  return cutoffMinutes % 60 === 0
    ? `${String(hours)} ${hours === 1 ? 'hour' : 'hours'}`
    : `${String(cutoffMinutes)} minutes`;
}

/** "Free to cancel up to 2 hours before." for the booking card. */
export function cancelPolicyLabel(cutoffMinutes: number): string {
  if (cutoffMinutes <= 0) return 'Free to cancel any time before your appointment.';
  return `Free to cancel up to ${cutoffSpan(cutoffMinutes)} before.`;
}

/** "Cancel or move your booking up to 2 hours before." for the Visit page. */
export function changePolicyLabel(cutoffMinutes: number): string {
  if (cutoffMinutes <= 0) return 'Cancel or move your booking any time before it starts.';
  return `Cancel or move your booking up to ${cutoffSpan(cutoffMinutes)} before.`;
}
