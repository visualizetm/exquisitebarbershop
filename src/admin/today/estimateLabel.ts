import type { NowGateView, WaitEstimateView } from '@shared/api/line';
import { shopTime } from '../format';

/** "Free now", "about 2:50 (36 min)" or "Wait time unknown". */
export function estimateLabel(e: WaitEstimateView, who?: string): string {
  const name = who ? `${who} ` : '';
  if (e.kind === 'free') return `${name}free now`.replace(/^\s/, '');
  if (e.kind === 'about') return `${name}about ${shopTime(e.at)} (${String(e.minutes)} min)`;
  return 'Wait time unknown';
}

export function chairEstimateLabel(e: WaitEstimateView): string {
  if (e.kind === 'free') return 'Free now';
  if (e.kind === 'about') return `Free about ${shopTime(e.at)}`;
  return 'Off today';
}

/** A chair's state with the hours rule first: closed, off or done beats any estimate. */
export function chairStateLabel(gate: NowGateView, e: WaitEstimateView): string {
  switch (gate.kind) {
    case 'open':
      return chairEstimateLabel(e);
    case 'closed':
      return gate.text?.replace(/^The shop is closed right now\.\s*/, 'Closed. ') ?? 'Closed';
    case 'off':
      return 'Off today';
    case 'done':
      return 'Done for the day';
    case 'nobody':
      return 'Nobody in';
  }
}
