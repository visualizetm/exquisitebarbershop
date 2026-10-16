import { useEffect } from 'react';

const SITE_NAME = 'Exquisite Barber & Beauty Lounge';

/** Basic SEO: a distinct title per page. */
export function usePageTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
    return () => {
      document.title = SITE_NAME;
    };
  }, [title]);
}
