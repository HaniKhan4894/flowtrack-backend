const SITE_LABELS = {
  'tiktok.com': 'TikTok',
  'www.tiktok.com': 'TikTok',
  'youtube.com': 'YouTube',
  'www.youtube.com': 'YouTube',
  'm.youtube.com': 'YouTube',
  'github.com': 'GitHub',
  'www.github.com': 'GitHub',
  'netflix.com': 'Netflix',
  'www.netflix.com': 'Netflix',
  'facebook.com': 'Facebook',
  'instagram.com': 'Instagram',
  'reddit.com': 'Reddit',
  'x.com': 'X',
  'twitter.com': 'X',
};

const TITLE_BRANDS = [
  { pattern: /\btiktok\b/i, label: 'TikTok' },
  { pattern: /\byoutube\b/i, label: 'YouTube' },
  { pattern: /\bgithub\b/i, label: 'GitHub' },
  { pattern: /\bnetflix\b/i, label: 'Netflix' },
  { pattern: /\bfacebook\b/i, label: 'Facebook' },
  { pattern: /\binstagram\b/i, label: 'Instagram' },
  { pattern: /\breddit\b/i, label: 'Reddit' },
];

const BROWSER_RE = /chrome|firefox|edge|msedge|brave|opera|safari|google chrome/i;

function hostnameFromUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    const match = raw.match(/^([a-z0-9][-a-z0-9]*(?:\.[a-z0-9][-a-z0-9]*)+)/i);
    return match ? match[1].toLowerCase() : null;
  }
}

function formatHostnameLabel(host) {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') return 'Localhost';
  if (SITE_LABELS[h]) return SITE_LABELS[h];
  const parts = h.split('.').filter(Boolean);
  if (parts.length >= 2) {
    const name = parts[0];
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    return `${cap}.com`;
  }
  return host;
}

function stripBrowserSuffix(title) {
  return String(title || '')
    .replace(/\s*[-–—]\s*(Google Chrome|Mozilla Firefox|Microsoft(?:\s*Edge)?)\s*$/i, '')
    .trim();
}

function resolveBrowserTabDisplayName(windowTitle, url = '') {
  const title = String(windowTitle || '').trim();
  const urlHost = hostnameFromUrl(url);
  if (urlHost) return formatHostnameLabel(urlHost);

  if (!title) return 'Unknown';
  if (/^localhost\b/i.test(title) || /\blocalhost\b/i.test(title)) return 'Localhost';
  if (/\s[-–—]\s*YouTube\s*$/i.test(title)) return 'YouTube';

  let cleaned = stripBrowserSuffix(title).replace(/^\(\d+\)\s*/, '').trim();
  if (/^youtube$/i.test(cleaned)) return 'YouTube';

  const domainInTitle = cleaned.match(/^([a-z0-9][-a-z0-9]*(?:\.[a-z0-9][-a-z0-9]*)+)(?:\/[^\s]*)?/i);
  if (domainInTitle) return formatHostnameLabel(domainInTitle[1].toLowerCase());

  for (const { pattern, label } of TITLE_BRANDS) {
    if (pattern.test(cleaned)) return label;
  }

  const beforeDash = cleaned.split(/\s*[-–—]\s+/)[0]?.trim() || cleaned;
  for (const { pattern, label } of TITLE_BRANDS) {
    if (pattern.test(beforeDash)) return label;
  }

  if (/^new tab$/i.test(beforeDash)) return 'New Tab';

  // WAMP/local dev: tab title is often just the PHP filename with no URL captured.
  if (/\.(php|tsx|ts|jsx|js|vue|html|css|json|md|sql)\b/i.test(beforeDash)) return 'Localhost';

  return beforeDash.length > 32 ? `${beforeDash.slice(0, 32)}…` : beforeDash;
}

function isBrowserApp(appName, windowTitle = '') {
  return BROWSER_RE.test(`${appName} ${windowTitle}`);
}

function sessionAppLabel(seg) {
    if (isBrowserApp(seg.app_name, seg.window_title)) {
        return resolveBrowserTabDisplayName(seg.window_title, seg.url);
    }
    if (/cursor/i.test(seg.app_name || '')) {
        const title = String(seg.window_title || '').trim();
        if (title) {
            const first = title.split(/\s*[-–—]\s+/)[0]?.trim();
            if (first) return first.length > 32 ? `${first.slice(0, 32)}…` : first;
        }
    }
    return seg.app_name || 'Unknown';
}

module.exports = {
  resolveBrowserTabDisplayName,
  isBrowserApp,
  sessionAppLabel,
};
