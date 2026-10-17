import { useContext, useEffect } from 'react';
import { useLocation } from 'react-router';
import { ShopContext } from '@/app/shopContext';
import { SITE_DESCRIPTION, SITE_NAME } from './seo';

export interface PageMeta {
  /** Page title without the site name; null on the home page. */
  title: string | null;
  /** Meta description; the site default when missing. */
  description?: string | undefined;
  /** Keeps private pages (admin, manage) out of search results. */
  noindex?: boolean | undefined;
}

function setMeta(attr: 'name' | 'property', key: string, content: string | null): void {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (content === null) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function setCanonical(href: string): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

/** Basic SEO per route: title, description, canonical, Open Graph and robots, from shop data when loaded. */
export function usePageMeta({ title, description, noindex = false }: PageMeta): void {
  const { pathname } = useLocation();
  const shop = useContext(ShopContext);
  const siteName = shop?.status === 'ready' ? shop.data.name : SITE_NAME;
  const text = description ?? SITE_DESCRIPTION;

  useEffect(() => {
    const full = title ? `${title} | ${siteName}` : siteName;
    const url = `${window.location.origin}${pathname}`;
    document.title = full;
    setMeta('name', 'description', text);
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : null);
    setMeta('property', 'og:title', full);
    setMeta('property', 'og:description', text);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:site_name', siteName);
    setCanonical(url);
    return () => {
      document.title = siteName;
    };
  }, [title, text, noindex, siteName, pathname]);
}

/** The admin and other private screens: a distinct title, never indexed. */
export function usePageTitle(title: string | null): void {
  usePageMeta({ title, noindex: true });
}
