import { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Monitor,
  Clock3,
  BarChart3,
  Download,
  Users,
  Shield,
  Zap,
  Star,
  Quote,
  Wallet,
  ClipboardList,
  Gauge,
  Globe,
} from 'lucide-react';
import { Button } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import MeshBackground from './MeshBackground';
import LandingFooter from './LandingFooter';
import SeoHead from '../../seo/SeoHead';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_KEYWORDS,
  DEFAULT_TITLE,
  SITE_TAB_TITLE,
} from '../../seo/site';
import { buildLandingJsonLd, landingFaq } from '../../seo/structuredData';

const packageCards = [
  {
    name: 'Free',
    price: '$0',
    subtitle: 'For solo users',
    features: ['1 user · 2 projects', 'Basic timer', 'Desktop + Web'],
  },
  {
    name: 'Starter',
    price: '$12',
    subtitle: 'Per month',
    features: ['Up to 5 members', 'Screenshots every 5 min', 'Activity + productivity rules'],
  },
  {
    name: 'Professional',
    price: '$10 + $5/user',
    subtitle: 'Growing teams',
    features: ['Screenshots every 2 min', 'Payroll & timesheets', 'Custom roles & analytics'],
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    subtitle: 'Large organizations',
    features: ['Screenshots every 1 min', 'SSO & white-label', 'Dedicated support'],
  },
];

const adoptionBreakdown = [
  { label: 'IDE & dev tools (Cursor, VS Code)', value: 88, color: 'from-indigo-500 to-blue-500' },
  { label: 'Desktop foreground app tracking', value: 94, color: 'from-cyan-500 to-sky-500' },
  { label: 'Browser tab focus (Chrome, Edge)', value: 82, color: 'from-fuchsia-500 to-violet-500' },
];

const currentHighlights = [
  'System-wide activity % with 5-second foreground app polling',
  'Browser tab names (TikTok, GitHub, YouTube) with productivity rules',
  'Screenshot thumbnails, pagination, and plan-based capture intervals',
  'Idle auto-pause (5 min) with auto-resume and notifications',
  'Timesheets, leave management, payroll, and team member tracking',
  'Default + custom productivity rules (productive / unproductive / neutral)',
  'Client portal for invoice approvals and payment tracking',
  'Auto-generated weekly productivity summaries for managers',
  'Performance benchmarks by project, role, and sprint cycle',
  'AI work pattern detection across IDE, app, and browser behavior',
  'Smart productivity coach with task-focus suggestions',
  'Predictive delivery risk alerts and team capacity forecasting',
];

const desktopWinUrl = import.meta.env.VITE_DESKTOP_WIN_URL;
const desktopMacUrl = import.meta.env.VITE_DESKTOP_MAC_URL;

const desktopFeatures = [
  'Multi-screen screenshots with fast thumbnail previews',
  '5s app polling + 60s activity batch sync to cloud',
  'Idle detection: auto-pause timer after 5 minutes away',
  'Distraction alerts for social / entertainment apps',
  'System tray timer + lock-screen pause/resume',
];

const heroStats = [
  { value: '5 sec', label: 'App polling' },
  { value: '2 min', label: 'Pro screenshots' },
  { value: 'Secure', label: 'Role-based access' },
];

const happyClients = [
  {
    name: 'Sarah Mitchell',
    role: 'Operations Director',
    company: 'NovaStack Agency',
    quote:
      'FlowTrack replaced three separate tools for us. Timers, screenshots, and invoicing now live in one dashboard our clients actually trust.',
    initials: 'SM',
    accent: 'from-indigo-500 to-blue-500',
  },
  {
    name: 'James Okonkwo',
    role: 'Engineering Manager',
    company: 'PixelForge Studio',
    quote:
      'Our remote developers finally have a fair, transparent workflow. The desktop app sync and activity timeline saved our team hours every week.',
    initials: 'JO',
    accent: 'from-cyan-500 to-sky-500',
  },
  {
    name: 'Elena Vasquez',
    role: 'Founder',
    company: 'Brightline Consulting',
    quote:
      'We scaled from 4 to 28 people without losing visibility. FlowTrack analytics helped us spot bottlenecks before they hurt delivery.',
    initials: 'EV',
    accent: 'from-fuchsia-500 to-violet-500',
  },
];

const coreFeatures = [
  {
    icon: Clock3,
    title: 'Smart Time Tracking',
    description: 'Start, pause, resume, and auto-pause on idle. Syncs across desktop and web in real time.',
    accent: 'text-primary-400',
    glow: 'from-primary-500/20 to-transparent',
  },
  {
    icon: Monitor,
    title: 'Screenshot Monitoring',
    description: 'Plan-based intervals (1–5 min), thumbnail gallery, pagination, and full-size preview on click.',
    accent: 'text-secondary-400',
    glow: 'from-secondary-500/20 to-transparent',
  },
  {
    icon: Globe,
    title: 'App & Browser Tracking',
    description: 'Foreground apps every 5 seconds. Chrome tabs shown as TikTok, GitHub, YouTube — not raw titles.',
    accent: 'text-cyan-400',
    glow: 'from-cyan-500/20 to-transparent',
  },
  {
    icon: Gauge,
    title: 'Productivity Rules',
    description: 'Built-in rules for Cursor, Chrome, TikTok, and more. Admins add custom rules per organization.',
    accent: 'text-amber-400',
    glow: 'from-amber-500/20 to-transparent',
  },
  {
    icon: ClipboardList,
    title: 'Timesheets & Leave',
    description: 'Submit timesheets, approve hours, and manage annual, casual, sick, and unpaid leave types.',
    accent: 'text-violet-400',
    glow: 'from-violet-500/20 to-transparent',
  },
  {
    icon: Wallet,
    title: 'Payroll & Invoicing',
    description: 'Run payroll cycles, compensate teams, and turn tracked hours into client-ready invoices.',
    accent: 'text-emerald-400',
    glow: 'from-emerald-500/20 to-transparent',
  },
  {
    icon: BarChart3,
    title: 'Team Analytics',
    description: 'Hourly timeline, top apps, browser tabs, idle breakdown, and focus scores for managers.',
    accent: 'text-sky-400',
    glow: 'from-sky-500/20 to-transparent',
  },
  {
    icon: Users,
    title: 'Roles & Permissions',
    description: 'Owner, admin, manager, team lead, and member roles with granular permission control.',
    accent: 'text-rose-400',
    glow: 'from-rose-500/20 to-transparent',
  },
];

function SectionHeading({
  badge,
  title,
  description,
  align = 'center',
}: {
  badge: string;
  title: string;
  description: string;
  align?: 'center' | 'left';
}) {
  const alignClass = align === 'center' ? 'text-center mx-auto' : 'text-left';

  return (
    <div className={`max-w-3xl mb-10 ${alignClass}`}>
      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-4">
        {badge}
      </span>
      <h2 className="text-3xl md:text-4xl font-bold mb-3">{title}</h2>
      <p className="text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}

function WindowsIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M3 5.5 10.5 4.5V11.5H3V5.5Zm0 7H10.5v7L3 18.5v-6Zm8.5-8.25L21 2.75V11.5H11.5V4.25Zm0 8.25H21v8.75l-9.5-1.5V12.5Z" />
    </svg>
  );
}

function AppleIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.793 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.48c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.527 1.816-.78.896-1.446 2.345-1.266 3.73 1.338.104 2.715-.688 3.548-1.716z" />
    </svg>
  );
}

const LandingPage = () => {
  const { isAuthenticated } = useAuthStore();

  const jsonLd = useMemo(
    () => buildLandingJsonLd({ desktopWinUrl, desktopMacUrl }),
    [],
  );

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-white relative overflow-hidden">
      <SeoHead
        title={SITE_TAB_TITLE}
        ogTitle={DEFAULT_TITLE}
        description={DEFAULT_DESCRIPTION}
        keywords={DEFAULT_KEYWORDS}
        canonicalPath="/"
        jsonLd={jsonLd}
      />
      {/* Stripe-like animated hero ribbons */}
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          animate={{ x: [0, 60, -20, 0], y: [0, -30, 20, 0], rotate: [8, 14, 6, 8] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-44 -right-20 w-[56rem] h-[28rem] opacity-55 blur-3xl"
          style={{ background: 'conic-gradient(from 120deg, #8b5cf6, #ec4899, #f59e0b, #38bdf8, #8b5cf6)' }}
        />
        <motion.div
          animate={{ x: [0, -50, 30, 0], y: [0, 25, -18, 0], rotate: [-10, -4, -12, -10] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-24 right-10 w-[30rem] h-[24rem] opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle at 20% 30%, #22d3ee, transparent 60%), radial-gradient(circle at 70% 50%, #6366f1, transparent 65%)' }}
        />
      </div>

      <div className="absolute inset-0 bg-gradient-to-b from-background/35 via-background/80 to-background pointer-events-none" />

      <header className="sticky top-0 z-50 border-b border-white/5 bg-background/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
          <Link to="/" className="flex items-center gap-3 shrink-0" aria-label="FlowTrack home">
            <div className="w-10 h-10 rounded-xl bg-ai-gradient flex items-center justify-center shadow-ai">
              <Sparkles className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <span className="text-2xl font-bold gradient-text">FlowTrack</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm text-slate-400" aria-label="Primary navigation">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            {(desktopWinUrl || desktopMacUrl) && (
              <a href="#download" className="hover:text-white transition-colors">Desktop</a>
            )}
            <a href="#clients" className="hover:text-white transition-colors">Clients</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
            <a href="#roadmap" className="hover:text-white transition-colors">Roadmap</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link to="/login"><Button variant="secondary" size="sm">Login</Button></Link>
            <Link to="/register"><Button size="sm">Get Started</Button></Link>
          </div>
        </div>
      </header>

      <main>
      <section className="max-w-7xl mx-auto px-6 pt-12 pb-10 relative z-10" aria-labelledby="hero-heading">
        <div className="absolute inset-x-6 top-8 bottom-0 -z-10 rounded-[2rem] overflow-hidden opacity-80">
          <MeshBackground />
        </div>

        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-500/25 bg-primary-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary-300 mb-6">
              <Zap className="w-3.5 h-3.5" />
              Built for serious teams
            </div>
            <h1 id="hero-heading" className="text-5xl md:text-6xl lg:text-[3.4rem] font-extrabold leading-[1.08] mb-5">
              Run your team with{' '}
              <span className="gradient-text">clarity</span>, speed, and accountability.
            </h1>
            <p className="text-slate-300 text-lg mb-8 max-w-xl leading-relaxed">
              FlowTrack gives you time tracking, screen evidence, analytics, team visibility, and billing workflows in one clean platform.
            </p>
            <div className="flex flex-wrap gap-3 mb-10">
              <Link to="/register"><Button size="lg">Start Free Trial <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
              <Link to="/login"><Button variant="secondary" size="lg">I already have an account</Button></Link>
            </div>

            <div className="grid grid-cols-3 gap-4 max-w-xl">
              {heroStats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                  <p className="text-sm font-bold text-white">{stat.value}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="glass-card p-8 relative overflow-hidden"
          >
            <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-primary-500/15 blur-3xl" />
            <div className="flex items-center gap-2 mb-5">
              <Shield className="w-5 h-5 text-emerald-400" />
              <h3 className="text-xl font-bold">Why teams choose FlowTrack</h3>
            </div>
            <div className="space-y-4 text-slate-200">
              <div className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <Clock3 className="w-5 h-5 text-primary-400 mt-0.5 shrink-0" />
                <p className="text-sm">5-second app polling with idle auto-pause and productivity categorization.</p>
              </div>
              <div className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <Monitor className="w-5 h-5 text-secondary-400 mt-0.5 shrink-0" />
                <p className="text-sm">Fast screenshot thumbnails with full-size preview — intervals from 1–5 min by plan.</p>
              </div>
              <div className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <Globe className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" />
                <p className="text-sm">Browser tabs tracked as clean names: TikTok, GitHub, YouTube, and more.</p>
              </div>
              <div className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <Wallet className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-sm">Payroll, timesheets, leave, invoices, and role-based team visibility.</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section id="features" className="max-w-7xl mx-auto px-6 py-14 relative z-10 scroll-mt-24">
        <SectionHeading
          badge="Core Features"
          title="Everything your team needs in one place"
          description="From individual focus to team-wide visibility — FlowTrack keeps work transparent without slowing anyone down."
        />
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {coreFeatures.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, delay: index * 0.06 }}
              className="group glass-card relative overflow-hidden"
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${feature.glow} opacity-0 transition group-hover:opacity-100`} />
              <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 ${feature.accent}`}>
                <feature.icon className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {(desktopWinUrl || desktopMacUrl) && (
        <section id="download" className="max-w-7xl mx-auto px-6 py-6 relative z-10 scroll-mt-24">
          <div className="glass-card overflow-hidden p-8 md:p-10">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8">
              <div className="max-w-xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary-500/30 bg-primary-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary-300 mb-4">
                  <Monitor className="w-3.5 h-3.5" />
                  Desktop App
                </div>
                <h2 className="text-2xl md:text-3xl font-bold mb-3">Download FlowTrack Desktop</h2>
                <p className="text-slate-400 leading-relaxed">
                  Install the native app for screenshot capture, activity tracking, and timer controls while you work — synced with your web account.
                </p>
                <ul className="mt-5 space-y-2">
                  {desktopFeatures.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-slate-300">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 w-full lg:max-w-xl">
                {desktopWinUrl && (
                  <a
                    href={desktopWinUrl}
                    download
                    className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all hover:border-sky-500/40 hover:bg-sky-500/5 hover:shadow-[0_0_30px_rgba(56,189,248,0.12)]"
                  >
                    <div className="mb-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/20">
                        <WindowsIcon className="w-7 h-7" />
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1">Windows</h3>
                    <p className="text-xs text-slate-500 mb-4">Windows 10 / 11 · 64-bit</p>
                    <span className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition group-hover:brightness-110">
                      <Download className="w-4 h-4" />
                      Download for Windows
                    </span>
                  </a>
                )}

                {desktopMacUrl && (
                  <a
                    href={desktopMacUrl}
                    download
                    className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all hover:border-violet-500/40 hover:bg-violet-500/5 hover:shadow-[0_0_30px_rgba(139,92,246,0.12)]"
                  >
                    <div className="mb-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/20 p-2">
                        <AppleIcon className="w-full h-full" />
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1">macOS</h3>
                    <p className="text-xs text-slate-500 mb-4">macOS 12 Monterey or later</p>
                    <span className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition group-hover:bg-white/10">
                      <Download className="w-4 h-4" />
                      Download for Mac
                    </span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <section id="pricing" className="max-w-7xl mx-auto px-6 py-14 relative z-10 scroll-mt-24">
        <SectionHeading
          badge="Pricing"
          title="Packages built for every stage"
          description="Simple pricing, transparent features, and upgrade flexibility as your team grows."
        />
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
          {packageCards.map((pkg) => (
            <div key={pkg.name} className={`glass-card h-full flex flex-col ${pkg.popular ? 'border-primary-500/40 bg-primary-500/5' : ''}`}>
              <div className="min-h-7 flex items-center gap-2 mb-3">
                {pkg.popular && (
                  <span className="inline-flex items-center text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-primary-500 text-white">Most Popular</span>
                )}
              </div>

              <h3 className="text-2xl font-bold min-h-8">{pkg.name}</h3>
              <div className="text-3xl font-extrabold mt-2 min-h-11">{pkg.price}</div>
              <p className="text-slate-400 text-sm mt-1 min-h-10">{pkg.subtitle}</p>

              <ul className="mt-5 space-y-2 flex-1">
                {pkg.features.map((feature) => (
                  <li key={feature} className="text-sm text-slate-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary-400" />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <Link to="/register"><Button className="w-full">Get Started</Button></Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="clients" className="max-w-7xl mx-auto px-6 py-14 relative z-10 scroll-mt-24" aria-labelledby="clients-heading">
        <SectionHeading
          badge="Happy Clients"
          title="Teams that run smarter with FlowTrack"
          description="From agencies to engineering teams — see why growing organizations trust FlowTrack for accountability and clarity."
        />
        <div className="grid md:grid-cols-3 gap-6">
          {happyClients.map((client, index) => (
            <motion.article
              key={client.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.45, delay: index * 0.08 }}
              className="glass-card relative flex flex-col"
            >
              <Quote className="w-8 h-8 text-primary-500/40 mb-4" aria-hidden="true" />
              <div className="flex gap-1 mb-4" aria-label="5 out of 5 stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm text-slate-300 leading-relaxed flex-1 mb-6">&ldquo;{client.quote}&rdquo;</p>
              <div className="flex items-center gap-3 pt-4 border-t border-white/8">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${client.accent} text-sm font-bold text-white`}>
                  {client.initials}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{client.name}</p>
                  <p className="text-xs text-slate-500">{client.role}, {client.company}</p>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            500+ teams onboarded
          </span>
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            4.9/5 average satisfaction
          </span>
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Remote &amp; hybrid ready
          </span>
        </div>
      </section>

      <section id="roadmap" className="max-w-7xl mx-auto px-6 pb-10 relative z-10 scroll-mt-24">
        <div className="glass-card p-8 md:p-10 space-y-10">
          <SectionHeading
            badge="Roadmap"
            title="FlowTrack product momentum"
            description="What is live today, what is coming next, and where AI will take FlowTrack."
          />

          <div className="grid md:grid-cols-1 gap-6 max-w-3xl">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h3 className="text-lg font-bold text-emerald-400 mb-3">Current Features</h3>
              <ul className="space-y-2">
                {currentHighlights.map((item) => (
                  <li key={item} className="text-sm text-slate-200 flex gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h3 className="text-xl font-bold mb-5">Intelligence Coverage Breakdown</h3>
            <div className="space-y-5">
              {adoptionBreakdown.map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-200">{item.label}</span>
                    <span className="text-sm font-bold text-white">{item.value}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${item.value}%` }}
                      viewport={{ once: true, amount: 0.6 }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      className={`h-full bg-gradient-to-r ${item.color}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="max-w-7xl mx-auto px-6 py-14 relative z-10 scroll-mt-24" aria-labelledby="faq-heading">
        <SectionHeading
          badge="FAQ"
          title="Frequently asked questions about FlowTrack"
          description="Answers to common questions about time tracking, screenshots, desktop apps, pricing, and team productivity."
        />
        <div className="grid md:grid-cols-2 gap-4 max-w-5xl mx-auto">
          {landingFaq.map((item) => (
            <article
              key={item.question}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
              itemScope
              itemType="https://schema.org/Question"
            >
              <h3 className="text-base font-bold text-white mb-2" itemProp="name">{item.question}</h3>
              <div itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                <p className="text-sm text-slate-400 leading-relaxed" itemProp="text">{item.answer}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-10 relative z-10" aria-labelledby="cta-heading">
        <div className="relative overflow-hidden rounded-3xl border border-primary-500/25 bg-gradient-to-br from-primary-600/20 via-background to-secondary-600/10 p-10 md:p-14 text-center">
          <div className="pointer-events-none absolute -top-20 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-primary-500/20 blur-3xl" />
          <h2 id="cta-heading" className="text-3xl md:text-4xl font-bold mb-4 relative">Ready to bring clarity to your team?</h2>
          <p className="text-slate-400 max-w-2xl mx-auto mb-8 relative">
            Start your free trial today — set up projects, invite your team, and download the desktop app in minutes.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 relative">
            <Link to="/register"><Button size="lg">Start Free Trial <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
            <Link to="/login"><Button variant="secondary" size="lg">Sign in</Button></Link>
          </div>
        </div>
      </section>
      </main>

      <LandingFooter />
    </div>
  );
};

export default LandingPage;
