import { useEffect } from 'react';

const SCRIPT_ID = 'exq-jsonld';

/** Keeps one application/ld+json script in the head in sync with the given data. */
export function useJsonLd(data: Record<string, unknown> | null): void {
  useEffect(() => {
    if (!data) return;
    let script = document.getElementById(SCRIPT_ID);
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.setAttribute('type', 'application/ld+json');
      document.head.appendChild(script);
    }
    // "<" is escaped so the JSON can never end the script element early.
    script.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
    return () => {
      script.remove();
    };
  }, [data]);
}
