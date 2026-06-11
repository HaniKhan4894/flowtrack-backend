import { Link } from 'react-router-dom';
import { Sparkles, Github, Mail } from 'lucide-react';

const productLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Desktop App', href: '#download' },
  { label: 'Happy Clients', href: '#clients' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Roadmap', href: '#roadmap' },
];

const accountLinks = [
  { label: 'Login', to: '/login' },
  { label: 'Register', to: '/register' },
  { label: 'Start Free Trial', to: '/register' },
];

const resourceLinks: Array<{ label: string; href: string } | { label: string; to: string }> = [
  { label: 'Product Updates', href: '#roadmap' },
  { label: 'Privacy Policy', to: '/privacy' },
  { label: 'Terms of Service', to: '/terms' },
  { label: 'Support', href: 'mailto:support@flowtrack.app' },
];

const LandingFooter = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="relative z-10 border-t border-white/10 bg-[#06080e]/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 pt-14 pb-10">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-ai-gradient flex items-center justify-center shadow-ai">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-bold gradient-text">FlowTrack</span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed max-w-sm mb-6">
              Time tracking, screenshot evidence, team analytics, and billing — built for remote and hybrid teams that need clarity without friction.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="mailto:support@flowtrack.app"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:border-primary-500/40 hover:text-white"
                aria-label="Email support"
              >
                <Mail className="w-4 h-4" />
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:border-primary-500/40 hover:text-white"
                aria-label="GitHub"
              >
                <Github className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div className="lg:col-span-2">
            <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-4">Product</h4>
            <ul className="space-y-3">
              {productLinks.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-sm text-slate-400 transition hover:text-white">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-4">Account</h4>
            <ul className="space-y-3">
              {accountLinks.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="text-sm text-slate-400 transition hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-3">
            <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-4">Resources</h4>
            <ul className="space-y-3">
              {resourceLinks.map((link) => (
                <li key={link.label}>
                  {'to' in link ? (
                    <Link to={link.to} className="text-sm text-slate-400 transition hover:text-white">
                      {link.label}
                    </Link>
                  ) : (
                    <a href={link.href} className="text-sm text-slate-400 transition hover:text-white">
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-2xl border border-primary-500/20 bg-primary-500/5 p-4">
              <p className="text-xs font-semibold text-primary-300 mb-1">Need a demo?</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                Reach out and we&apos;ll walk your team through setup in minutes.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            © {year} FlowTrack. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-5 text-xs text-slate-500">
            <Link to="/privacy" className="hover:text-slate-300 transition">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-slate-300 transition">Terms of Service</Link>
            <span className="text-slate-600">Made for high-performance teams</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default LandingFooter;
