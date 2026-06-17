import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  CheckCircle2,
  CreditCard,
  FileText,
  Loader2,
  Monitor,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  clientPortalService,
  type PortalInvoice,
  type ProofPack,
  type ProofPackScreenshot,
} from '../../api/clientPortalService';
import { Button } from '../../components/ui';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatApiDate } from '../../utils/date';

const categoryColors: Record<string, string> = {
  productive: 'from-emerald-500 to-teal-500',
  neutral: 'from-sky-500 to-blue-500',
  unproductive: 'from-rose-500 to-orange-500',
  uncategorized: 'from-slate-500 to-slate-600',
};

function IntegrityRing({ score, grade }: { score: number; grade: string }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const tone =
    score >= 75 ? 'text-emerald-400' : score >= 60 ? 'text-sky-400' : score >= 40 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div className="relative flex flex-col items-center">
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none" />
        <circle
          cx="70"
          cy="70"
          r={radius}
          stroke="currentColor"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={tone}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-extrabold ${tone}`}>{Math.round(score)}</span>
        <span className="text-[11px] uppercase tracking-wider text-slate-400">Integrity</span>
      </div>
      <p className={`mt-2 text-sm font-semibold ${tone}`}>{grade}</p>
    </div>
  );
}

function PortalScreenshotThumb({ shot }: { shot: ProofPackScreenshot }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    clientPortalService
      .fetchScreenshotBlob(shot.thumbnail_url)
      .then((url) => {
        if (!cancelled) {
          objectUrl = url;
          setSrc(url);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [shot.thumbnail_url]);

  return (
    <div className="group relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-slate-900/60">
      {src && !failed ? (
        <img src={src} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
      ) : (
        <div className="flex h-full items-center justify-center text-slate-600">
          <Monitor className="h-6 w-6" />
        </div>
      )}
      {shot.is_blurred && (
        <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-200">
          Blurred
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-[10px] text-slate-300">
        {new Date(shot.captured_at.replace(' ', 'T')).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}
      </div>
    </div>
  );
}

function ProofPackSection({ pack }: { pack: ProofPack }) {
  if (!pack.available) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-400">
        Verified work evidence will appear here when tracked time is linked to this invoice.
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-white/5 to-cyan-500/5 p-6 space-y-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Proof-of-Work Pack
          </div>
          <h2 className="text-xl font-bold">Verify before you pay</h2>
          <p className="mt-1 text-sm text-slate-400">
            {pack.organization_name} · {pack.period.label}
          </p>
        </div>
        <IntegrityRing score={pack.integrity.score} grade={pack.integrity.grade} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Tracked hours', value: pack.summary.tracked_hours.toFixed(1) },
          { label: 'Billed hours', value: pack.summary.billed_hours.toFixed(1) },
          { label: 'Screenshots', value: String(pack.summary.screenshot_count) },
          { label: 'Contributors', value: String(pack.summary.contributor_count) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{stat.label}</p>
            <p className="text-xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      {pack.highlights.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {pack.highlights.map((item) => (
            <li key={item} className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              {item}
            </li>
          ))}
        </ul>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Activity className="h-4 w-4 text-cyan-400" />
            Top apps &amp; sites
          </h3>
          <div className="space-y-3">
            {pack.top_apps.slice(0, 6).map((app) => (
              <div key={app.app_name}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-300">{app.app_name}</span>
                  <span className="text-slate-500">{app.hours}h · {app.percent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full bg-gradient-to-r ${categoryColors[app.category] ?? categoryColors.uncategorized}`}
                    style={{ width: `${Math.min(100, app.percent)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Users className="h-4 w-4 text-violet-400" />
            Team contribution
          </h3>
          <ul className="space-y-2">
            {pack.contributors.map((person) => (
              <li key={person.display_name} className="flex justify-between rounded-lg border border-white/5 px-3 py-2 text-sm">
                <span>{person.display_name}</span>
                <span className="text-slate-400">{person.hours}h</span>
              </li>
            ))}
          </ul>

          {pack.productivity.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {pack.productivity.map((row) => (
                <span
                  key={row.category}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs capitalize text-slate-300"
                >
                  {row.category}: {row.percent}%
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {pack.screenshots.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Monitor className="h-4 w-4 text-blue-400" />
            Work evidence samples
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {pack.screenshots.map((shot) => (
              <PortalScreenshotThumb key={shot.id} shot={shot} />
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Sampled screenshots from the billed period. Sensitive content may be blurred per team policy.
          </p>
        </div>
      )}
    </motion.div>
  );
}

const ClientPortalPage = () => {
  const { token } = useParams<{ token: string }>();
  const [invoice, setInvoice] = useState<PortalInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await clientPortalService.getInvoice(token);
      setInvoice(resp.data);
      const balance = Number(resp.data.balance_due ?? resp.data.total ?? 0);
      setPaymentAmount(balance > 0 ? String(balance) : '');
    } catch (e) {
      setError(getApiErrorMessage(e, 'Invalid or expired portal link'));
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const handleApprove = async () => {
    if (!token) return;
    setActionLoading(true);
    try {
      await clientPortalService.approve(token);
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to approve invoice'));
    } finally {
      setActionLoading(false);
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setActionLoading(true);
    try {
      await clientPortalService.recordPayment(token, {
        amount: Number(paymentAmount),
        reference: paymentRef || undefined,
        method: 'bank_transfer',
      });
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to record payment'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
        <p className="text-red-300">{error ?? 'Invoice not found'}</p>
      </div>
    );
  }

  const canApprove = !invoice.client_approved_at && !['paid', 'cancelled'].includes(invoice.status);
  const balanceDue = Number(invoice.balance_due ?? 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {invoice.proof_pack && <ProofPackSection pack={invoice.proof_pack} />}

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-8 h-8 text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold">Invoice #{invoice.invoice_number}</h1>
              <p className="text-slate-400">{invoice.client_name}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mb-6">
            <div><span className="text-slate-400">Issue date</span><p>{formatApiDate(invoice.issue_date)}</p></div>
            <div><span className="text-slate-400">Due date</span><p>{formatApiDate(invoice.due_date)}</p></div>
            <div><span className="text-slate-400">Status</span><p className="capitalize">{invoice.status.replace('_', ' ')}</p></div>
            <div><span className="text-slate-400">Total</span><p className="text-xl font-semibold">{invoice.currency} {Number(invoice.total).toFixed(2)}</p></div>
          </div>

          {invoice.items && invoice.items.length > 0 && (
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-400 border-b border-white/10"><th className="py-2">Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <tr key={item.id} className="border-b border-white/5">
                      <td className="py-2">{item.description}</td>
                      <td>{item.quantity}</td>
                      <td>{Number(item.unit_price).toFixed(2)}</td>
                      <td>{Number(item.amount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {canApprove && (
              <Button onClick={handleApprove} disabled={actionLoading} className="gap-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Approve Invoice
              </Button>
            )}
            {invoice.client_approved_at && (
              <span className="inline-flex items-center gap-2 text-emerald-400 text-sm">
                <CheckCircle2 className="w-4 h-4" /> Approved {formatApiDate(invoice.client_approved_at, { dateStyle: 'medium' })}
              </span>
            )}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><CreditCard className="w-5 h-5" /> Payment Tracking</h2>
          <p className="text-sm text-slate-400 mb-4">
            Paid: {invoice.currency} {Number(invoice.amount_paid ?? 0).toFixed(2)} · Balance: {invoice.currency} {balanceDue.toFixed(2)}
          </p>

          {balanceDue > 0 && (
            <form onSubmit={handlePayment} className="grid gap-3 sm:grid-cols-3 mb-6">
              <input type="number" step="0.01" min="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Amount" className="rounded-lg bg-slate-800 border border-white/10 px-3 py-2" required />
              <input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="Reference (optional)" className="rounded-lg bg-slate-800 border border-white/10 px-3 py-2" />
              <Button type="submit" disabled={actionLoading}>Record Payment</Button>
            </form>
          )}

          {invoice.payments && invoice.payments.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {invoice.payments.map((p) => (
                <li key={p.id} className="flex justify-between border-b border-white/5 py-2">
                  <span>{formatApiDate(p.paid_at, { dateStyle: 'medium' })} · {p.method}{p.reference ? ` · ${p.reference}` : ''}</span>
                  <span>{invoice.currency} {Number(p.amount).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500 text-sm">No payments recorded yet.</p>
          )}
        </motion.div>

        {error && <p className="text-red-300 text-sm">{error}</p>}
      </div>
    </div>
  );
};

export default ClientPortalPage;
