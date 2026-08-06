const SITE_LABELS: Record<string, string> = {
  'tiktok.com': 'TikTok',
  'www.tiktok.com': 'TikTok',
  'youtube.com': 'YouTube',
  'www.youtube.com': 'YouTube',
  'm.youtube.com': 'YouTube',
  'github.com': 'GitHub',
  'www.github.com': 'GitHub',
  'gitlab.com': 'GitLab',
  'stackoverflow.com': 'Stack Overflow',
  'www.stackoverflow.com': 'Stack Overflow',
  'facebook.com': 'Facebook',
  'www.facebook.com': 'Facebook',
  'instagram.com': 'Instagram',
  'www.instagram.com': 'Instagram',
  'linkedin.com': 'LinkedIn',
  'www.linkedin.com': 'LinkedIn',
  'twitter.com': 'X',
  'x.com': 'X',
  'reddit.com': 'Reddit',
  'www.reddit.com': 'Reddit',
  'netflix.com': 'Netflix',
  'www.netflix.com': 'Netflix',
};

const TITLE_BRANDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\btiktok\b/i, label: 'TikTok' },
  { pattern: /\byoutube\b/i, label: 'YouTube' },
  { pattern: /\bgithub\b/i, label: 'GitHub' },
  { pattern: /\bgitlab\b/i, label: 'GitLab' },
  { pattern: /\bstackoverflow\b/i, label: 'Stack Overflow' },
  { pattern: /\bfacebook\b/i, label: 'Facebook' },
  { pattern: /\binstagram\b/i, label: 'Instagram' },
  { pattern: /\blinkedin\b/i, label: 'LinkedIn' },
  { pattern: /\bnetflix\b/i, label: 'Netflix' },
  { pattern: /\breddit\b/i, label: 'Reddit' },
  { pattern: /\bphpmyadmin\b/i, label: 'Localhost' },
];

function hostnameFromUrl(url: string): string | null {
  const raw = (url || '').trim();
  if (!raw) return null;
  try {
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    const match = raw.match(/^([a-z0-9][-a-z0-9]*(?:\.[a-z0-9][-a-z0-9]*)+)/i);
    return match ? match[1].toLowerCase() : null;
  }
}

function formatHostnameLabel(host: string): string {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') {
    return 'Localhost';
  }
  if (SITE_LABELS[h]) {
    return SITE_LABELS[h];
  }

  const parts = h.split('.').filter(Boolean);
  if (parts.length >= 2) {
    const name = parts[0];
    const tld = parts[parts.length - 1];
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    if (tld === 'com') return `${cap}.com`;
    if (tld === 'app' || tld === 'io' || tld === 'dev') return `${cap}.${tld}`;
    if (parts.length === 3 && parts[1] === 'vercel') return `${cap}.com`;
  }

  return host;
}

function stripBrowserSuffix(title: string): string {
  return title
    .replace(/\s*[-–—]\s*(Google Chrome|Mozilla Firefox|Microsoft(?:\s*Edge)?)\s*$/i, '')
    .trim();
}

export function getBrowserTabDisplayName(windowTitle: string, url?: string): string {
  const title = (windowTitle || '').trim();
  const urlHost = hostnameFromUrl(url || '');

  if (urlHost) {
    return formatHostnameLabel(urlHost);
  }

  if (!title) {
    return 'Unknown';
  }

  if (/^localhost\b/i.test(title) || /\blocalhost\b/i.test(title) || /\bphpmyadmin\b/i.test(title)) {
    return 'Localhost';
  }

  if (/\s[-–—]\s*YouTube\s*$/i.test(title)) {
    return 'YouTube';
  }

  let cleaned = stripBrowserSuffix(title);
  cleaned = cleaned.replace(/^\(\d+\)\s*/, '').trim();

  if (/^youtube$/i.test(cleaned)) {
    return 'YouTube';
  }

  const domainInTitle = cleaned.match(/^([a-z0-9][-a-z0-9]*(?:\.[a-z0-9][-a-z0-9]*)+)(?:\/[^\s]*)?/i);
  if (domainInTitle) {
    return formatHostnameLabel(domainInTitle[1].toLowerCase());
  }

  for (const { pattern, label } of TITLE_BRANDS) {
    if (pattern.test(cleaned)) {
      return label;
    }
  }

  const beforeDash = cleaned.split(/\s*[-–—]\s+/)[0]?.trim() || cleaned;
  for (const { pattern, label } of TITLE_BRANDS) {
    if (pattern.test(beforeDash)) {
      return label;
    }
  }

  if (/^new tab$/i.test(beforeDash)) {
    return 'New Tab';
  }

  // WAMP/local dev: tab title is often just the PHP filename with no URL captured.
  if (/\.(php|tsx|ts|jsx|js|vue|html|css|json|md|sql)\b/i.test(beforeDash)) {
    return 'Localhost';
  }

  return beforeDash.length > 32 ? `${beforeDash.slice(0, 32)}…` : beforeDash;
}
