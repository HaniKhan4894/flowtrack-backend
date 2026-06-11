export const SITE_NAME = 'FlowTrack';

export const SITE_TAGLINE = 'Team time tracking, screenshot monitoring & productivity analytics';

export const SITE_TAB_TITLE = 'FlowTrack | Team Time Tracking & Productivity';

export const DEFAULT_TITLE =
  'FlowTrack — Team Time Tracking, Screenshot Monitoring & Productivity Analytics';

export const DEFAULT_DESCRIPTION =
  'FlowTrack is an all-in-one team productivity platform with real-time time tracking, automatic screenshot capture, activity analytics, invoicing, and desktop apps for Windows and macOS. Built for remote and hybrid teams.';

export const DEFAULT_KEYWORDS = [
  'time tracking software',
  'employee time tracking',
  'team productivity software',
  'screenshot monitoring',
  'remote work tracking',
  'project time tracker',
  'workforce analytics',
  'billing and invoicing software',
  'desktop time tracker',
  'FlowTrack',
].join(', ');

export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://flowtrackhani.vercel.app').replace(/\/$/, '');

export const TWITTER_HANDLE = '@flowtrack';

export const SUPPORT_EMAIL = 'support@flowtrack.app';

export const OG_IMAGE_PATH = '/og-image.png';

export const OG_IMAGE_URL = `${SITE_URL}${OG_IMAGE_PATH}`;
