import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  OG_IMAGE_URL,
  SITE_NAME,
  SITE_URL,
  SUPPORT_EMAIL,
} from './site';

type FaqItem = {
  question: string;
  answer: string;
};

export const landingFaq: FaqItem[] = [
  {
    question: 'What is FlowTrack?',
    answer:
      'FlowTrack is a team productivity platform that combines time tracking, screenshot monitoring, activity analytics, project management, and client billing in one unified web and desktop experience.',
  },
  {
    question: 'Is FlowTrack good for remote teams?',
    answer:
      'Yes. FlowTrack is built for remote and hybrid teams that need transparent work visibility, real-time activity sync, screenshot evidence, and manager-friendly analytics without complex setup.',
  },
  {
    question: 'Does FlowTrack have a desktop app?',
    answer:
      'Yes. FlowTrack offers native desktop apps for Windows and macOS with screenshot capture, system tray timer controls, and automatic activity sync to your web dashboard.',
  },
  {
    question: 'How much does FlowTrack cost?',
    answer:
      'FlowTrack offers a free plan for solo users, Starter at $12/month, Professional at $10 plus $5 per user, and custom Enterprise pricing for larger organizations.',
  },
  {
    question: 'Can FlowTrack generate invoices from tracked time?',
    answer:
      'Yes. FlowTrack turns tracked hours into professional invoices and supports subscription-style billing workflows for agencies and service teams.',
  },
  {
    question: 'How does FlowTrack track apps and browser tabs?',
    answer:
      'The desktop app tracks foreground applications and browser tabs in real time. Tabs appear as clean site names like TikTok or GitHub, categorized with default and custom productivity rules.',
  },
  {
    question: 'What screenshot intervals does FlowTrack support?',
    answer:
      'Screenshot capture frequency depends on your plan tier. The gallery uses fast thumbnails; full resolution opens on click.',
  },
  {
    question: 'Does FlowTrack support payroll and leave management?',
    answer:
      'Yes. Professional and Enterprise plans include timesheets, leave types (annual, casual, sick), payroll runs, and team analytics for managers.',
  },
  {
    question: 'What happens when I am idle while the timer is running?',
    answer:
      'When the system detects extended idle time, FlowTrack auto-pauses the timer and notifies you. When you return, the timer resumes automatically and idle time is recorded as unproductive.',
  },
];

export function buildLandingJsonLd({
  desktopWinUrl,
  desktopMacUrl,
}: {
  desktopWinUrl?: string;
  desktopMacUrl?: string;
}) {
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: OG_IMAGE_URL,
    email: SUPPORT_EMAIL,
    description: DEFAULT_DESCRIPTION,
    sameAs: [],
  };

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
    publisher: { '@type': 'Organization', name: SITE_NAME },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  const softwareApp = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Windows, macOS, Web',
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    image: OG_IMAGE_URL,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free plan available. Paid plans from $12/month.',
    },
    featureList: [
      'Real-time time tracking',
      'Screenshot monitoring',
      'Team productivity analytics',
      'Project management',
      'Invoicing and billing',
      'Desktop apps for Windows and macOS',
    ],
    downloadUrl: desktopWinUrl || desktopMacUrl || SITE_URL,
  };

  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: landingFaq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    isPartOf: { '@type': 'WebSite', url: SITE_URL, name: SITE_NAME },
    about: { '@type': 'SoftwareApplication', name: SITE_NAME },
    primaryImageOfPage: OG_IMAGE_URL,
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [organization, website, softwareApp, faqPage, webPage],
  };
}
