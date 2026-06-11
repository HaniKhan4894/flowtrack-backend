import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Sparkles, Monitor, Clock3, BarChart3, Download } from 'lucide-react';
import { Button } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import MeshBackground from './MeshBackground';

const packageCards = [
  {
    name: 'Free',
    price: '$0',
    subtitle: 'For solo users',
    features: ['1 project', 'Basic timer', 'Desktop + Web access'],
  },
  {
    name: 'Starter',
    price: '$12',
    subtitle: 'Per month',
    features: ['Unlimited projects', 'Screenshots', 'Client billing'],
  },
  {
    name: 'Professional',
    price: '$10 + $5/user',
    subtitle: 'Scale with team',
    features: ['Advanced analytics', 'Productivity insights', 'Priority support'],
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    subtitle: 'Large organizations',
    features: ['Dedicated support', 'Custom integrations', 'Advanced governance'],
  },
];

const selectedPackageName = 'Professional';

const adoptionBreakdown = [
  { label: 'IDE-based productivity signals', value: 82, color: 'from-indigo-500 to-blue-500' },
  { label: 'Desktop app activity intelligence', value: 91, color: 'from-cyan-500 to-sky-500' },
  { label: 'Browser + tab focus analytics', value: 76, color: 'from-fuchsia-500 to-violet-500' },
];

const currentHighlights = [
  'Live timer with pause/resume and activity sync',
  'Multi-screen screenshot capture and timeline view',
  'Project analytics, team insights, and billing workflows',
];

const upcomingHighlights = [
  'Client portal for invoice approvals and payment tracking',
  'Auto-generated weekly productivity summaries for managers',
  'Performance benchmarks by project, role, and sprint cycle',
];

const aiRoadmap = [
  'AI work pattern detection across IDE, app, and browser behavior',
  'Smart productivity coach with task-focus suggestions',
  'Predictive delivery risk alerts and team capacity forecasting',
];

const desktopWinUrl = import.meta.env.VITE_DESKTOP_WIN_URL;
const desktopMacUrl = import.meta.env.VITE_DESKTOP_MAC_URL;

const LandingPage = () => {
  const { isAuthenticated } = useAuthStore();
  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-white relative overflow-hidden">
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

      <header className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-ai-gradient flex items-center justify-center shadow-ai">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold gradient-text">FlowTrack</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login"><Button variant="secondary" size="sm">Login</Button></Link>
          <Link to="/register"><Button size="sm">Register</Button></Link>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-6 pt-8 pb-14 grid lg:grid-cols-2 gap-10 items-center relative z-10">
        <div className="absolute inset-0 -z-10 rounded-3xl overflow-hidden">
          <MeshBackground />
        </div>
        <div>
          <p className="text-primary-400 text-sm font-semibold uppercase tracking-[0.2em] mb-4">Built for serious teams</p>
          <h1 className="text-5xl md:text-6xl font-extrabold leading-tight mb-5">
            Run your team with clarity, speed, and accountability.
          </h1>
          <p className="text-slate-300 text-lg mb-8 max-w-xl">
            FlowTrack gives you time tracking, screen evidence, analytics, team visibility, and billing workflows in one clean platform.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/register"><Button size="lg">Start Free Trial <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
            <Link to="/login"><Button variant="secondary" size="lg">I already have an account</Button></Link>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-8"
        >
          <h3 className="text-xl font-bold mb-4">Why teams choose FlowTrack</h3>
          <div className="space-y-4 text-slate-200">
            <div className="flex gap-3"><Clock3 className="w-5 h-5 text-primary-400 mt-0.5" /><p>Real-time timer with pause/resume and reliable activity timeline.</p></div>
            <div className="flex gap-3"><Monitor className="w-5 h-5 text-secondary-400 mt-0.5" /><p>Smart screenshot capture for transparent remote work visibility.</p></div>
            <div className="flex gap-3"><BarChart3 className="w-5 h-5 text-primary-400 mt-0.5" /><p>Powerful team and project analytics for better decisions.</p></div>
            <div className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" /><p>Professional invoices and subscription billing in one flow.</p></div>
          </div>
        </motion.div>
      </section>

      {(desktopWinUrl || desktopMacUrl) && (
        <section className="max-w-7xl mx-auto px-6 py-6 relative z-10">
          <div className="glass-card p-8 md:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold mb-2">Download FlowTrack Desktop</h2>
              <p className="text-slate-400 max-w-2xl">
                Install the desktop app for screenshot capture, activity tracking, and timer controls while you work.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {desktopWinUrl && (
                <a href={desktopWinUrl} download>
                  <Button size="lg">
                    <Download className="w-4 h-4 mr-2" />
                    Windows
                  </Button>
                </a>
              )}
              {desktopMacUrl && (
                <a href={desktopMacUrl} download>
                  <Button variant="secondary" size="lg">
                    <Download className="w-4 h-4 mr-2" />
                    macOS
                  </Button>
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="max-w-7xl mx-auto px-6 py-10 relative z-10">
        <h2 className="text-3xl font-bold mb-3 text-center">Packages Built For Every Stage</h2>
        <p className="text-slate-400 text-center mb-10">Simple pricing, transparent features, and upgrade flexibility.</p>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
          {packageCards.map((pkg) => (
            <div key={pkg.name} className={`glass-card h-full flex flex-col ${pkg.popular ? 'border-primary-500/40 bg-primary-500/5' : ''} ${pkg.name === selectedPackageName ? 'ring-2 ring-emerald-500/40' : ''}`}>
              <div className="min-h-7 flex items-center gap-2 mb-3">
                {pkg.popular && (
                  <span className="inline-flex items-center text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-primary-500 text-white">Most Popular</span>
                )}
                {pkg.name === selectedPackageName && (
                  <span className="inline-flex items-center text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-emerald-500 text-white">Selected Package</span>
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

      <section className="max-w-7xl mx-auto px-6 pb-14 relative z-10">
        <div className="glass-card p-8 md:p-10 space-y-10">
          <div className="text-center">
            <h2 className="text-3xl font-bold">FlowTrack Product Momentum</h2>
            <p className="text-slate-400 mt-2">
              What is live today, what is coming next, and where AI will take FlowTrack.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h3 className="text-lg font-bold text-emerald-400 mb-3">Current Features</h3>
              <ul className="space-y-2">
                {currentHighlights.map((item) => (
                  <li key={item} className="text-sm text-slate-200 flex gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h3 className="text-lg font-bold text-primary-400 mb-3">Upcoming</h3>
              <ul className="space-y-2">
                {upcomingHighlights.map((item) => (
                  <li key={item} className="text-sm text-slate-200 flex gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary-400 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h3 className="text-lg font-bold text-cyan-400 mb-3">AI Future Roadmap</h3>
              <ul className="space-y-2">
                {aiRoadmap.map((item) => (
                  <li key={item} className="text-sm text-slate-200 flex gap-2">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400 mt-0.5" />
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

      <footer className="max-w-7xl mx-auto px-6 py-10 text-slate-500 text-sm flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
        <span>© {new Date().getFullYear()} FlowTrack. Built for high-performance teams.</span>
        <div className="flex items-center gap-5">
          <Link to="/login" className="hover:text-white transition-colors">Login</Link>
          <Link to="/register" className="hover:text-white transition-colors">Register</Link>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
