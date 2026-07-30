import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowLeft,
  Clock,
  DollarSign,
  MailCheck,
  MousePointerClick,
  Send,
  Target,
  Users,
} from 'lucide-react';
import { growthService } from '../../api/growthService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toastError, toastSuccess } from '../../store/toastStore';
import type { CampaignDetail } from '../../types/growth';
import { Badge, Button, Card } from '../../components/ui';
import { DataTable, KeyValueList, Panel, StatCard, StatusBadge } from './components/AdminUI';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from './components/format';

const CHART_TOOLTIP = {
  background: '#12141C',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  color: '#fff',
  fontSize: 12,
} as const;

const AdminCampaignDetailPage = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await growthService.getCampaign(Number(campaignId));
      setDetail(response.data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load the campaign'));
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSend = async () => {
    if (!campaignId) return;
    setBusy(true);
    try {
      const response = await growthService.sendCampaign(Number(campaignId));
      toastSuccess(`Sent ${response.data.sent} message(s)`);
      await load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Sending failed'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/5" />
        ))}
      </div>
    );
  }

  if (error || !detail) {
    return (
      <Card className="text-center py-12">
        <p className="text-sm text-rose-300">{error ?? 'Campaign not found'}</p>
        <Link to="/admin/campaigns">
          <Button size="sm" variant="secondary" className="mt-4">
            Back to campaigns
          </Button>
        </Link>
      </Card>
    );
  }

  const { campaign, timeline, recent_sends: sends } = detail;
  const chart = timeline.map((row) => ({ ...row, label: formatDate(row.day) }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Link
            to="/admin/campaigns"
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-white truncate">{campaign.name}</h2>
              <StatusBadge status={campaign.status} />
              <Badge variant="default">{campaign.goal}</Badge>
              {campaign.coupon_code && <Badge variant="info">{campaign.coupon_code}</Badge>}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {campaign.segment_key.replace(/_/g, ' ')} ·{' '}
              {campaign.mode === 'recurring' ? `runs every ${campaign.interval_hours}h` : 'one-off send'}
            </p>
          </div>
        </div>
        <Button size="sm" isLoading={busy} onClick={() => void handleSend()}>
          <Send size={14} />
          Send now
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard icon={Users} label="Audience reached" value={formatNumber(campaign.total_sent)} hint={`${formatNumber(campaign.total_failed)} failed`} />
        <StatCard icon={MailCheck} label="Opens" value={`${campaign.open_rate}%`} hint={`${formatNumber(campaign.total_opened)} opened`} />
        <StatCard
          icon={MousePointerClick}
          label="Clicks"
          value={`${campaign.click_rate}%`}
          hint={`${formatNumber(campaign.total_clicked)} clicked`}
        />
        <StatCard
          icon={Target}
          label="Conversions"
          value={`${campaign.conversion_rate}%`}
          hint={`${formatNumber(campaign.total_converted)} paid after this`}
          tone="positive"
        />
        <StatCard
          icon={DollarSign}
          label="Attributed revenue"
          value={formatCurrency(campaign.converted_revenue)}
          hint={`${campaign.attribution_days}-day window`}
          tone="positive"
        />
      </div>

      <Panel title="Engagement over time" description="Sends, opens, clicks and conversions per day.">
        {chart.length === 0 ? (
          <p className="text-sm text-slate-500 py-10 text-center">Nothing sent yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chart}>
              <defs>
                <linearGradient id="campaignSends" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={CHART_TOOLTIP} />
              <Area type="monotone" dataKey="sent" name="Sent" stroke="#6366f1" fill="url(#campaignSends)" />
              <Area type="monotone" dataKey="opened" name="Opened" stroke="#22c55e" fillOpacity={0} />
              <Area type="monotone" dataKey="clicked" name="Clicked" stroke="#f59e0b" fillOpacity={0} />
              <Area type="monotone" dataKey="converted" name="Converted" stroke="#ec4899" fillOpacity={0} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel title="Message" description="Exactly what recipients receive, before merge tags are filled in.">
          <div className="space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Subject</p>
              <p className="text-sm text-white">{campaign.subject}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Body</p>
              <p className="text-sm text-slate-300 whitespace-pre-line">{campaign.body}</p>
            </div>
            {campaign.cta_url && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Call to action</p>
                <p className="text-sm text-primary-300">
                  {campaign.cta_label} → {campaign.cta_url}
                </p>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Configuration" description="Targeting and delivery settings." className="xl:col-span-2">
          <KeyValueList
            items={[
              { label: 'Segment', value: campaign.segment_key.replace(/_/g, ' ') },
              {
                label: 'Segment thresholds',
                value:
                  Object.keys(campaign.segment_config ?? {}).length === 0
                    ? 'Defaults'
                    : Object.entries(campaign.segment_config)
                        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
                        .join(', '),
              },
              { label: 'Channel', value: campaign.channel.replace('_', '-') },
              { label: 'Mode', value: campaign.mode === 'recurring' ? `Every ${campaign.interval_hours}h` : 'One-off' },
              { label: 'Cooldown', value: `${campaign.cooldown_days} days` },
              { label: 'Max per run', value: formatNumber(campaign.max_per_run) },
              { label: 'Attribution window', value: `${campaign.attribution_days} days` },
              { label: 'Coupon', value: campaign.coupon_code ?? 'None' },
              { label: 'Scheduled for', value: formatDateTime(campaign.scheduled_at) },
              { label: 'Last run', value: formatDateTime(campaign.last_run_at) },
              { label: 'Next run', value: formatDateTime(campaign.next_run_at) },
              { label: 'Created', value: formatDateTime(campaign.created_at) },
            ]}
          />
        </Panel>
      </div>

      <Panel
        title="Recent sends"
        description="Per-recipient delivery and engagement for the last 100 messages."
        action={
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Clock size={12} />
            newest first
          </span>
        }
      >
        <DataTable
          columns={[
            {
              key: 'recipient',
              header: 'Recipient',
              render: (row: CampaignDetail['recent_sends'][number]) => (
                <div className="min-w-0">
                  <p className="text-slate-200 truncate">{row.email ?? '—'}</p>
                  {row.organization_id ? (
                    <Link
                      to={`/admin/organizations/${row.organization_id}`}
                      className="text-xs text-slate-500 hover:text-primary-300 truncate block"
                    >
                      {row.organization_name ?? `Org #${row.organization_id}`}
                    </Link>
                  ) : (
                    <p className="text-xs text-slate-500">—</p>
                  )}
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (row: CampaignDetail['recent_sends'][number]) => (
                <div className="space-y-1">
                  <StatusBadge status={row.status} />
                  {row.error && (
                    <p className="text-[11px] text-rose-300/80 max-w-[200px] truncate" title={row.error}>
                      {row.error}
                    </p>
                  )}
                </div>
              ),
            },
            {
              key: 'sent',
              header: 'Sent',
              render: (row: CampaignDetail['recent_sends'][number]) => (
                <span className="text-xs text-slate-400">{formatDateTime(row.sent_at)}</span>
              ),
            },
            {
              key: 'engagement',
              header: 'Engagement',
              render: (row: CampaignDetail['recent_sends'][number]) => (
                <div className="flex items-center gap-2">
                  <Badge variant={row.opened_at ? 'success' : 'default'}>{row.opened_at ? 'Opened' : 'No open'}</Badge>
                  {row.clicked_at && <Badge variant="info">Clicked</Badge>}
                </div>
              ),
            },
            {
              key: 'conversion',
              header: 'Conversion',
              align: 'right' as const,
              render: (row: CampaignDetail['recent_sends'][number]) =>
                row.converted_at ? (
                  <div>
                    <p className="text-emerald-300 font-semibold tabular-nums">
                      {formatCurrency(row.conversion_amount)}
                    </p>
                    <p className="text-[11px] text-slate-500">{formatDate(row.converted_at)}</p>
                  </div>
                ) : (
                  <span className="text-slate-600">—</span>
                ),
            },
          ]}
          rows={sends}
          isLoading={false}
          rowKey={(row) => row.id}
          emptyMessage="No sends recorded for this campaign yet."
        />
      </Panel>
    </div>
  );
};

export default AdminCampaignDetailPage;
