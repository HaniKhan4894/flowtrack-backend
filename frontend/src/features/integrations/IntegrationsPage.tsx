import { Link } from 'react-router-dom';
import { Github, Trello, Slack, ArrowRight } from 'lucide-react';
import IntegrationsSettings from '../settings/IntegrationsSettings';

const IntegrationsPage = () => (
  <div className="max-w-6xl mx-auto space-y-8">
    <div>
      <h1 className="text-3xl font-bold text-white tracking-tight">Integrations</h1>
      <p className="text-slate-400 mt-2 text-sm max-w-2xl">
        Connect your tools once, then manage Jira, GitHub, and Slack without leaving FlowTrack.
      </p>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <Link
        to="/integrations/jira"
        className="group rounded-2xl border border-[#0052CC]/30 bg-gradient-to-br from-[#0052CC]/10 to-transparent p-5 hover:border-[#0052CC]/50 transition-all"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-[#0052CC] flex items-center justify-center text-white">
              <Trello size={20} />
            </div>
            <div>
              <h2 className="text-white font-semibold">Jira Workspace</h2>
              <p className="text-xs text-slate-400 mt-0.5">Browse issues, transition status, comment & log time in-app.</p>
            </div>
          </div>
          <ArrowRight size={18} className="text-slate-500 group-hover:text-white shrink-0 mt-1" />
        </div>
      </Link>

      <Link
        to="/integrations/github"
        className="group rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-5 hover:border-white/20 transition-all"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-[#24292f] flex items-center justify-center text-white">
              <Github size={20} />
            </div>
            <div>
              <h2 className="text-white font-semibold">GitHub Workspace</h2>
              <p className="text-xs text-slate-400 mt-0.5">Review PRs, comment, merge or close — all from FlowTrack.</p>
            </div>
          </div>
          <ArrowRight size={18} className="text-slate-500 group-hover:text-white shrink-0 mt-1" />
        </div>
      </Link>

      <Link
        to="/integrations/slack"
        className="group rounded-2xl border border-[#4A154B]/40 bg-gradient-to-br from-[#4A154B]/15 to-transparent p-5 hover:border-[#E01E5A]/40 transition-all"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-[#4A154B] flex items-center justify-center text-white">
              <Slack size={20} />
            </div>
            <div>
              <h2 className="text-white font-semibold">Slack Workspace</h2>
              <p className="text-xs text-slate-400 mt-0.5">Browse channels, read messages & reply in-app.</p>
            </div>
          </div>
          <ArrowRight size={18} className="text-slate-500 group-hover:text-white shrink-0 mt-1" />
        </div>
      </Link>
    </div>

    <IntegrationsSettings hideHeader />
  </div>
);

export default IntegrationsPage;
