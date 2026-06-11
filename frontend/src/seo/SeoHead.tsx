import { useEffect } from 'react';

export type SeoConfig = {
  title?: string;
  ogTitle?: string;
  description?: string;
  keywords?: string;
  canonicalPath?: string;
  ogType?: 'website' | 'article' | 'product';
  ogImage?: string;
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

const MANAGED_SELECTOR = 'data-seo-managed';

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  if (!content) return;

  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"][${MANAGED_SELECTOR}]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    el.setAttribute(MANAGED_SELECTOR, 'true');
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string) {
  if (!href) return;

  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"][${MANAGED_SELECTOR}]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    el.setAttribute(MANAGED_SELECTOR, 'true');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function upsertJsonLd(id: string, data: Record<string, unknown> | Record<string, unknown>[]) {
  const existing = document.getElementById(id);
  if (existing) existing.remove();

  const script = document.createElement('script');
  script.id = id;
  script.type = 'application/ld+json';
  script.setAttribute(MANAGED_SELECTOR, 'true');
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

export function useSeo({
  title,
  ogTitle,
  description,
  keywords,
  canonicalPath = '/',
  ogType = 'website',
  ogImage,
  noindex = false,
  jsonLd,
}: SeoConfig) {
  useEffect(() => {
    const siteUrl = (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, '');
    const canonicalUrl = `${siteUrl}${canonicalPath === '/' ? '' : canonicalPath}`;
    const imageUrl = ogImage || `${siteUrl}/og-image.png`;

    const socialTitle = ogTitle || title || '';

    if (title) document.title = title;

    upsertMeta('name', 'description', description || '');
    if (keywords) upsertMeta('name', 'keywords', keywords);
    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    upsertMeta('name', 'googlebot', noindex ? 'noindex, nofollow' : 'index, follow');

    upsertLink('canonical', canonicalUrl);

    upsertMeta('property', 'og:title', socialTitle);
    upsertMeta('property', 'og:description', description || '');
    upsertMeta('property', 'og:type', ogType);
    upsertMeta('property', 'og:url', canonicalUrl);
    upsertMeta('property', 'og:image', imageUrl);
    upsertMeta('property', 'og:image:alt', 'FlowTrack — team time tracking and productivity platform');
    upsertMeta('property', 'og:site_name', 'FlowTrack');
    upsertMeta('property', 'og:locale', 'en_US');

    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', socialTitle);
    upsertMeta('name', 'twitter:description', description || '');
    upsertMeta('name', 'twitter:image', imageUrl);
    upsertMeta('name', 'twitter:image:alt', 'FlowTrack — team time tracking and productivity platform');

    if (jsonLd) {
      upsertJsonLd('flowtrack-jsonld', jsonLd);
    }

    return () => {
      document.querySelectorAll(`[${MANAGED_SELECTOR}]`).forEach((node) => node.remove());
    };
  }, [title, ogTitle, description, keywords, canonicalPath, ogType, ogImage, noindex, jsonLd]);
}

type SeoHeadProps = SeoConfig;

const SeoHead = (props: SeoHeadProps) => {
  useSeo(props);
  return null;
};

export default SeoHead;
