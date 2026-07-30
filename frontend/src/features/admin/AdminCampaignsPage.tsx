import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BookOpenCheck,
  Copy,
  Eye,
  MailCheck,
  MousePointerClick,
  Pause,
  Play,
  Plus,
  Send,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { growthService } from '../../api/growthService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toastError, toastSuccess } from '../../store/toastStore';
import type {
  AudiencePreview,
  Campaign,
  CampaignPerformance,
  Coupon,
  Playbook,
  SegmentDefinition,
} from '../../types/growth';
import { toPagination } from '../../types/growth';
import type { Pagination } from '../../types/admin';
import { Badge, Button, Card, Input, Modal, Tabs } from '../../components/ui';
import {
  ConfirmDialog,
  DataTable,
  FilterBar,
  PaginationBar,
  Panel,
  SearchInput,
  SelectFilter,
  StatCard,
  StatusBadge,
} from './components/AdminUI';
import { formatCurrency, formatDateTime, formatNumber, useDebounced } from './components/format';

const GOAL_OPTIONS = [
  { value: '', label: 'All goals' },
  { value: 'acquisition', label: 'Acquisition' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'retention', label: 'Retention' },
  { value: 'winback', label: 'Win-back' },
  { value: 'expansion', label: 'Expansion' },
  { value: 'dunning', label: 'Dunning' },
  { value: 'announcement', label: 'Announcement' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'active', label: 'Active (automation)' },
  { value: 'paused', label: 'Paused' },
  { value: 'sent', label: 'Sent' },
  { value: 'archived', label: 'Archived' },
];

const CHANNEL_OPTIONS = [
  { value: 'email', label: 'Email only' },
  { value: 'in_app', label: 'In-app only' },
  { value: 'both', label: 'Email + in-app' },
];

const MODE_OPTIONS = [
  { value: 'one_off', label: 'One-off blast' },
  { value: 'recurring', label: 'Recurring automation' },
];

const MERGE_TAGS = [
  '{{first_name}}',
  '{{organization_name}}',
  '{{plan_name}}',
  '{{context}}',
  '{{coupon_code}}',
  '{{discount}}',
];

interface CampaignForm {
  name: string;
  goal: string;
  segment_key: string;
  segment_config: Record<string, string>;
  channel: string;
  subject: string;
  body: string;
  cta_label: string;
  cta_url: string;
  coupon_id: string;
  mode: string;
  scheduled_at: string;
  interval_hours: string;
  cooldown_days: string;
  max_per_run: string;
  attribution_days: string;
}

const emptyForm = (segmentKey = 'all_paying'): CampaignForm => ({
  name: '',
  goal: 'engagement',
  segment_key: segmentKey,
  segment_config: {},
  channel: 'email',
  subject: '',
  body: '',
  cta_label: 'Open FlowTrack',
  cta_url: '',
  coupon_id: '',
  mode: 'one_off',
  scheduled_at: '',
  interval_hours: '24',
  cooldown_days: '30',
  max_per_run: '200',
  attribution_days: '30',
});

const AdminCampaignsPage = () => {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('campaigns');

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [performance, setPerformance] = useState<CampaignPerformance | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [goal, setGoal] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);

  const [segments, setSegments] = useState<SegmentDefinition[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState<CampaignForm>(emptyForm());
  const [audience, setAudience] = useState<AudiencePreview | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [sendTarget, setSendTarget] = useState<Campaign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [testTarget, setTestTarget] = useState<Campaign | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await growthService.getCampaigns({
        search: debouncedSearch,
        goal,
        status,
        page,
        per_page: 20,
      });
      setCampaigns(response.data.campaigns.data ?? []);
      setPagination(toPagination(response.data.campaigns.meta));
      setPerformance(response.data.performance);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load campaigns'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, goal, status, page]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const loadReferenceData = useCallback(async () => {
    try {
      const [segmentResponse, couponResponse, playbookResponse] = await Promise.all([
        growthService.getSegments(),
        growthService.getCoupons({ per_page: 100, status: 'active' }),
        growthService.getPlaybooks(),
      ]);
      setSegments(segmentResponse.data.definitions);
      setCoupons(couponResponse.data.coupons.data ?? []);
      setPlaybooks(playbookResponse.data);
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not load campaign options'));
    }
  }, []);

  useEffect(() => {
    void loadReferenceData();
  }, [loadReferenceData]);

  const selectedSegment = useMemo(
    () => segments.find((s) => s.key === form.segment_key) ?? null,
    [segments, form.segment_key],
  );

  const openEditor = (campaign: Campaign | null) => {
    setEditing(campaign);
    setAudience(null);
    if (campaign) {
      setForm({
        name: campaign.name,
        goal: campaign.goal,
        segment_key: campaign.segment_key,
        segment_config: Object.fromEntries(
          Object.entries(campaign.segment_config ?? {}).map(([k, v]) => [k, String(v)]),
        ),
        channel: campaign.channel,
        subject: campaign.subject,
        body: campaign.body,
        cta_label: campaign.cta_label ?? '',
        cta_url: campaign.cta_url ?? '',
        coupon_id: campaign.coupon_id ? String(campaign.coupon_id) : '',
        mode: campaign.mode,
        scheduled_at: campaign.scheduled_at ? campaign.scheduled_at.replace(' ', 'T').slice(0, 16) : '',
        interval_hours: String(campaign.interval_hours),
        cooldown_days: String(campaign.cooldown_days),
        max_per_run: String(campaign.max_per_run),
        attribution_days: String(campaign.attribution_days),
      });
    } else {
      setForm(emptyForm(searchParams.get('segment') ?? 'all_paying'));
    }
    setEditorOpen(true);
  };

  useEffect(() => {
    // Deep link from the growth page: /admin/campaigns?segment=churned_recent
    const preset = searchParams.get('segment');
    if (preset && segments.length > 0 && !editorOpen) {
      setForm(emptyForm(preset));
      setEditing(null);
      setEditorOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments.length]);

  const previewAudience = async () => {
    setAudienceLoading(true);
    try {
      const response = await growthService.previewAudience(form.segment_key, form.segment_config);
      setAudience(response.data);
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not preview the audience'));
    } finally {
      setAudienceLoading(false);
    }
  };

  const buildPayload = (): Record<string, unknown> => ({
    name: form.name,
    goal: form.goal,
    segment_key: form.segment_key,
    segment_config: form.segment_config,
    channel: form.channel,
    subject: form.subject,
    body: form.body,
    cta_label: form.cta_label || null,
    cta_url: form.cta_url || null,
    coupon_id: form.coupon_id ? Number(form.coupon_id) : null,
    mode: form.mode,
    scheduled_at: form.scheduled_at || null,
    status: form.scheduled_at ? 'scheduled' : undefined,
    interval_hours: Number(form.interval_hours),
    cooldown_days: Number(form.cooldown_days),
    max_per_run: Number(form.max_per_run),
    attribution_days: Number(form.attribution_days),
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await growthService.updateCampaign(editing.id, buildPayload());
        toastSuccess('Campaign updated');
      } else {
        await growthService.createCampaign(buildPayload());
        toastSuccess('Campaign created as a draft');
      }
      setEditorOpen(false);
      await loadCampaigns();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not save the campaign'));
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    if (!sendTarget) return;
    setBusy(true);
    try {
      const response = await growthService.sendCampaign(sendTarget.id);
      toastSuccess(
        `Sent ${response.data.sent} message(s)${response.data.skipped > 0 ? `, skipped ${response.data.skipped} in cooldown` : ''}`,
      );
      setSendTarget(null);
      await loadCampaigns();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Sending failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleStatus = async (campaign: Campaign, next: string) => {
    try {
      await growthService.setCampaignStatus(campaign.id, next);
      toastSuccess(`Campaign ${next === 'active' ? 'activated' : next}`);
      await loadCampaigns();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not change the status'));
    }
  };

  const handleDuplicate = async (campaign: Campaign) => {
    try {
      await growthService.duplicateCampaign(campaign.id);
      toastSuccess('Campaign duplicated');
      await loadCampaigns();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not duplicate'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await growthService.deleteCampaign(deleteTarget.id);
      toastSuccess('Campaign deleted');
      setDeleteTarget(null);
      await loadCampaigns();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not delete the campaign'));
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    if (!testTarget) return;
    setBusy(true);
    try {
      await growthService.sendCampaignTest(testTarget.id, testEmail);
      toastSuccess(`Test email sent to ${testEmail}`);
      setTestTarget(null);
      setTestEmail('');
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Test send failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleInstallPlaybook = async (playbook: Playbook) => {
    try {
      await growthService.installPlaybook(playbook.key);
      toastSuccess(`${playbook.name} installed as a draft`);
      setTab('campaigns');
      await loadCampaigns();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Could not install the playbook'));
    }
  };

  const installedPlaybookKeys = new Set(campaigns.map((c) => c.playbook_key).filter(Boolean));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { id: 'campaigns', label: 'Campaigns', count: pagination?.total },
            { id: 'playbooks', label: 'Playbooks', count: playbooks.length },
          ]}
          activeId={tab}
          onChange={setTab}
        />
        <Button size="sm" onClick={() => openEditor(null)}>
          <Plus size={14} />
          New campaign
        </Button>
      </div>

      {tab === 'campaigns' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              icon={MailCheck}
              label="Messages sent"
              value={formatNumber(performance?.sent ?? 0)}
              hint={`${performance?.open_rate ?? 0}% open rate`}
            />
            <StatCard
              icon={MousePointerClick}
              label="Clicks"
              value={formatNumber(performance?.clicked ?? 0)}
              hint={`${performance?.click_rate ?? 0}% click rate`}
            />
            <StatCard
              icon={Target}
              label="Conversions"
              value={formatNumber(performance?.converted ?? 0)}
              hint={`${performance?.conversion_rate ?? 0}% of sends`}
              tone="positive"
            />
            <StatCard
              icon={TrendingUp}
              label="Attributed revenue"
              value={formatCurrency(performance?.revenue ?? 0)}
              hint="Payments within the attribution window"
              tone="positive"
            />
          </div>

          <Panel title="Campaigns" description="One-off blasts and always-on lifecycle automations.">
            <FilterBar>
              <SearchInput value={search} onChange={setSearch} placeholder="Search campaigns…" />
              <SelectFilter value={goal} onChange={setGoal} options={GOAL_OPTIONS} label="Goal" />
              <SelectFilter value={status} onChange={setStatus} options={STATUS_OPTIONS} label="Status" />
            </FilterBar>

            {error ? (
              <p className="text-sm text-rose-300 py-6 text-center">{error}</p>
            ) : (
              <>
                <DataTable
                  columns={[
                    {
                      key: 'name',
                      header: 'Campaign',
                      render: (row: Campaign) => (
                        <div className="min-w-0">
                          <Link
                            to={`/admin/campaigns/${row.id}`}
                            className="font-medium text-white hover:text-primary-300 truncate block"
                          >
                            {row.name}
                          </Link>
                          <p className="text-xs text-slate-500 truncate">
                            {row.goal} · {row.segment_key.replace(/_/g, ' ')}
                            {row.coupon_code ? ` · ${row.coupon_code}` : ''}
                          </p>
                        </div>
                      ),
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      render: (row: Campaign) => (
                        <div className="space-y-1">
                          <StatusBadge status={row.status} />
                          <p className="text-[11px] text-slate-500">
                            {row.mode === 'recurring' ? `Every ${row.interval_hours}h` : 'One-off'}
                          </p>
                        </div>
                      ),
                    },
                    {
                      key: 'sent',
                      header: 'Sent',
                      align: 'right' as const,
                      render: (row: Campaign) => (
                        <div>
                          <p className="tabular-nums text-white">{formatNumber(row.total_sent)}</p>
                          {row.total_failed > 0 && (
                            <p className="text-[11px] text-rose-300 tabular-nums">{row.total_failed} failed</p>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'engagement',
                      header: 'Open / Click',
                      align: 'right' as const,
                      render: (row: Campaign) => (
                        <span className="tabular-nums text-slate-300">
                          {row.open_rate}% / {row.click_rate}%
                        </span>
                      ),
                    },
                    {
                      key: 'revenue',
                      header: 'Revenue',
                      align: 'right' as const,
                      render: (row: Campaign) => (
                        <div>
                          <p className="font-semibold text-emerald-300 tabular-nums">
                            {formatCurrency(row.converted_revenue)}
                          </p>
                          <p className="text-[11px] text-slate-500">{row.total_converted} conversions</p>
                        </div>
                      ),
                    },
                    {
                      key: 'run',
                      header: 'Last run',
                      render: (row: Campaign) => (
                        <div>
                          <p className="text-xs text-slate-300">{formatDateTime(row.last_run_at)}</p>
                          {row.next_run_at && (
                            <p className="text-[11px] text-slate-500">Next {formatDateTime(row.next_run_at)}</p>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'actions',
                      header: '',
                      align: 'right' as const,
                      render: (row: Campaign) => (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setSendTarget(row)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                            title="Send now"
                          >
                            <Send size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTestTarget(row);
                              setTestEmail('');
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                            title="Send test email"
                          >
                            <Eye size={14} />
                          </button>
                          {row.mode === 'recurring' && (
                            <button
                              type="button"
                              onClick={() => void handleStatus(row, row.status === 'active' ? 'paused' : 'active')}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-500/10"
                              title={row.status === 'active' ? 'Pause automation' : 'Activate automation'}
                            >
                              {row.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditor(row)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                            title="Edit"
                          >
                            <Sparkles size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDuplicate(row)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                            title="Duplicate"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(row)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ),
                    },
                  ]}
                  rows={campaigns}
                  isLoading={loading}
                  rowKey={(row) => row.id}
                  emptyMessage="No campaigns yet. Install a playbook or create one from scratch."
                />
                <PaginationBar pagination={pagination} onPageChange={setPage} />
              </>
            )}
          </Panel>
        </>
      )}

      {tab === 'playbooks' && (
        <div className="space-y-4">
          <Card className="flex items-start gap-3">
            <BookOpenCheck size={20} className="text-primary-300 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white">Ready-made lifecycle campaigns</p>
              <p className="text-xs text-slate-400 mt-1">
                Each playbook installs as a draft with copy, segment and schedule filled in. Review it, attach a coupon
                if it's an offer, then activate. Recurring ones keep catching new accounts as they enter the segment —
                schedule <code className="text-slate-300">php spark marketing:run-campaigns</code> every 15 minutes.
              </p>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {playbooks.map((playbook) => {
              const installed = installedPlaybookKeys.has(playbook.key);
              return (
                <Card key={playbook.key} className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{playbook.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {playbook.segment_key.replace(/_/g, ' ')} ·{' '}
                        {playbook.mode === 'recurring' ? `every ${playbook.interval_hours}h` : 'one-off'} ·{' '}
                        {playbook.channel.replace('_', '-')}
                      </p>
                    </div>
                    <Badge variant={installed ? 'success' : 'default'}>{installed ? 'Installed' : playbook.goal}</Badge>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <p className="text-xs font-semibold text-slate-200">{playbook.subject}</p>
                    <p className="text-[11px] text-slate-500 mt-1.5 line-clamp-3 whitespace-pre-line">{playbook.body}</p>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant={installed ? 'secondary' : 'primary'}
                      disabled={installed}
                      onClick={() => void handleInstallPlaybook(playbook)}
                    >
                      {installed ? 'Already installed' : 'Install playbook'}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ editor */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? `Edit “${editing.name}”` : 'New campaign'}
        size="full"
      >
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <Input
              label="Campaign name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Win-back — cancelled in the last 45 days"
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400 ml-1">Goal</label>
                <SelectFilter
                  value={form.goal}
                  onChange={(v) => setForm((f) => ({ ...f, goal: v }))}
                  options={GOAL_OPTIONS.filter((o) => o.value !== '')}
                  className="w-full"
                  label="Goal"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400 ml-1">Channel</label>
                <SelectFilter
                  value={form.channel}
                  onChange={(v) => setForm((f) => ({ ...f, channel: v }))}
                  options={CHANNEL_OPTIONS}
                  className="w-full"
                  label="Channel"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400 ml-1">Audience segment</label>
              <SelectFilter
                value={form.segment_key}
                onChange={(v) => setForm((f) => ({ ...f, segment_key: v, segment_config: {} }))}
                options={segments.map((s) => ({ value: s.key, label: s.label }))}
                className="w-full"
                label="Segment"
              />
              {selectedSegment && <p className="text-xs text-slate-500 ml-1">{selectedSegment.description}</p>}
            </div>

            {selectedSegment && selectedSegment.config.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {selectedSegment.config.map((field) => (
                  <Input
                    key={field.key}
                    label={field.label}
                    type="number"
                    min={field.min}
                    max={field.max}
                    value={form.segment_config[field.key] ?? String(field.default)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        segment_config: { ...f.segment_config, [field.key]: e.target.value },
                      }))
                    }
                  />
                ))}
              </div>
            )}

            <Input
              label="Subject line"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="Come back to FlowTrack — {{discount}}"
            />

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400 ml-1">Message</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={9}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-primary-500/50"
                placeholder={'Hi {{first_name}},\n\n…'}
              />
              <div className="flex flex-wrap gap-1.5">
                {MERGE_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, body: `${f.body}${tag}` }))}
                    className="text-[11px] px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:border-primary-500/30"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Button label"
                value={form.cta_label}
                onChange={(e) => setForm((f) => ({ ...f, cta_label: e.target.value }))}
              />
              <Input
                label="Button URL"
                value={form.cta_url}
                onChange={(e) => setForm((f) => ({ ...f, cta_url: e.target.value }))}
                placeholder="https://app.flowtrack.com/billing"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400 ml-1">Attach an offer (optional)</label>
              <SelectFilter
                value={form.coupon_id}
                onChange={(v) => setForm((f) => ({ ...f, coupon_id: v }))}
                options={[
                  { value: '', label: 'No coupon' },
                  ...coupons.map((c) => ({ value: String(c.id), label: `${c.code} — ${c.discount_label}` })),
                ]}
                className="w-full"
                label="Coupon"
              />
              <p className="text-xs text-slate-500 ml-1">
                The code and discount are injected wherever you use {'{{coupon_code}}'} or {'{{discount}}'}, plus an
                offer box in the email.
              </p>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <Card className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">Audience</p>
                <Button size="sm" variant="secondary" isLoading={audienceLoading} onClick={() => void previewAudience()}>
                  Preview
                </Button>
              </div>
              {audience ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-white/5 py-2">
                      <p className="text-lg font-bold text-white tabular-nums">{formatNumber(audience.organizations)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Accounts</p>
                    </div>
                    <div className="rounded-xl bg-white/5 py-2">
                      <p className="text-lg font-bold text-white tabular-nums">{formatNumber(audience.recipients)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Contacts</p>
                    </div>
                    <div className="rounded-xl bg-white/5 py-2">
                      <p className="text-lg font-bold text-emerald-300 tabular-nums">{formatCurrency(audience.mrr)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">MRR</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {audience.sample.map((person) => (
                      <div
                        key={`${person.user_id}-${person.organization_id}`}
                        className="text-xs rounded-lg bg-white/[0.03] px-3 py-2"
                      >
                        <p className="text-slate-200 truncate">{person.email}</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {person.organization_name}
                          {person.context ? ` · ${person.context}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500">
                  Preview to see how many accounts match and a sample of recipients before you send.
                </p>
              )}
            </Card>

            <Card className="space-y-3">
              <p className="text-sm font-semibold text-white">Delivery</p>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 ml-1">Mode</label>
                <SelectFilter
                  value={form.mode}
                  onChange={(v) => setForm((f) => ({ ...f, mode: v }))}
                  options={MODE_OPTIONS}
                  className="w-full"
                  label="Mode"
                />
              </div>

              {form.mode === 'one_off' ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-400 ml-1">Schedule (leave empty to send manually)</label>
                  <input
                    type="datetime-local"
                    value={form.scheduled_at}
                    onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
              ) : (
                <Input
                  label="Run every (hours)"
                  type="number"
                  min={1}
                  value={form.interval_hours}
                  onChange={(e) => setForm((f) => ({ ...f, interval_hours: e.target.value }))}
                />
              )}

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Cooldown (days)"
                  type="number"
                  min={0}
                  value={form.cooldown_days}
                  onChange={(e) => setForm((f) => ({ ...f, cooldown_days: e.target.value }))}
                />
                <Input
                  label="Max per run"
                  type="number"
                  min={1}
                  value={form.max_per_run}
                  onChange={(e) => setForm((f) => ({ ...f, max_per_run: e.target.value }))}
                />
              </div>
              <Input
                label="Attribution window (days)"
                type="number"
                min={1}
                value={form.attribution_days}
                onChange={(e) => setForm((f) => ({ ...f, attribution_days: e.target.value }))}
              />
              <p className="text-[11px] text-slate-500">
                Cooldown stops the same person hearing this campaign twice too soon. Payments inside the attribution
                window are credited to the campaign.
              </p>
            </Card>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-white/10">
          <Button variant="secondary" size="sm" onClick={() => setEditorOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            isLoading={saving}
            disabled={form.name === '' || form.subject === '' || form.body === ''}
            onClick={() => void handleSave()}
          >
            {editing ? 'Save changes' : 'Create campaign'}
          </Button>
        </div>
      </Modal>

      {/* ----------------------------------------------------------- dialogs */}
      <ConfirmDialog
        open={sendTarget !== null}
        title={`Send “${sendTarget?.name ?? ''}” now?`}
        description={
          <div className="space-y-2">
            <p>
              This emails everyone currently in the{' '}
              <span className="text-white">{sendTarget?.segment_key.replace(/_/g, ' ')}</span> segment (up to{' '}
              {sendTarget?.max_per_run} recipients this run).
            </p>
            <p className="text-xs text-slate-500">
              Anyone contacted by this campaign in the last {sendTarget?.cooldown_days} days is skipped automatically.
            </p>
          </div>
        }
        confirmLabel="Send now"
        isLoading={busy}
        onConfirm={() => void handleSend()}
        onClose={() => setSendTarget(null)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete “${deleteTarget?.name ?? ''}”?`}
        description="The campaign and its send history will be removed. Attributed revenue reporting for it is lost."
        confirmLabel="Delete campaign"
        destructive
        isLoading={busy}
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteTarget(null)}
      />

      <Modal open={testTarget !== null} onClose={() => setTestTarget(null)} title="Send a test email" size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            The message is rendered with data from a real account in the segment, so merge tags are filled in. Tracking
            is disabled for tests.
          </p>
          <Input
            label="Send to"
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="you@company.com"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setTestTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" isLoading={busy} disabled={!testEmail.includes('@')} onClick={() => void handleTest()}>
              Send test
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminCampaignsPage;
