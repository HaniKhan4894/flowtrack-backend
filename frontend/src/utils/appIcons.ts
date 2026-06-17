/** @deprecated FlowTrack is tracked like any other app; only empty names are skipped. */
export function isInternalTrackerApp(appName: string): boolean {
  return !(appName || '').trim();
}

type IconSource =
  | { kind: 'simple'; slug: string; color: string }
  | { kind: 'favicon'; domain: string }
  | { kind: 'url'; url: string };

type AppIconEntry = { match: RegExp; sources: IconSource[] };

const DISPLAY_NAME_MAP: { match: RegExp; name: string }[] = [
  { match: /^electron$/i, name: 'FlowTrack Desktop' },
  { match: /flowtrack/i, name: 'FlowTrack Desktop' },
  { match: /windows explorer|explorer\.exe|file explorer|^explorer$/i, name: 'File Explorer' },
  { match: /windows shell|shellexperiencehost|searchhost|startmenuexperiencehost|applicationframehost/i, name: 'Windows Shell' },
  { match: /windows terminal|^wt\.exe$/i, name: 'Windows Terminal' },
  { match: /cursor/i, name: 'Cursor' },
];

const APP_ICON_MAP: AppIconEntry[] = [
  { match: /flowtrack|electron/i, sources: [{ kind: 'url', url: '/favicon.png' }] },
  { match: /chrome/i, sources: [{ kind: 'simple', slug: 'googlechrome', color: '4285F4' }] },
  { match: /firefox/i, sources: [{ kind: 'simple', slug: 'firefox', color: 'FF7139' }] },
  { match: /edge|msedge/i, sources: [{ kind: 'simple', slug: 'microsoftedge', color: '0078D4' }] },
  { match: /brave/i, sources: [{ kind: 'simple', slug: 'brave', color: 'FB542B' }] },
  { match: /cursor/i, sources: [{ kind: 'favicon', domain: 'cursor.com' }, { kind: 'simple', slug: 'visualstudiocode', color: '007ACC' }] },
  { match: /code|vscode|visual studio code/i, sources: [{ kind: 'simple', slug: 'visualstudiocode', color: '007ACC' }] },
  { match: /whatsapp/i, sources: [{ kind: 'simple', slug: 'whatsapp', color: '25D366' }] },
  { match: /youtube/i, sources: [{ kind: 'simple', slug: 'youtube', color: 'FF0000' }] },
  { match: /tiktok/i, sources: [{ kind: 'simple', slug: 'tiktok', color: '000000' }] },
  { match: /instagram/i, sources: [{ kind: 'simple', slug: 'instagram', color: 'E4405F' }] },
  { match: /facebook|messenger/i, sources: [{ kind: 'simple', slug: 'facebook', color: '0866FF' }] },
  { match: /discord/i, sources: [{ kind: 'simple', slug: 'discord', color: '5865F2' }] },
  { match: /slack/i, sources: [{ kind: 'simple', slug: 'slack', color: '4A154B' }] },
  { match: /spotify/i, sources: [{ kind: 'simple', slug: 'spotify', color: '1DB954' }] },
  { match: /netflix/i, sources: [{ kind: 'simple', slug: 'netflix', color: 'E50914' }] },
  { match: /telegram/i, sources: [{ kind: 'simple', slug: 'telegram', color: '26A5E4' }] },
  { match: /twitter|^x$/i, sources: [{ kind: 'simple', slug: 'x', color: 'FFFFFF' }] },
  { match: /reddit/i, sources: [{ kind: 'simple', slug: 'reddit', color: 'FF4500' }] },
  { match: /linkedin/i, sources: [{ kind: 'simple', slug: 'linkedin', color: '0A66C2' }] },
  { match: /zoom/i, sources: [{ kind: 'simple', slug: 'zoom', color: '0B5CFF' }] },
  { match: /teams/i, sources: [{ kind: 'simple', slug: 'microsoftteams', color: '6264A7' }] },
  { match: /outlook/i, sources: [{ kind: 'simple', slug: 'microsoftoutlook', color: '0078D4' }] },
  { match: /word/i, sources: [{ kind: 'simple', slug: 'microsoftword', color: '2B579A' }] },
  { match: /excel/i, sources: [{ kind: 'simple', slug: 'microsoftexcel', color: '217346' }] },
  { match: /powerpoint|ppt/i, sources: [{ kind: 'simple', slug: 'microsoftpowerpoint', color: 'B7472A' }] },
  { match: /figma/i, sources: [{ kind: 'simple', slug: 'figma', color: 'F24E1E' }] },
  { match: /notion/i, sources: [{ kind: 'simple', slug: 'notion', color: 'FFFFFF' }] },
  { match: /phpstorm|intellij|idea/i, sources: [{ kind: 'simple', slug: 'intellijidea', color: '000000' }] },
  { match: /postman/i, sources: [{ kind: 'simple', slug: 'postman', color: 'FF6C37' }] },
  { match: /docker/i, sources: [{ kind: 'simple', slug: 'docker', color: '2496ED' }] },
  { match: /git/i, sources: [{ kind: 'simple', slug: 'git', color: 'F05032' }] },
  { match: /terminal|powershell|cmd|windows terminal|^wt\.exe$/i, sources: [{ kind: 'simple', slug: 'windowsterminal', color: '4D4D4D' }] },
  { match: /windows explorer|explorer\.exe|file explorer|^explorer$/i, sources: [{ kind: 'simple', slug: 'microsoftwindows', color: '0078D4' }] },
  { match: /windows shell|shellexperiencehost|searchhost|startmenuexperiencehost|applicationframehost/i, sources: [{ kind: 'simple', slug: 'microsoftwindows', color: '0078D4' }] },
  { match: /mysql|workbench/i, sources: [{ kind: 'simple', slug: 'mysql', color: '4479A1' }] },
  { match: /wamp|apache|httpd/i, sources: [{ kind: 'favicon', domain: 'wampserver.com' }] },
  { match: /notepad\+\+|notepad/i, sources: [{ kind: 'favicon', domain: 'notepad-plus-plus.org' }] },
  { match: /sublime/i, sources: [{ kind: 'favicon', domain: 'sublimetext.com' }] },
  { match: /obsidian/i, sources: [{ kind: 'simple', slug: 'obsidian', color: '7C3AED' }] },
  { match: /linear/i, sources: [{ kind: 'simple', slug: 'linear', color: '5E6AD2' }] },
  { match: /jira|atlassian/i, sources: [{ kind: 'simple', slug: 'jira', color: '0052CC' }] },
  { match: /github/i, sources: [{ kind: 'simple', slug: 'github', color: '181717' }] },
  { match: /gitlab/i, sources: [{ kind: 'simple', slug: 'gitlab', color: 'FC6D26' }] },
  { match: /npm|node/i, sources: [{ kind: 'simple', slug: 'nodedotjs', color: '339933' }] },
];

function resolveIconSource(source: IconSource): string {
  if (source.kind === 'simple') {
    return `https://cdn.simpleicons.org/${source.slug}/${source.color}`;
  }
  if (source.kind === 'favicon') {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(source.domain)}&sz=64`;
  }
  return source.url;
}

export function getAppIconUrls(appName: string): string[] {
  const name = appName || '';
  for (const entry of APP_ICON_MAP) {
    if (entry.match.test(name)) {
      return entry.sources.map(resolveIconSource);
    }
  }
  return [];
}

/** @deprecated Use getAppIconUrls */
export function getAppIconUrl(appName: string): string | null {
  const urls = getAppIconUrls(appName);
  return urls[0] ?? null;
}

export function getAppDisplayName(appName: string): string {
  const raw = (appName || 'Unknown').replace(/\.exe$/i, '').trim();
  for (const entry of DISPLAY_NAME_MAP) {
    if (entry.match.test(raw)) {
      return entry.name;
    }
  }
  return raw;
}
