/** Apps/processes that belong to FlowTrack itself — excluded from top-apps stats. */
export function isInternalTrackerApp(appName: string): boolean {
  const name = (appName || '').toLowerCase().trim();
  return (
    name.includes('flowtrack') ||
    name === 'electron' ||
    name.includes('flowtrack-desktop')
  );
}

type AppIconEntry = { match: RegExp; slug: string; color: string };

const APP_ICON_MAP: AppIconEntry[] = [
  { match: /chrome/i, slug: 'googlechrome', color: '4285F4' },
  { match: /firefox/i, slug: 'firefox', color: 'FF7139' },
  { match: /edge/i, slug: 'microsoftedge', color: '0078D4' },
  { match: /brave/i, slug: 'brave', color: 'FB542B' },
  { match: /cursor/i, slug: 'visualstudiocode', color: '007ACC' },
  { match: /code|vscode|visual studio code/i, slug: 'visualstudiocode', color: '007ACC' },
  { match: /whatsapp/i, slug: 'whatsapp', color: '25D366' },
  { match: /youtube/i, slug: 'youtube', color: 'FF0000' },
  { match: /tiktok/i, slug: 'tiktok', color: '000000' },
  { match: /instagram/i, slug: 'instagram', color: 'E4405F' },
  { match: /facebook|messenger/i, slug: 'facebook', color: '0866FF' },
  { match: /discord/i, slug: 'discord', color: '5865F2' },
  { match: /slack/i, slug: 'slack', color: '4A154B' },
  { match: /spotify/i, slug: 'spotify', color: '1DB954' },
  { match: /netflix/i, slug: 'netflix', color: 'E50914' },
  { match: /telegram/i, slug: 'telegram', color: '26A5E4' },
  { match: /twitter|^x$/i, slug: 'x', color: 'FFFFFF' },
  { match: /reddit/i, slug: 'reddit', color: 'FF4500' },
  { match: /linkedin/i, slug: 'linkedin', color: '0A66C2' },
  { match: /zoom/i, slug: 'zoom', color: '0B5CFF' },
  { match: /teams/i, slug: 'microsoftteams', color: '6264A7' },
  { match: /outlook/i, slug: 'microsoftoutlook', color: '0078D4' },
  { match: /word/i, slug: 'microsoftword', color: '2B579A' },
  { match: /excel/i, slug: 'microsoftexcel', color: '217346' },
  { match: /powerpoint|ppt/i, slug: 'microsoftpowerpoint', color: 'B7472A' },
  { match: /figma/i, slug: 'figma', color: 'F24E1E' },
  { match: /notion/i, slug: 'notion', color: 'FFFFFF' },
  { match: /phpstorm|intellij|idea/i, slug: 'intellijidea', color: '000000' },
  { match: /postman/i, slug: 'postman', color: 'FF6C37' },
  { match: /docker/i, slug: 'docker', color: '2496ED' },
  { match: /git/i, slug: 'git', color: 'F05032' },
  { match: /terminal|powershell|cmd|windows terminal/i, slug: 'windowsterminal', color: '4D4D4D' },
];

export function getAppIconUrl(appName: string): string | null {
  const name = appName || '';
  for (const entry of APP_ICON_MAP) {
    if (entry.match.test(name)) {
      return `https://cdn.simpleicons.org/${entry.slug}/${entry.color}`;
    }
  }
  return null;
}

export function getAppDisplayName(appName: string): string {
  return (appName || 'Unknown').replace(/\.exe$/i, '').trim();
}
