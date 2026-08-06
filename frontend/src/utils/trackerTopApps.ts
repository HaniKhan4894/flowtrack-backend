import { getAppDisplayName } from './appIcons';

export type TrackerTopApp = {
  app_name: string;
  duration_seconds?: number;
  percentage?: number;
};

export type BrowserTabEntry = {
  display_name?: string;
  duration_seconds?: number;
};

export type CursorTabEntry = {
  label: string;
  duration_seconds: number;
};

export type AppBreakdownItem = {
  label: string;
  duration_seconds: number;
  percentage: number;
};

export type CollapsedTopApp = TrackerTopApp & {
  breakdown?: AppBreakdownItem[];
};

const BROWSER_RE = /chrome|firefox|edge|msedge|brave|opera|safari|google chrome/i;
const CURSOR_RE = /cursor/i;
const BROWSER_SITE_RE = /youtube|tiktok|netflix|instagram|facebook|reddit|github|gitlab|stackoverflow|twitter|^x$/i;
const CURSOR_FILE_RE = /\.(php|tsx|ts|jsx|js|vue|md|json|css|html)\b/i;

export function isBrowserApp(appName: string): boolean {
  return BROWSER_RE.test(appName || '');
}

export function isCursorApp(appName: string): boolean {
  return CURSOR_RE.test(appName || '');
}

function isLikelyBrowserSite(name: string): boolean {
  if (BROWSER_SITE_RE.test(name)) return true;
  return /^[a-z0-9][-a-z0-9]*\.(com|io|net|org|dev|app)$/i.test(name);
}

function isLikelyCursorFile(name: string): boolean {
  if (isCursorApp(name)) return false;
  return CURSOR_FILE_RE.test(name) || /pull request/i.test(name);
}

/** Largest-remainder method — percentages always sum to 100. */
export function distributePercentages(
  items: { id: string; seconds: number }[],
): Map<string, number> {
  const total = items.reduce((s, i) => s + i.seconds, 0);
  if (total <= 0) return new Map(items.map((i) => [i.id, 0]));

  const floors = items.map((i) => {
    const exact = (i.seconds / total) * 100;
    return { id: i.id, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });

  let used = floors.reduce((s, f) => s + f.floor, 0);
  const result = new Map(floors.map((f) => [f.id, f.floor]));
  const byRemainder = [...floors].sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; used < 100 && i < byRemainder.length; i++) {
    result.set(byRemainder[i].id, (result.get(byRemainder[i].id) ?? 0) + 1);
    used++;
  }
  return result;
}

export function extractCursorTabLabel(windowTitle: string): string {
  const title = (windowTitle || '').trim();
  if (!title) return 'Untitled';
  const first = title.split(/\s*[-–—]\s+/)[0]?.trim() || title;
  return first.length > 28 ? `${first.slice(0, 28)}…` : first;
}

export function buildCursorTabsFromLogs(
  logs: Array<{ app_name?: string; window_title?: string; duration_seconds?: number }>,
): CursorTabEntry[] {
  const map = new Map<string, number>();
  for (const log of logs) {
    if (!isCursorApp(log.app_name || '')) continue;
    const label = extractCursorTabLabel(log.window_title || '');
    if (!label) continue;
    const secs = Number(log.duration_seconds) || 0;
    if (secs <= 0) continue;
    map.set(label, (map.get(label) ?? 0) + secs);
  }
  return Array.from(map.entries())
    .map(([label, duration_seconds]) => ({ label, duration_seconds }))
    .sort((a, b) => b.duration_seconds - a.duration_seconds);
}

function isLikelyLocalDevPage(name: string): boolean {
  return /\.(php|tsx|ts|jsx|js|vue|html|css|json|md|sql)\b/i.test(name);
}

function normalizeBrowserTabLabel(name: string): string {
  const trimmed = name.trim();
  if (isLikelyLocalDevPage(trimmed)) return 'Localhost';
  return trimmed;
}

function isBrowserChild(name: string, browserTabNames: Set<string>): boolean {
  if (browserTabNames.has(name)) return true;
  if (isLikelyLocalDevPage(name)) return true;
  return isLikelyBrowserSite(name);
}

function isCursorChild(name: string, cursorTabNames: Set<string>): boolean {
  if (cursorTabNames.has(name)) return true;
  return isLikelyCursorFile(name);
}

function buildBreakdown(map: Map<string, number>): AppBreakdownItem[] {
  const items = Array.from(map.entries()).filter(([, secs]) => secs > 0);
  if (items.length === 0) return [];

  const pcts = distributePercentages(items.map(([label, seconds]) => ({ id: label, seconds })));
  return items
    .map(([label, duration_seconds]) => ({
      label,
      duration_seconds,
      percentage: pcts.get(label) ?? 0,
    }))
    .sort((a, b) => b.duration_seconds - a.duration_seconds)
    .slice(0, 8);
}

function resolveBrowserParentName(apps: TrackerTopApp[]): string {
  const browser = apps.find((a) => isBrowserApp(a.app_name));
  return browser ? getAppDisplayName(browser.app_name) : 'Google Chrome';
}

/**
 * Top N parent apps with Chrome/Cursor grouped; breakdown on click.
 * Parent durations come from API app totals (+ unsynced live session), never inflated child sums.
 */
export function buildCollapsedTopApps(
  apps: TrackerTopApp[],
  browserTabs: BrowserTabEntry[],
  cursorTabs: CursorTabEntry[],
  liveSessionApps?: TrackerTopApp[],
  limit = 5,
): CollapsedTopApp[] {
  let browserAppTotal = 0;
  let cursorAppTotal = 0;
  const standalone = new Map<string, number>();

  for (const app of apps) {
    const secs = app.duration_seconds ?? 0;
    if (secs <= 0) continue;
    if (isBrowserApp(app.app_name)) {
      browserAppTotal += secs;
    } else if (isCursorApp(app.app_name)) {
      cursorAppTotal += secs;
    } else {
      standalone.set(app.app_name, (standalone.get(app.app_name) ?? 0) + secs);
    }
  }

  const browserTabNames = new Set(
    browserTabs
      .map((t) => normalizeBrowserTabLabel(t.display_name?.trim() || ''))
      .filter(Boolean),
  );
  const cursorTabNames = new Set(cursorTabs.map((t) => t.label));

  const browserChildren = new Map<string, number>();
  const cursorChildren = new Map<string, number>();

  for (const tab of browserTabs) {
    const name = normalizeBrowserTabLabel(tab.display_name?.trim() || '');
    const secs = tab.duration_seconds ?? 0;
    if (!name || name === 'Unknown' || name === 'New Tab' || secs <= 0) continue;
    browserChildren.set(name, (browserChildren.get(name) ?? 0) + secs);
  }

  for (const tab of cursorTabs) {
    if (tab.duration_seconds > 0) {
      cursorChildren.set(tab.label, (cursorChildren.get(tab.label) ?? 0) + tab.duration_seconds);
    }
  }

  for (const app of liveSessionApps ?? []) {
    const name = app.app_name?.trim();
    const secs = app.duration_seconds ?? 0;
    if (!name || secs <= 0) continue;

    if (isBrowserChild(name, browserTabNames)) {
      const label = normalizeBrowserTabLabel(name);
      browserChildren.set(label, (browserChildren.get(label) ?? 0) + secs);
      browserAppTotal += secs;
    } else if (isCursorChild(name, cursorTabNames)) {
      cursorChildren.set(name, (cursorChildren.get(name) ?? 0) + secs);
      cursorAppTotal += secs;
    } else if (!isBrowserApp(name) && !isCursorApp(name)) {
      standalone.set(name, (standalone.get(name) ?? 0) + secs);
    }
  }

  const entries: CollapsedTopApp[] = [];

  if (browserAppTotal > 0) {
    const childSum = Array.from(browserChildren.values()).reduce((s, v) => s + v, 0);
    if (childSum > 0 && childSum < browserAppTotal) {
      browserChildren.set('Other tabs', browserAppTotal - childSum);
    } else if (childSum <= 0) {
      browserChildren.set('Browser', browserAppTotal);
    }
    entries.push({
      app_name: resolveBrowserParentName(apps),
      duration_seconds: browserAppTotal,
      breakdown: browserChildren.size > 0 ? buildBreakdown(browserChildren) : undefined,
    });
  }

  if (cursorAppTotal > 0) {
    const childSum = Array.from(cursorChildren.values()).reduce((s, v) => s + v, 0);
    if (childSum > 0 && childSum < cursorAppTotal) {
      cursorChildren.set('Other files', cursorAppTotal - childSum);
    } else if (childSum <= 0) {
      cursorChildren.set('Cursor', cursorAppTotal);
    }
    entries.push({
      app_name: 'Cursor',
      duration_seconds: cursorAppTotal,
      breakdown: cursorChildren.size > 0 ? buildBreakdown(cursorChildren) : undefined,
    });
  }

  for (const [name, duration_seconds] of standalone) {
    entries.push({ app_name: name, duration_seconds });
  }

  const deduped = new Map<string, CollapsedTopApp>();
  for (const entry of entries) {
    const prev = deduped.get(entry.app_name);
    if (!prev || (entry.duration_seconds ?? 0) > (prev.duration_seconds ?? 0)) {
      deduped.set(entry.app_name, entry);
    }
  }

  const sorted = Array.from(deduped.values()).sort(
    (a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0),
  );

  const allPcts = distributePercentages(
    sorted.map((e) => ({ id: e.app_name, seconds: e.duration_seconds ?? 0 })),
  );

  return sorted.slice(0, limit).map((entry) => ({
    ...entry,
    percentage: allPcts.get(entry.app_name) ?? 0,
  }));
}
