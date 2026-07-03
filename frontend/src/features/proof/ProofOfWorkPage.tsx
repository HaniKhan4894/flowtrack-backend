import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck, ShieldAlert, Loader2, Link2, FileCheck, RefreshCw, Fingerprint,
} from 'lucide-react';
import {
  ledgerService,
  type LedgerOverview,
  type LedgerVerification,
} from '../../api/ledgerService';
import { getApiErrorMessage } from '../../utils/apiError';

const shortHash = (h?: string | null) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : '—');

const integrityStyle = (score: number) => {
  if (score >= 90) return 'bg-emerald-500/15 text-emerald-300';
  if (score >= 75) return 'bg-teal-500/15 text-teal-300';
  if (score >= 55) return 'bg-amber-500/15 text-amber-300';
  return 'bg-rose-500/15 text-rose-300';
};

const actionStyle: Record<string, string> = {
  record: 'bg-emerald-500/15 text-emerald-300',
  amend: 'bg-amber-500/15 text-amber-300',
  delete: 'bg-rose-500/15 text-rose-300',
};

const issueLabel: Record<string, string> = {
  deleted: 'Recorded entry was deleted',
  modified: 'Entry modified after recording',
  reappeared: 'Deleted entry reappeared',
};

const ProofOfWorkPage = () => {
  const [overview, setOverview] = useState<LedgerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verification, setVerification] = useState<LedgerVerification | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await ledgerService.overview();
      setOverview(r.data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load the ledger'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const runVerify = async () => {
    setVerifying(true);
    setError(null);
    try {
      const r = await ledgerService.verify();
      setVerification(r.data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Verification failed'));
    } finally {
      setVerifying(false);
    }
  };

  const intact = verification && verification.chain_valid && verification.data_valid;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <FileCheck className="text-primary-400" /> Proof of Work
          </h1>
          <p className="text-slate-400">
            A tamper-evident hash chain over every recorded time entry. Verify that logged work hasn't been altered.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-bold self-start"
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      {loading ? (
        <div className="p-20 flex justify-center"><Loader2 className="w-8 h-8 text-primary-500 animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass rounded-3xl border border-white/5 p-6">
              <div className="flex items-center gap-2 text-slate-500 text-xs uppercase font-bold mb-2">
                <Link2 size={14} /> Ledger records
              </div>
              <p className="text-3xl font-bold text-white">{overview?.summary.records ?? 0}</p>
              <p className="text-xs text-slate-500 mt-1">Sequence #{overview?.summary.last_sequence ?? 0}</p>
            </div>
            <div className="glass rounded-3xl border border-white/5 p-6">
              <div className="flex items-center gap-2 text-slate-500 text-xs uppercase font-bold mb-2">
                <Fingerprint size={14} /> Latest hash
              </div>
              <p className="text-lg font-mono text-primary-300 break-all">{shortHash(overview?.summary.last_hash)}</p>
              <p className="text-xs text-slate-500 mt-1">{overview?.summary.last_recorded_at ?? 'No records yet'}</p>
            </div>
            <div className="glass rounded-3xl border border-white/5 p-6 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-slate-500 text-xs uppercase font-bold mb-2">
                <ShieldCheck size={14} /> Integrity
              </div>
              <button
                onClick={runVerify}
                disabled={verifying}
                className="flex items-center justify-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-ai"
              >
                {verifying ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                Verify chain
              </button>
            </div>
          </div>

          {verification && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-3xl border p-6 ${
                intact ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'
              }`}
            >
              <div className="flex items-center gap-3 mb-4">
                {intact ? (
                  <ShieldCheck className="text-emerald-400" size={28} />
                ) : (
                  <ShieldAlert className="text-rose-400" size={28} />
                )}
                <div>
                  <h3 className={`font-bold ${intact ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {intact ? 'Ledger verified — all work intact' : 'Integrity issues detected'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Chain {verification.chain_valid ? 'valid' : `broken at #${verification.first_broken_sequence}`} ·{' '}
                    {verification.verified_entries} entries checked · {verification.records} records
                  </p>
                </div>
              </div>

              {verification.tampered.length > 0 && (
                <div className="space-y-2">
                  {verification.tampered.map((t, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm bg-black/20 rounded-xl px-4 py-2">
                      <ShieldAlert size={16} className="text-rose-400 shrink-0" />
                      <span className="text-rose-200">{issueLabel[t.issue] ?? t.issue}</span>
                      <span className="text-slate-500 ml-auto">entry #{t.reference_id} · seq {t.sequence}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          <div className="glass rounded-3xl border border-white/5 shadow-ai overflow-hidden">
            <div className="p-5 border-b border-white/5 bg-white/[0.02]">
              <h3 className="font-bold text-white text-sm uppercase tracking-wider">Recent ledger</h3>
            </div>
            <div className="divide-y divide-white/5">
              {overview && overview.records.length > 0 ? (
                overview.records.map((r) => (
                  <div key={r.sequence} className="p-4 flex items-center gap-4">
                    <span className="text-xs font-mono text-slate-500 w-12 shrink-0">#{r.sequence}</span>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg uppercase ${actionStyle[r.action] ?? 'bg-white/5 text-slate-300'}`}>
                      {r.action}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">
                        {r.entry_type.replace('_', ' ')}
                        {r.reference_id ? ` #${r.reference_id}` : ''}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {[r.first_name, r.last_name].filter(Boolean).join(' ') || 'System'} · {r.created_at}
                      </p>
                    </div>
                    {r.integrity_score !== null && r.integrity_score !== undefined && r.action !== 'delete' && (
                      <span
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg shrink-0 ${integrityStyle(Number(r.integrity_score))}`}
                        title="Work integrity score"
                      >
                        {Math.round(Number(r.integrity_score))}
                      </span>
                    )}
                    <span className="text-xs font-mono text-primary-300/80 shrink-0 hidden sm:block">{shortHash(r.hash)}</span>
                  </div>
                ))
              ) : (
                <p className="p-8 text-slate-500 text-sm text-center">
                  No ledger records yet. They're created automatically as time entries are completed.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ProofOfWorkPage;
