import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui';
import LandingFooter from './LandingFooter';
import SeoHead from '../../seo/SeoHead';

type LegalPageLayoutProps = {
  title: string;
  description: string;
  canonicalPath: string;
  lastUpdated: string;
  children: ReactNode;
};

const LegalPageLayout = ({
  title,
  description,
  canonicalPath,
  lastUpdated,
  children,
}: LegalPageLayoutProps) => (
  <div className="min-h-screen bg-background text-white">
    <SeoHead
      title={`${title} — FlowTrack`}
      description={description}
      canonicalPath={canonicalPath}
    />

    <header className="border-b border-white/5 bg-background/80 backdrop-blur-xl">
      <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-ai-gradient flex items-center justify-center shadow-ai">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold gradient-text">FlowTrack</span>
        </Link>
        <Link to="/">
          <Button variant="secondary" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>
      </div>
    </header>

    <main className="max-w-4xl mx-auto px-6 py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-3">
        Last updated: {lastUpdated}
      </p>
      <h1 className="text-4xl font-extrabold mb-4">{title}</h1>
      <p className="text-slate-400 leading-relaxed mb-10">{description}</p>

      <article className="prose-legal space-y-8 text-slate-300 leading-relaxed">
        {children}
      </article>
    </main>

    <LandingFooter />
  </div>
);

export default LegalPageLayout;
