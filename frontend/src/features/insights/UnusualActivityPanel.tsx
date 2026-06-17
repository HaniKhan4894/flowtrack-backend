import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Calendar, Clock, Loader2, PackageOpen } from 'lucide-react';
import { insightsService, type UnusualActivityReport, type UnusualActivityTier } from '../../api/insightsService';
import { TeamMemberFilter } from '../../components/TeamMemberFilter';
import { getAppDisplayName } from '../../utils/appIcons';
import { getApiErrorMessage } from '../../utils/apiError';
import { useAuthStore } from '../../store/authStore';

const TIER_META: Record<UnusualActivityTier, { label: string; badge: string; card: string }> = {
  highly_unusual: {
    label: 'Highly unusual',
    badge: 'bg-rose-500/15 text-rose-200 border-rose-500/30',
    card: 'border-rose-500/30 bg-rose-500/10',
  },
  unusual: {
    label: 'Unusual',
    badge: 'bg-orange-500/15 text-orange-200 border-orange-500/30',
    card: 'border-orange-500/30 bg-orange-500/10',
  },
  slightly_unusual: {
    label: 'Slightly unusual',
    badge: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
    card: 'border-amber-500/30 bg-amber-500/10',
  },
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function UnusualActivityPanel() {
  const { user } = useAuthStore();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(user?.id ?? null);
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [tiers, setTiers] = useState<UnusualActivityTier[]>(['highly_unusual', 'unusual', 'slightly_unusual']);
  const [report, setReport] = useState<UnusualActivityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedUserId && user?.id) {
      setSelectedUserId(user.id);
    }
  }, [selectedUserId, user?.id]);

  const load = useCallback(async () => {
    if (!selectedUserId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const resp = await insightsService.getUnusualActivity({
        user_id: selectedUserId,
        start_date: startDate,
        end_date: endDate,
        tiers,
      });
      setReport(resp.data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load unusual activity'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, startDate, endDate, tiers]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleTier = (tier: UnusualActivityTier) => {
    setTiers((current) => {
      if (current.includes(tier)) {
        const next = current.filter((t) => t !== tier);
        return next.length > 0 ? next : [tier];
      }
      return [...current, tier];
    });
  };

  const summaryCards = useMemo(() => {
    if (!report) {
      return [];
    }
    return [
      { tier: 'highly_unusual' as const, count: report.summary.highly_unusual_count },
      { tier: 'unusual' as const, count: report.summary.unusual_count },
      { tier: 'slightly_unusual' as const, count: report.summary.slightly_unusual_count },
    ];
  }, [report]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Unusual activity</h2>
          <p className="text-slate-400 mt-1">
            Compare keyboard, mouse, and movement patterns against each member&apos;s 60-day baseline.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <TeamMemberFilter
            selectedUserId={selectedUserId}
            onChange={(userId) => setSelectedUserId(userId)}
          />
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-sm text-white outline-none"
            />
            <span className="text-slate-500">–</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-sm text-white outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(TIER_META) as UnusualActivityTier[]).map((tier) => {
          const active = tiers.includes(tier);
          return (
            <button
              key={tier}
              type="button"
              onClick={() => toggleTier(tier)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm border transition ${
                active ? TIER_META[tier].badge : 'bg-white/5 text-slate-400 border-white/10'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${active ? 'bg-current' : 'bg-slate-600'}`} />
              {TIER_META[tier].label}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
        </div>
      )}

      {error && !loading && <p className="text-red-400">{error}</p>}

      {!loading && report && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {!report.baseline_period.ready && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Baseline is still building for {report.user.name}. At least 10 tracked intervals are needed before flags become reliable.
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {summaryCards.map(({ tier, count }) => (
              <div key={tier} className={`rounded-xl border p-5 ${TIER_META[tier].card}`}>
                <p className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold border ${TIER_META[tier].badge}`}>
                  {TIER_META[tier].label}
                </p>
                <p className="text-3xl font-bold text-white mt-4">{count}</p>
                <p className="text-sm text-slate-300 mt-1">Instances</p>
              </div>
            ))}
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="text-slate-400 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Total time (h:m)
              </p>
              <p className="text-3xl font-bold text-white mt-4">{report.summary.total_flagged_hm}</p>
              <p className="text-sm text-slate-400 mt-1">Selected period</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="text-slate-400 text-sm">Previous period (h:m)</p>
              <p className="text-3xl font-bold text-white mt-4">{report.previous_period.flagged_hm}</p>
              <p className="text-xs text-slate-500 mt-1">
                Baseline: {report.baseline_period.days} days ({report.baseline_period.sample_buckets} samples)
              </p>
            </div>
          </div>

          {report.instances.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
              <PackageOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-lg font-semibold text-white">That&apos;s good news!</p>
              <p className="text-slate-400 mt-2">
                No unusual activity was recorded for {report.user.name} in the selected time period.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                <p className="font-semibold text-white">Flagged intervals</p>
                <p className="text-sm text-slate-400">{report.instances.length} instance(s)</p>
              </div>
              <div className="divide-y divide-white/5">
                {report.instances.map((item) => (
                  <div key={`${item.start_at}-${item.tier}`} className="px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold border ${TIER_META[item.tier].badge}`}>
                          {TIER_META[item.tier].label}
                        </span>
                        <span className="text-sm text-slate-300">
                          {item.start_at.slice(11, 16)} – {item.end_at.slice(11, 16)}
                        </span>
                        <span className="text-sm text-slate-500">{item.start_at.slice(0, 10)}</span>
                      </div>
                      {item.top_app && (
                        <p className="text-sm text-slate-400 mt-2">
                          Top app: <span className="text-slate-200">{getAppDisplayName(item.top_app)}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-right">
                        <p className="text-slate-500">Duration</p>
                        <p className="text-white font-semibold">{item.duration_minutes} min</p>
                      </div>
                      <div className="text-right">
                        <p className="text-slate-500">Input vs baseline</p>
                        <p className="text-white font-semibold">{item.percentile}th percentile</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p>
              Low input during tracked time can happen during meetings, reading, or pair sessions.
              Use this report as a signal to review activity and screenshots, not as proof of misconduct.
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
