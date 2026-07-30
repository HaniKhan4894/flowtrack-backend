<?php

namespace App\Services\Admin;

use App\Models\MarketingCampaignModel;
use App\Models\MarketingCampaignSendModel;
use App\Models\PlatformCouponModel;
use App\Services\EmailService;
use App\Services\NotificationService;
use CodeIgniter\Database\BaseConnection;

/**
 * Lifecycle marketing engine: builds an audience from a growth segment, renders
 * a templated message, delivers it over email and/or in-app notification, and
 * tracks opens, clicks and revenue attribution.
 */
class MarketingCampaignService
{
    use AdminAuditTrail;

    protected BaseConnection $db;
    protected MarketingCampaignModel $campaigns;
    protected MarketingCampaignSendModel $sends;
    protected GrowthSegmentService $segments;
    protected PlatformCouponModel $coupons;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
        $this->campaigns = new MarketingCampaignModel();
        $this->sends = new MarketingCampaignSendModel();
        $this->segments = new GrowthSegmentService();
        $this->coupons = new PlatformCouponModel();
    }

    /**
     * @param array<string, mixed> $filters
     */
    public function list(array $filters = []): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = min(100, max(5, (int) ($filters['per_page'] ?? 20)));

        $builder = $this->db->table('marketing_campaigns c')
            ->select('c.*, cp.code AS coupon_code, cp.name AS coupon_name', false)
            ->join('platform_coupons cp', 'cp.id = c.coupon_id', 'left');

        if (!empty($filters['status'])) {
            $builder->where('c.status', (string) $filters['status']);
        }

        if (!empty($filters['goal'])) {
            $builder->where('c.goal', (string) $filters['goal']);
        }

        if (!empty($filters['search'])) {
            $builder->like('c.name', trim((string) $filters['search']));
        }

        $total = (clone $builder)->countAllResults(false);

        $rows = $builder
            ->orderBy('c.updated_at', 'DESC')
            ->limit($perPage, ($page - 1) * $perPage)
            ->get()
            ->getResultArray();

        return [
            'data' => array_map([$this, 'present'], $rows),
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / $perPage),
            ],
        ];
    }

    public function detail(int $campaignId): array
    {
        $campaign = $this->db->table('marketing_campaigns c')
            ->select('c.*, cp.code AS coupon_code, cp.name AS coupon_name', false)
            ->join('platform_coupons cp', 'cp.id = c.coupon_id', 'left')
            ->where('c.id', $campaignId)
            ->get()
            ->getRowArray();

        if (!$campaign) {
            throw new \RuntimeException('Campaign not found');
        }

        $timeline = $this->db->query("
            SELECT DATE(sent_at) AS day,
                   COUNT(*) AS sent,
                   SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened,
                   SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) AS clicked,
                   SUM(CASE WHEN converted_at IS NOT NULL THEN 1 ELSE 0 END) AS converted,
                   COALESCE(SUM(conversion_amount), 0) AS revenue
            FROM marketing_campaign_sends
            WHERE campaign_id = ? AND sent_at IS NOT NULL
            GROUP BY DATE(sent_at)
            ORDER BY day ASC
        ", [$campaignId])->getResultArray();

        $recent = $this->db->table('marketing_campaign_sends s')
            ->select('s.*, o.name AS organization_name', false)
            ->join('organizations o', 'o.id = s.organization_id', 'left')
            ->where('s.campaign_id', $campaignId)
            ->orderBy('s.id', 'DESC')
            ->limit(100)
            ->get()
            ->getResultArray();

        return [
            'campaign' => $this->present($campaign),
            'timeline' => array_map(static fn (array $row): array => [
                'day' => $row['day'],
                'sent' => (int) $row['sent'],
                'opened' => (int) $row['opened'],
                'clicked' => (int) $row['clicked'],
                'converted' => (int) $row['converted'],
                'revenue' => round((float) $row['revenue'], 2),
            ], $timeline),
            'recent_sends' => array_map(static fn (array $row): array => [
                'id' => (int) $row['id'],
                'organization_id' => $row['organization_id'] === null ? null : (int) $row['organization_id'],
                'organization_name' => $row['organization_name'],
                'email' => $row['email'],
                'status' => $row['status'],
                'channel' => $row['channel'],
                'error' => $row['error'],
                'sent_at' => $row['sent_at'],
                'opened_at' => $row['opened_at'],
                'clicked_at' => $row['clicked_at'],
                'converted_at' => $row['converted_at'],
                'conversion_amount' => round((float) $row['conversion_amount'], 2),
            ], $recent),
        ];
    }

    /**
     * @param array<string, mixed> $data
     */
    public function create(array $data, int $adminUserId): array
    {
        $payload = $this->normalize($data, true);
        $payload['created_by'] = $adminUserId;

        $campaignId = (int) $this->campaigns->insert($payload, true);

        $this->recordAdminAction($adminUserId, 'campaign.create', 'marketing_campaign', $campaignId, [
            'name' => $payload['name'],
            'segment_key' => $payload['segment_key'],
            'status' => $payload['status'] ?? 'draft',
        ]);

        return $this->present($this->campaigns->find($campaignId));
    }

    /**
     * @param array<string, mixed> $data
     */
    public function update(int $campaignId, array $data, int $adminUserId): array
    {
        if (!$this->campaigns->find($campaignId)) {
            throw new \RuntimeException('Campaign not found');
        }

        $payload = $this->normalize($data, false);
        if ($payload !== []) {
            $this->campaigns->update($campaignId, $payload);
        }

        $this->recordAdminAction($adminUserId, 'campaign.update', 'marketing_campaign', $campaignId, $payload);

        return $this->present($this->campaigns->find($campaignId));
    }

    public function delete(int $campaignId, int $adminUserId): void
    {
        $campaign = $this->campaigns->find($campaignId);
        if (!$campaign) {
            throw new \RuntimeException('Campaign not found');
        }

        $this->campaigns->delete($campaignId);
        $this->db->table('marketing_campaign_sends')->where('campaign_id', $campaignId)->delete();

        $this->recordAdminAction($adminUserId, 'campaign.delete', 'marketing_campaign', $campaignId, [
            'name' => $campaign['name'],
        ]);
    }

    public function duplicate(int $campaignId, int $adminUserId): array
    {
        $campaign = $this->campaigns->find($campaignId);
        if (!$campaign) {
            throw new \RuntimeException('Campaign not found');
        }

        unset($campaign['id']);
        $copy = array_merge($campaign, [
            'name' => $campaign['name'] . ' (copy)',
            'status' => 'draft',
            'is_playbook' => 0,
            'playbook_key' => null,
            'scheduled_at' => null,
            'next_run_at' => null,
            'last_run_at' => null,
            'total_recipients' => 0,
            'total_sent' => 0,
            'total_failed' => 0,
            'total_opened' => 0,
            'total_clicked' => 0,
            'total_converted' => 0,
            'converted_revenue' => 0,
            'created_by' => $adminUserId,
        ]);

        $newId = (int) $this->campaigns->insert($copy, true);
        $this->recordAdminAction($adminUserId, 'campaign.duplicate', 'marketing_campaign', $newId, ['source_id' => $campaignId]);

        return $this->present($this->campaigns->find($newId));
    }

    /**
     * Audience size plus a sample of who would receive it.
     *
     * @param array<string, mixed> $config
     */
    public function previewAudience(string $segmentKey, array $config = [], int $sampleSize = 10): array
    {
        if (!$this->segments->hasSegment($segmentKey)) {
            throw new \RuntimeException('Unknown segment');
        }

        $stats = $this->segments->stats($segmentKey, $config);
        $sample = $this->segments->recipients($segmentKey, $config, max(1, min(50, $sampleSize)));

        return [
            'organizations' => $stats['organizations'],
            'recipients' => $stats['recipients'],
            'mrr' => $stats['mrr'],
            'sample' => array_slice($sample, 0, $sampleSize),
        ];
    }

    /**
     * Send a rendered preview to one address without touching campaign stats.
     */
    public function sendTest(int $campaignId, string $email, int $adminUserId): array
    {
        $campaign = $this->campaigns->find($campaignId);
        if (!$campaign) {
            throw new \RuntimeException('Campaign not found');
        }

        $sample = $this->segments->recipients($campaign['segment_key'], $this->decodeConfig($campaign), 1);
        $recipient = $sample[0] ?? [
            'first_name' => 'there',
            'organization_name' => 'Acme Inc',
            'plan_name' => 'Pro',
            'context' => 'Sample context',
            'organization_id' => null,
            'user_id' => null,
            'email' => $email,
            'mrr' => 0,
        ];

        $coupon = $this->campaignCoupon($campaign);
        $rendered = $this->render($campaign, $recipient, $coupon, 'preview');
        $sent = (new EmailService())->sendSimpleEmail($email, '[TEST] ' . $rendered['subject'], $rendered['body']);

        $this->recordAdminAction($adminUserId, 'campaign.test_send', 'marketing_campaign', $campaignId, ['email' => $email]);

        return ['sent' => $sent, 'email' => $email];
    }

    /**
     * Dispatch a campaign now. Used both by the admin "send" button and the CLI runner.
     *
     * @return array{recipients: int, sent: int, failed: int, skipped: int}
     */
    public function dispatch(int $campaignId, ?int $adminUserId = null): array
    {
        $campaign = $this->campaigns->find($campaignId);
        if (!$campaign) {
            throw new \RuntimeException('Campaign not found');
        }

        if (in_array($campaign['status'], ['archived'], true)) {
            throw new \RuntimeException('Archived campaigns cannot be sent');
        }

        $this->campaigns->update($campaignId, ['status' => 'sending']);

        $config = $this->decodeConfig($campaign);
        $maxPerRun = max(1, (int) ($campaign['max_per_run'] ?? 200));
        $recipients = $this->segments->recipients($campaign['segment_key'], $config, $maxPerRun * 3);
        $coupon = $this->campaignCoupon($campaign);

        $emailService = new EmailService();
        $notificationService = new NotificationService();
        $channel = $campaign['channel'] ?? 'email';

        $sent = 0;
        $failed = 0;
        $skipped = 0;

        foreach ($recipients as $recipient) {
            if ($sent + $failed >= $maxPerRun) {
                break;
            }

            if ($this->recentlyContacted($campaignId, (int) $recipient['user_id'], (int) ($campaign['cooldown_days'] ?? 30))) {
                $skipped++;
                continue;
            }

            $token = bin2hex(random_bytes(16));
            $rendered = $this->render($campaign, $recipient, $coupon, $token);

            $emailOk = true;
            $error = null;

            if ($channel === 'email' || $channel === 'both') {
                try {
                    $emailOk = $emailService->sendSimpleEmail((string) $recipient['email'], $rendered['subject'], $rendered['body']);
                    if (!$emailOk) {
                        $error = 'SMTP rejected the message';
                    }
                } catch (\Throwable $e) {
                    $emailOk = false;
                    $error = substr($e->getMessage(), 0, 500);
                }
            }

            if ($channel === 'in_app' || $channel === 'both') {
                try {
                    $notificationService->create(
                        (int) $recipient['user_id'],
                        'info',
                        $rendered['subject'],
                        $rendered['plain'],
                        [
                            'type' => 'marketing_campaign',
                            'campaign_id' => $campaignId,
                            'cta_url' => $rendered['cta_url'],
                            'coupon_code' => $coupon['code'] ?? null,
                        ]
                    );
                } catch (\Throwable $e) {
                    log_message('error', 'Campaign in-app notification failed: ' . $e->getMessage());
                }
            }

            $this->sends->insert([
                'campaign_id' => $campaignId,
                'organization_id' => $recipient['organization_id'] ?? null,
                'user_id' => $recipient['user_id'] ?? null,
                'email' => $recipient['email'] ?? null,
                'token' => $token,
                'status' => $emailOk ? 'sent' : 'failed',
                'channel' => $channel,
                'error' => $error,
                'sent_at' => $emailOk ? date('Y-m-d H:i:s') : null,
            ]);

            $emailOk ? $sent++ : $failed++;
        }

        $isRecurring = ($campaign['mode'] ?? 'one_off') === 'recurring';
        $interval = max(1, (int) ($campaign['interval_hours'] ?? 24));

        $this->campaigns->update($campaignId, [
            'status' => $isRecurring ? 'active' : 'sent',
            'last_run_at' => date('Y-m-d H:i:s'),
            'next_run_at' => $isRecurring ? date('Y-m-d H:i:s', time() + ($interval * 3600)) : null,
            'total_recipients' => (int) $campaign['total_recipients'] + count($recipients),
            'total_sent' => (int) $campaign['total_sent'] + $sent,
            'total_failed' => (int) $campaign['total_failed'] + $failed,
            'scheduled_at' => $isRecurring ? $campaign['scheduled_at'] : null,
        ]);

        if ($adminUserId !== null) {
            $this->recordAdminAction($adminUserId, 'campaign.dispatch', 'marketing_campaign', $campaignId, [
                'sent' => $sent,
                'failed' => $failed,
                'skipped' => $skipped,
            ]);
        }

        return [
            'recipients' => count($recipients),
            'sent' => $sent,
            'failed' => $failed,
            'skipped' => $skipped,
        ];
    }

    /**
     * Process every campaign that is due (called by `marketing:run-campaigns`).
     *
     * @return list<array<string, mixed>>
     */
    public function runDue(int $limit = 20): array
    {
        $results = [];

        foreach ($this->campaigns->due($limit) as $campaign) {
            try {
                $result = $this->dispatch((int) $campaign['id']);
                $results[] = array_merge(['campaign_id' => (int) $campaign['id'], 'name' => $campaign['name']], $result);
            } catch (\Throwable $e) {
                log_message('error', 'Campaign run failed (' . $campaign['id'] . '): ' . $e->getMessage());
                $results[] = [
                    'campaign_id' => (int) $campaign['id'],
                    'name' => $campaign['name'],
                    'error' => $e->getMessage(),
                ];
            }
        }

        return $results;
    }

    public function setStatus(int $campaignId, string $status, int $adminUserId): array
    {
        $allowed = ['draft', 'scheduled', 'active', 'paused', 'archived'];
        if (!in_array($status, $allowed, true)) {
            throw new \RuntimeException('Invalid status');
        }

        $campaign = $this->campaigns->find($campaignId);
        if (!$campaign) {
            throw new \RuntimeException('Campaign not found');
        }

        $payload = ['status' => $status];

        if ($status === 'active' && ($campaign['mode'] ?? 'one_off') === 'recurring') {
            $payload['next_run_at'] = date('Y-m-d H:i:s');
        }

        if ($status === 'paused') {
            $payload['next_run_at'] = null;
        }

        $this->campaigns->update($campaignId, $payload);
        $this->recordAdminAction($adminUserId, 'campaign.status', 'marketing_campaign', $campaignId, $payload);

        return $this->present($this->campaigns->find($campaignId));
    }

    public function recordOpen(string $token): void
    {
        $send = $this->sends->findByToken($token);
        if (!$send) {
            return;
        }

        $first = empty($send['opened_at']);

        $this->sends->update($send['id'], [
            'opened_at' => $send['opened_at'] ?: date('Y-m-d H:i:s'),
            'open_count' => (int) $send['open_count'] + 1,
        ]);

        if ($first) {
            $this->db->query(
                'UPDATE marketing_campaigns SET total_opened = total_opened + 1 WHERE id = ?',
                [$send['campaign_id']]
            );
        }
    }

    /**
     * @return string Destination URL to redirect to.
     */
    public function recordClick(string $token, ?string $encodedUrl): string
    {
        $send = $this->sends->findByToken($token);
        $fallback = rtrim((string) (env('app.frontendURL') ?? 'http://localhost:5173'), '/');

        $destination = $fallback;
        if ($encodedUrl !== null && $encodedUrl !== '') {
            $decoded = base64_decode(strtr($encodedUrl, '-_', '+/'), true);
            if (is_string($decoded) && filter_var($decoded, FILTER_VALIDATE_URL)) {
                $destination = $decoded;
            }
        }

        if (!$send) {
            return $destination;
        }

        $first = empty($send['clicked_at']);

        $this->sends->update($send['id'], [
            'clicked_at' => $send['clicked_at'] ?: date('Y-m-d H:i:s'),
            'click_count' => (int) $send['click_count'] + 1,
            'opened_at' => $send['opened_at'] ?: date('Y-m-d H:i:s'),
        ]);

        if ($first) {
            $this->db->query(
                'UPDATE marketing_campaigns SET total_clicked = total_clicked + 1 WHERE id = ?',
                [$send['campaign_id']]
            );
        }

        return $destination;
    }

    /**
     * Ready-made lifecycle campaigns an admin can install with one click.
     *
     * @return list<array<string, mixed>>
     */
    public function playbooks(): array
    {
        $frontend = rtrim((string) (env('app.frontendURL') ?? 'http://localhost:5173'), '/');

        return [
            [
                'key' => 'trial_ending_nudge',
                'name' => 'Trial ending — add payment method',
                'goal' => 'retention',
                'segment_key' => 'trial_ending',
                'segment_config' => ['days' => 3],
                'mode' => 'recurring',
                'interval_hours' => 24,
                'cooldown_days' => 30,
                'channel' => 'both',
                'subject' => 'Your FlowTrack trial ends in a few days',
                'body' => "Hi {{first_name}},\n\nYour trial for {{organization_name}} wraps up soon ({{context}}). Teams that keep tracking after the trial save hours of admin work every week.\n\nAdd a payment method now and nothing pauses — your data, projects and reports stay exactly where they are.",
                'cta_label' => 'Keep my account active',
                'cta_url' => $frontend . '/billing',
            ],
            [
                'key' => 'onboarding_no_activity',
                'name' => 'Onboarding — no time tracked yet',
                'goal' => 'onboarding',
                'segment_key' => 'trial_no_activity',
                'segment_config' => ['days' => 2],
                'mode' => 'recurring',
                'interval_hours' => 24,
                'cooldown_days' => 21,
                'channel' => 'both',
                'subject' => 'Track your first hour in FlowTrack (takes 60 seconds)',
                'body' => "Hi {{first_name}},\n\n{{organization_name}} is set up, but no time has been tracked yet. The fastest way to see value: start a timer on any task and let it run while you work.\n\nWe'll turn it into timesheets, project costs and client invoices automatically.",
                'cta_label' => 'Start my first timer',
                'cta_url' => $frontend . '/dashboard',
            ],
            [
                'key' => 'invite_team_nudge',
                'name' => 'Activation — invite your team',
                'goal' => 'onboarding',
                'segment_key' => 'solo_no_team',
                'segment_config' => ['days' => 5],
                'mode' => 'recurring',
                'interval_hours' => 72,
                'cooldown_days' => 45,
                'channel' => 'email',
                'subject' => 'FlowTrack works best with your team on board',
                'body' => "Hi {{first_name}},\n\nRight now {{organization_name}} is a team of one. Once teammates join, you get team timesheets, approval flows and a single view of where the week actually went.\n\nInviting someone takes about 20 seconds.",
                'cta_label' => 'Invite my team',
                'cta_url' => $frontend . '/team',
            ],
            [
                'key' => 'dunning_payment_failed',
                'name' => 'Dunning — payment failed',
                'goal' => 'dunning',
                'segment_key' => 'past_due',
                'segment_config' => [],
                'mode' => 'recurring',
                'interval_hours' => 48,
                'cooldown_days' => 7,
                'channel' => 'both',
                'subject' => 'Action needed: your last FlowTrack payment failed',
                'body' => "Hi {{first_name}},\n\nWe couldn't process the latest payment for {{organization_name}} ({{context}}). Cards expire, banks decline — it usually takes one minute to fix.\n\nUpdate your payment details to keep {{plan_name}} features switched on for your team.",
                'cta_label' => 'Update payment method',
                'cta_url' => $frontend . '/billing',
            ],
            [
                'key' => 'at_risk_checkin',
                'name' => 'Retention — quiet account check-in',
                'goal' => 'retention',
                'segment_key' => 'at_risk_dormant',
                'segment_config' => ['days' => 14],
                'mode' => 'recurring',
                'interval_hours' => 168,
                'cooldown_days' => 45,
                'channel' => 'email',
                'subject' => 'Everything OK with {{organization_name}}?',
                'body' => "Hi {{first_name}},\n\nI noticed {{organization_name}} has been quiet lately ({{context}}). If something got in the way — setup, a missing integration, a feature you expected — I'd genuinely like to know.\n\nReply to this email and a real person will read it. If it's easier, jump back in and pick up where you left off.",
                'cta_label' => 'Open FlowTrack',
                'cta_url' => $frontend . '/dashboard',
            ],
            [
                'key' => 'winback_recent_churn',
                'name' => 'Win-back — recently cancelled (with offer)',
                'goal' => 'winback',
                'segment_key' => 'churned_recent',
                'segment_config' => ['days' => 45],
                'mode' => 'recurring',
                'interval_hours' => 168,
                'cooldown_days' => 60,
                'channel' => 'email',
                'subject' => 'Come back to FlowTrack — {{discount}}',
                'body' => "Hi {{first_name}},\n\nYou cancelled {{organization_name}} a little while ago, and we've shipped a lot since then.\n\nIf you'd like another look, here's {{discount}} — use code {{coupon_code}} at checkout. Your old projects, clients and history are still waiting.",
                'cta_label' => 'Reactivate with my discount',
                'cta_url' => $frontend . '/billing',
            ],
            [
                'key' => 'winback_long_gone',
                'name' => 'Win-back — long gone customers',
                'goal' => 'winback',
                'segment_key' => 'churned_long',
                'segment_config' => ['days' => 120],
                'mode' => 'one_off',
                'interval_hours' => 720,
                'cooldown_days' => 120,
                'channel' => 'email',
                'subject' => 'A lot has changed in FlowTrack since you left',
                'body' => "Hi {{first_name}},\n\nIt's been {{context}} since {{organization_name}} stopped using FlowTrack. Since then we've added smarter reporting, automations and a much faster desktop app.\n\nIf tracking time is still a headache, {{discount}} with code {{coupon_code}} should make trying again easy.",
                'cta_label' => 'See what is new',
                'cta_url' => $frontend . '/billing',
            ],
            [
                'key' => 'expansion_power_users',
                'name' => 'Expansion — power users',
                'goal' => 'expansion',
                'segment_key' => 'power_users',
                'segment_config' => ['hours' => 100],
                'mode' => 'recurring',
                'interval_hours' => 336,
                'cooldown_days' => 90,
                'channel' => 'email',
                'subject' => 'You are getting a lot out of FlowTrack — here is more',
                'body' => "Hi {{first_name}},\n\n{{organization_name}} tracked {{context}}. That puts you among our most active teams.\n\nTeams at your usage level usually benefit from advanced reporting, automations and priority support on a higher plan. Happy to walk you through what would actually help.",
                'cta_label' => 'Compare plans',
                'cta_url' => $frontend . '/billing',
            ],
            [
                'key' => 'upgrade_seat_limit',
                'name' => 'Expansion — near seat limit',
                'goal' => 'expansion',
                'segment_key' => 'seat_limit_near',
                'segment_config' => ['threshold_percent' => 80],
                'mode' => 'recurring',
                'interval_hours' => 168,
                'cooldown_days' => 60,
                'channel' => 'both',
                'subject' => 'You are running out of seats on {{plan_name}}',
                'body' => "Hi {{first_name}},\n\n{{organization_name}} is using {{context}}. Once you hit the cap, new teammates can't be added.\n\nUpgrading takes one click and prorates automatically, so you only pay the difference for the rest of this cycle.",
                'cta_label' => 'Add more seats',
                'cta_url' => $frontend . '/billing',
            ],
            [
                'key' => 'free_to_paid',
                'name' => 'Acquisition — free plan upgrade nudge',
                'goal' => 'acquisition',
                'segment_key' => 'free_plan_engaged',
                'segment_config' => ['hours' => 10],
                'mode' => 'recurring',
                'interval_hours' => 336,
                'cooldown_days' => 60,
                'channel' => 'email',
                'subject' => 'Unlock the reports your team keeps asking for',
                'body' => "Hi {{first_name}},\n\n{{organization_name}} has tracked {{context}} on the free plan — clearly it's working.\n\nPaid plans unlock screenshots, advanced reports, invoicing and integrations. Here's {{discount}} to make the switch easy: {{coupon_code}}.",
                'cta_label' => 'See paid plans',
                'cta_url' => $frontend . '/billing',
            ],
            [
                'key' => 'annual_switch',
                'name' => 'Expansion — switch to annual billing',
                'goal' => 'expansion',
                'segment_key' => 'monthly_to_annual',
                'segment_config' => ['months' => 3],
                'mode' => 'one_off',
                'interval_hours' => 720,
                'cooldown_days' => 180,
                'channel' => 'email',
                'subject' => 'Pay yearly and save on FlowTrack',
                'body' => "Hi {{first_name}},\n\n{{organization_name}} has been with us {{context}} — thank you.\n\nSwitching to annual billing cuts your effective monthly rate and means one invoice instead of twelve. Nothing else changes.",
                'cta_label' => 'Switch to annual',
                'cta_url' => $frontend . '/billing',
            ],
        ];
    }

    public function installPlaybook(string $key, int $adminUserId, ?int $couponId = null): array
    {
        $playbook = null;
        foreach ($this->playbooks() as $candidate) {
            if ($candidate['key'] === $key) {
                $playbook = $candidate;
                break;
            }
        }

        if ($playbook === null) {
            throw new \RuntimeException('Unknown playbook');
        }

        $existing = $this->campaigns->where('playbook_key', $key)->first();
        if ($existing) {
            throw new \RuntimeException('That playbook is already installed');
        }

        $campaignId = (int) $this->campaigns->insert([
            'name' => $playbook['name'],
            'goal' => $playbook['goal'],
            'segment_key' => $playbook['segment_key'],
            'segment_config' => json_encode($playbook['segment_config']),
            'channel' => $playbook['channel'],
            'subject' => $playbook['subject'],
            'body' => $playbook['body'],
            'cta_label' => $playbook['cta_label'],
            'cta_url' => $playbook['cta_url'],
            'coupon_id' => $couponId,
            'status' => 'draft',
            'mode' => $playbook['mode'],
            'interval_hours' => $playbook['interval_hours'],
            'cooldown_days' => $playbook['cooldown_days'],
            'is_playbook' => 1,
            'playbook_key' => $key,
            'created_by' => $adminUserId,
        ], true);

        $this->recordAdminAction($adminUserId, 'campaign.playbook_install', 'marketing_campaign', $campaignId, ['playbook' => $key]);

        return $this->present($this->campaigns->find($campaignId));
    }

    /**
     * Aggregate performance across all campaigns, for the growth dashboard.
     */
    public function performanceSummary(): array
    {
        $row = $this->db->query("
            SELECT
                COUNT(*) AS campaigns,
                COALESCE(SUM(total_sent), 0) AS sent,
                COALESCE(SUM(total_opened), 0) AS opened,
                COALESCE(SUM(total_clicked), 0) AS clicked,
                COALESCE(SUM(total_converted), 0) AS converted,
                COALESCE(SUM(converted_revenue), 0) AS revenue
            FROM marketing_campaigns
        ")->getRowArray() ?: [];

        $byGoal = $this->db->query("
            SELECT goal,
                   COUNT(*) AS campaigns,
                   COALESCE(SUM(total_sent), 0) AS sent,
                   COALESCE(SUM(total_opened), 0) AS opened,
                   COALESCE(SUM(total_clicked), 0) AS clicked,
                   COALESCE(SUM(total_converted), 0) AS converted,
                   COALESCE(SUM(converted_revenue), 0) AS revenue
            FROM marketing_campaigns
            GROUP BY goal
            ORDER BY revenue DESC
        ")->getResultArray();

        $sent = (int) ($row['sent'] ?? 0);

        return [
            'campaigns' => (int) ($row['campaigns'] ?? 0),
            'sent' => $sent,
            'opened' => (int) ($row['opened'] ?? 0),
            'clicked' => (int) ($row['clicked'] ?? 0),
            'converted' => (int) ($row['converted'] ?? 0),
            'revenue' => round((float) ($row['revenue'] ?? 0), 2),
            'open_rate' => $sent > 0 ? round(((int) $row['opened'] / $sent) * 100, 1) : 0.0,
            'click_rate' => $sent > 0 ? round(((int) $row['clicked'] / $sent) * 100, 1) : 0.0,
            'conversion_rate' => $sent > 0 ? round(((int) $row['converted'] / $sent) * 100, 1) : 0.0,
            'by_goal' => array_map(static function (array $goal): array {
                $goalSent = (int) $goal['sent'];

                return [
                    'goal' => $goal['goal'],
                    'campaigns' => (int) $goal['campaigns'],
                    'sent' => $goalSent,
                    'opened' => (int) $goal['opened'],
                    'clicked' => (int) $goal['clicked'],
                    'converted' => (int) $goal['converted'],
                    'revenue' => round((float) $goal['revenue'], 2),
                    'open_rate' => $goalSent > 0 ? round(((int) $goal['opened'] / $goalSent) * 100, 1) : 0.0,
                    'conversion_rate' => $goalSent > 0 ? round(((int) $goal['converted'] / $goalSent) * 100, 1) : 0.0,
                ];
            }, $byGoal),
        ];
    }

    private function recentlyContacted(int $campaignId, int $userId, int $cooldownDays): bool
    {
        if ($userId <= 0 || $cooldownDays <= 0) {
            return false;
        }

        return $this->db->table('marketing_campaign_sends')
            ->where('campaign_id', $campaignId)
            ->where('user_id', $userId)
            ->where('sent_at >=', date('Y-m-d H:i:s', time() - ($cooldownDays * 86400)))
            ->countAllResults() > 0;
    }

    /**
     * @param array<string, mixed> $campaign
     * @param array<string, mixed> $recipient
     * @param array<string, mixed>|null $coupon
     * @return array{subject: string, body: string, plain: string, cta_url: string}
     */
    private function render(array $campaign, array $recipient, ?array $coupon, string $token): array
    {
        $firstName = trim((string) ($recipient['first_name'] ?? '')) ?: 'there';
        $ctaUrl = (string) ($campaign['cta_url'] ?? '');

        $tokens = [
            '{{first_name}}' => $firstName,
            '{{last_name}}' => (string) ($recipient['last_name'] ?? ''),
            '{{email}}' => (string) ($recipient['email'] ?? ''),
            '{{organization_name}}' => (string) ($recipient['organization_name'] ?? 'your team'),
            '{{plan_name}}' => (string) ($recipient['plan_name'] ?? 'your plan'),
            '{{context}}' => (string) ($recipient['context'] ?? ''),
            '{{coupon_code}}' => (string) ($coupon['code'] ?? ''),
            '{{discount}}' => (string) ($coupon['discount_label'] ?? 'a special offer'),
        ];

        $subject = strtr((string) $campaign['subject'], $tokens);
        $bodyText = strtr((string) $campaign['body'], $tokens);

        $trackedCta = $ctaUrl === '' ? '' : $this->trackedUrl($token, $ctaUrl);
        $bodyHtml = '<p>' . nl2br(esc($bodyText)) . '</p>';

        if ($coupon !== null && !empty($coupon['code'])) {
            $bodyHtml .= "
                <div style='margin:20px 0;padding:16px;border:1px dashed #38bdf8;border-radius:12px;text-align:center;background:#0b1220;'>
                    <div style='font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7dd3fc;'>Your offer</div>
                    <div style='font-size:24px;font-weight:700;color:#f8fafc;margin:6px 0;'>" . esc($coupon['code']) . "</div>
                    <div style='font-size:13px;color:#94a3b8;'>" . esc($coupon['discount_label']) . "</div>
                </div>";
        }

        if ($trackedCta !== '') {
            $label = esc((string) ($campaign['cta_label'] ?: 'Open FlowTrack'));
            $bodyHtml .= "
                <p style='margin:24px 0 8px;'>
                    <a href='" . esc($trackedCta, 'attr') . "'
                       style='display:inline-block;padding:12px 22px;border-radius:10px;background:#2563eb;color:#fff;font-weight:600;text-decoration:none;'>
                        {$label}
                    </a>
                </p>";
        }

        if ($token !== 'preview') {
            $bodyHtml .= "<img src='" . esc($this->pixelUrl($token), 'attr') . "' width='1' height='1' alt='' style='display:none' />";
        }

        return [
            'subject' => $subject,
            'body' => $bodyHtml,
            'plain' => mb_substr($bodyText, 0, 500),
            'cta_url' => $trackedCta ?: $ctaUrl,
        ];
    }

    private function trackedUrl(string $token, string $destination): string
    {
        if ($token === 'preview') {
            return $destination;
        }

        $encoded = rtrim(strtr(base64_encode($destination), '+/', '-_'), '=');

        return $this->apiBase() . 'api/v1/track/click/' . $token . '?u=' . $encoded;
    }

    private function pixelUrl(string $token): string
    {
        return $this->apiBase() . 'api/v1/track/open/' . $token . '.gif';
    }

    private function apiBase(): string
    {
        $base = (string) (env('app.baseURL') ?: 'http://localhost:8080/');

        return rtrim($base, '/') . '/';
    }

    /**
     * @param array<string, mixed> $campaign
     * @return array<string, mixed>|null
     */
    private function campaignCoupon(array $campaign): ?array
    {
        if (empty($campaign['coupon_id'])) {
            return null;
        }

        $coupon = $this->coupons->find((int) $campaign['coupon_id']);
        if (!$coupon) {
            return null;
        }

        $label = $coupon['discount_type'] === 'percent'
            ? rtrim(rtrim(number_format((float) $coupon['percent_off'], 2, '.', ''), '0'), '.') . '% off'
            : strtoupper((string) $coupon['currency']) . ' ' . number_format((float) $coupon['amount_off'], 2) . ' off';

        if ($coupon['duration'] === 'repeating') {
            $label .= ' for ' . (int) $coupon['duration_in_months'] . ' months';
        } elseif ($coupon['duration'] === 'forever') {
            $label .= ' forever';
        }

        return [
            'code' => $coupon['code'],
            'discount_label' => $label,
        ];
    }

    /**
     * @param array<string, mixed> $campaign
     * @return array<string, mixed>
     */
    private function decodeConfig(array $campaign): array
    {
        if (empty($campaign['segment_config'])) {
            return [];
        }

        $decoded = json_decode((string) $campaign['segment_config'], true);

        return is_array($decoded) ? $decoded : [];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function normalize(array $data, bool $isCreate): array
    {
        $payload = [];

        foreach (['name', 'subject', 'body', 'cta_label', 'cta_url'] as $field) {
            if ($isCreate || array_key_exists($field, $data)) {
                $value = $data[$field] ?? null;
                $payload[$field] = $value === null || $value === '' ? null : (string) $value;
            }
        }

        if ($isCreate) {
            foreach (['name', 'subject', 'body'] as $required) {
                if (empty($payload[$required])) {
                    throw new \RuntimeException(ucfirst($required) . ' is required');
                }
            }
        }

        if ($isCreate || array_key_exists('segment_key', $data)) {
            $segment = (string) ($data['segment_key'] ?? '');
            if (!$this->segments->hasSegment($segment)) {
                throw new \RuntimeException('Unknown segment: ' . $segment);
            }
            $payload['segment_key'] = $segment;
        }

        if (array_key_exists('segment_config', $data)) {
            $config = $data['segment_config'];
            $payload['segment_config'] = empty($config) ? null : json_encode(array_map('strval', (array) $config));
        }

        if ($isCreate || array_key_exists('goal', $data)) {
            $payload['goal'] = in_array($data['goal'] ?? '', ['acquisition', 'onboarding', 'engagement', 'retention', 'winback', 'expansion', 'dunning', 'announcement'], true)
                ? $data['goal']
                : 'engagement';
        }

        if ($isCreate || array_key_exists('channel', $data)) {
            $payload['channel'] = in_array($data['channel'] ?? '', ['email', 'in_app', 'both'], true)
                ? $data['channel']
                : 'email';
        }

        if ($isCreate || array_key_exists('mode', $data)) {
            $payload['mode'] = ($data['mode'] ?? 'one_off') === 'recurring' ? 'recurring' : 'one_off';
        }

        if (array_key_exists('coupon_id', $data)) {
            $payload['coupon_id'] = empty($data['coupon_id']) ? null : (int) $data['coupon_id'];
        }

        if (array_key_exists('status', $data)) {
            $payload['status'] = in_array($data['status'], ['draft', 'scheduled', 'active', 'paused', 'archived'], true)
                ? $data['status']
                : 'draft';
        }

        if (array_key_exists('scheduled_at', $data)) {
            $payload['scheduled_at'] = empty($data['scheduled_at'])
                ? null
                : date('Y-m-d H:i:s', strtotime((string) $data['scheduled_at']));
        }

        foreach ([
            'interval_hours' => [1, 8760, 24],
            'cooldown_days' => [0, 720, 30],
            'max_per_run' => [1, 5000, 200],
            'attribution_days' => [1, 180, 30],
        ] as $field => [$min, $max, $default]) {
            if (array_key_exists($field, $data)) {
                $payload[$field] = max($min, min($max, (int) ($data[$field] ?: $default)));
            }
        }

        return $payload;
    }

    /**
     * @return array<string, mixed>
     */
    private function present(array $row): array
    {
        $sent = (int) ($row['total_sent'] ?? 0);

        return [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'goal' => $row['goal'],
            'segment_key' => $row['segment_key'],
            'segment_config' => $this->decodeConfig($row),
            'channel' => $row['channel'],
            'subject' => $row['subject'],
            'body' => $row['body'],
            'cta_label' => $row['cta_label'],
            'cta_url' => $row['cta_url'],
            'coupon_id' => $row['coupon_id'] === null ? null : (int) $row['coupon_id'],
            'coupon_code' => $row['coupon_code'] ?? null,
            'coupon_name' => $row['coupon_name'] ?? null,
            'status' => $row['status'],
            'mode' => $row['mode'],
            'scheduled_at' => $row['scheduled_at'],
            'interval_hours' => (int) $row['interval_hours'],
            'cooldown_days' => (int) $row['cooldown_days'],
            'max_per_run' => (int) $row['max_per_run'],
            'attribution_days' => (int) $row['attribution_days'],
            'last_run_at' => $row['last_run_at'],
            'next_run_at' => $row['next_run_at'],
            'total_recipients' => (int) $row['total_recipients'],
            'total_sent' => $sent,
            'total_failed' => (int) $row['total_failed'],
            'total_opened' => (int) $row['total_opened'],
            'total_clicked' => (int) $row['total_clicked'],
            'total_converted' => (int) $row['total_converted'],
            'converted_revenue' => round((float) $row['converted_revenue'], 2),
            'open_rate' => $sent > 0 ? round(((int) $row['total_opened'] / $sent) * 100, 1) : 0.0,
            'click_rate' => $sent > 0 ? round(((int) $row['total_clicked'] / $sent) * 100, 1) : 0.0,
            'conversion_rate' => $sent > 0 ? round(((int) $row['total_converted'] / $sent) * 100, 1) : 0.0,
            'is_playbook' => (bool) ($row['is_playbook'] ?? false),
            'playbook_key' => $row['playbook_key'] ?? null,
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
        ];
    }
}
