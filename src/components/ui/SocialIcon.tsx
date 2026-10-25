/**
 * The one exception to "icons only from Untitled UI": that set has no brand marks, so these three
 * are drawn here as simple monochrome line shapes in currentColor. They name a network, are
 * always inside a link that carries the words (aria-label), and are never decoration.
 */
export type Network = 'instagram' | 'tiktok' | 'facebook';

export function SocialIcon({ network }: { network: Network }) {
  return (
    <svg
      className="exq-social-icon"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {network === 'instagram' ? (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
        </>
      ) : network === 'tiktok' ? (
        <path d="M14 3.5v11.2a3.7 3.7 0 1 1-3.7-3.7M14 3.5c.3 2.6 1.9 4.4 4.5 4.7" />
      ) : (
        <path d="M13.5 20.5v-7.2h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.3 0-3.8 1.4-3.8 3.9v2.1H8v3h2.6v7.2" />
      )}
    </svg>
  );
}
