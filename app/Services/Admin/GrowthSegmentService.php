<?php

namespace App\Services\Admin;

use CodeIgniter\Database\BaseConnection;

/**
 * Lifecycle segments used to target campaigns.
 *
 * Every segment resolves to a set of organizations plus the humans worth
 * emailing (owners and admins). Thresholds are configurable per campaign so the
 * same segment can be reused with different aggressiveness.
 */
class GrowthSegmentService
{
    protected BaseConnection $db;

    /** Roles that receive lifecycle email on behalf of an organization. */
    private const DECISION_MAKER_ROLES = ['owner', 'admin'];

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    /**
     * Segment catalogue for the campaign editor.
     *
     * @return list<array<string, mixed>>
     */
    public function definitions(): array
    {
        return [
            [
                'key' => 'trial_ending',
                'label' => 'Trials ending soon',
                'description' => 'Trial accounts whose trial expires within the next few days.',
                'goal' => 'retention',
                'config' => [['key' => 'days', 'label' => 'Days until trial ends', 'default' => 3, 'min' => 1, 'max' => 30]],
            ],
            [
                'key' => 'trial_no_activity',
                'label' => 'Trials with no activity',
                'description' => 'Trial accounts that signed up but never tracked any time.',
                'goal' => 'onboarding',
                'config' => [['key' => 'days', 'label' => 'Days since signup', 'default' => 3, 'min' => 1, 'max' => 60]],
            ],
            [
                'key' => 'trial_expired_unconverted',
                'label' => 'Expired trials (never paid)',
                'description' => 'Trials that ran out without converting to a paid plan.',
                'goal' => 'winback',
                'config' => [['key' => 'days', 'label' => 'Expired within last N days', 'default' => 30, 'min' => 1, 'max' => 365]],
            ],
            [
                'key' => 'past_due',
                'label' => 'Payment failed / past due',
                'description' => 'Paying accounts whose latest charge failed — recover before they churn.',
                'goal' => 'dunning',
                'config' => [],
            ],
            [
                'key' => 'churned_recent',
                'label' => 'Recently churned',
                'description' => 'Cancelled inside the win-back sweet spot.',
                'goal' => 'winback',
                'config' => [['key' => 'days', 'label' => 'Cancelled within last N days', 'default' => 45, 'min' => 1, 'max' => 365]],
            ],
            [
                'key' => 'churned_long',
                'label' => 'Long-gone customers',
                'description' => 'Cancelled a while ago — worth a bigger offer.',
                'goal' => 'winback',
                'config' => [['key' => 'days', 'label' => 'Cancelled more than N days ago', 'default' => 90, 'min' => 30, 'max' => 720]],
            ],
            [
                'key' => 'at_risk_dormant',
                'label' => 'At risk: paying but dormant',
                'description' => 'Active paid accounts with no tracked time recently — the strongest churn signal.',
                'goal' => 'retention',
                'config' => [['key' => 'days', 'label' => 'Days without activity', 'default' => 14, 'min' => 3, 'max' => 120]],
            ],
            [
                'key' => 'usage_drop',
                'label' => 'At risk: usage dropping',
                'description' => 'Paying accounts whose tracked hours fell sharply versus the previous period.',
                'goal' => 'retention',
                'config' => [
                    ['key' => 'days', 'label' => 'Comparison window (days)', 'default' => 14, 'min' => 7, 'max' => 90],
                    ['key' => 'drop_percent', 'label' => 'Minimum drop %', 'default' => 40, 'min' => 10, 'max' => 95],
                ],
            ],
            [
                'key' => 'power_users',
                'label' => 'Power users (expansion)',
                'description' => 'Highly engaged paying teams — ideal for upsell and referral asks.',
                'goal' => 'expansion',
                'config' => [['key' => 'hours', 'label' => 'Minimum hours in last 30 days', 'default' => 100, 'min' => 10, 'max' => 2000]],
            ],
            [
                'key' => 'seat_limit_near',
                'label' => 'Near seat limit',
                'description' => 'Teams close to their plan seat cap — upgrade before they hit a wall.',
                'goal' => 'expansion',
                'config' => [['key' => 'threshold_percent', 'label' => 'Seat usage % threshold', 'default' => 80, 'min' => 50, 'max' => 100]],
            ],
            [
                'key' => 'free_plan_engaged',
                'label' => 'Free plan, actively using',
                'description' => 'Free accounts getting real value — the best upgrade candidates.',
                'goal' => 'acquisition',
                'config' => [['key' => 'hours', 'label' => 'Minimum hours in last 30 days', 'default' => 10, 'min' => 1, 'max' => 500]],
            ],
            [
                'key' => 'new_signups',
                'label' => 'New signups',
                'description' => 'Freshly created organizations — onboarding sequence.',
                'goal' => 'onboarding',
                'config' => [['key' => 'days', 'label' => 'Signed up in last N days', 'default' => 7, 'min' => 1, 'max' => 90]],
            ],
            [
                'key' => 'solo_no_team',
                'label' => 'Solo (no team invited)',
                'description' => 'Accounts that never invited a teammate — activation blocker.',
                'goal' => 'onboarding',
                'config' => [['key' => 'days', 'label' => 'Days since signup', 'default' => 7, 'min' => 1, 'max' => 180]],
            ],
            [
                'key' => 'monthly_to_annual',
                'label' => 'Monthly payers (annual upsell)',
                'description' => 'Established monthly customers who would save by switching to yearly.',
                'goal' => 'expansion',
                'config' => [['key' => 'months', 'label' => 'Minimum months subscribed', 'default' => 3, 'min' => 1, 'max' => 36]],
            ],
            [
                'key' => 'all_paying',
                'label' => 'All paying customers',
                'description' => 'Every active paid subscription.',
                'goal' => 'engagement',
                'config' => [],
            ],
            [
                'key' => 'all_organizations',
                'label' => 'Everyone',
                'description' => 'All active organizations, any plan or status.',
                'goal' => 'announcement',
                'config' => [],
            ],
        ];
    }

    public function hasSegment(string $key): bool
    {
        foreach ($this->definitions() as $definition) {
            if ($definition['key'] === $key) {
                return true;
            }
        }

        return false;
    }

    /**
     * Live size of every segment, for the growth dashboard.
     *
     * @return list<array<string, mixed>>
     */
    public function overview(): array
    {
        $out = [];

        foreach ($this->definitions() as $definition) {
            try {
                $stats = $this->stats($definition['key'], $this->defaultConfig($definition));
            } catch (\Throwable $e) {
                log_message('error', 'Segment count failed for ' . $definition['key'] . ': ' . $e->getMessage());
                $stats = ['organizations' => 0, 'recipients' => 0, 'mrr' => 0.0];
            }

            $out[] = array_merge($definition, $stats);
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $config
     * @return array{organizations: int, recipients: int, mrr: float}
     */
    public function stats(string $key, array $config = []): array
    {
        $segment = $this->segmentSql($key, $config);

        $row = $this->db->query(
            "SELECT COUNT(*) AS organizations, COALESCE(SUM(mrr), 0) AS mrr FROM ({$segment['sql']}) seg",
            $segment['params']
        )->getRowArray() ?: [];

        $recipients = $this->db->query(
            "SELECT COUNT(DISTINCT CONCAT(u.id, '-', seg.organization_id)) AS total
             FROM ({$segment['sql']}) seg
             INNER JOIN organizations o ON o.id = seg.organization_id
             INNER JOIN organization_members om ON om.organization_id = seg.organization_id
             INNER JOIN users u ON u.id = om.user_id
             WHERE (om.role IN " . $this->roleList() . " OR u.id = o.owner_id)
               AND u.deleted_at IS NULL AND u.is_active = 1 AND u.email IS NOT NULL",
            $segment['params']
        )->getRowArray() ?: [];

        return [
            'organizations' => (int) ($row['organizations'] ?? 0),
            'recipients' => (int) ($recipients['total'] ?? 0),
            'mrr' => round((float) ($row['mrr'] ?? 0), 2),
        ];
    }

    /**
     * Resolve the humans to contact for a segment.
     *
     * @param array<string, mixed> $config
     * @return list<array<string, mixed>>
     */
    public function recipients(string $key, array $config = [], int $limit = 500): array
    {
        $segment = $this->segmentSql($key, $config);
        $limit = max(1, min(5000, $limit));

        $rows = $this->db->query(
            "SELECT DISTINCT
                seg.organization_id, seg.plan_name, seg.mrr, seg.context,
                o.name AS organization_name,
                u.id AS user_id, u.email, u.first_name, u.last_name
             FROM ({$segment['sql']}) seg
             INNER JOIN organizations o ON o.id = seg.organization_id
             INNER JOIN organization_members om ON om.organization_id = seg.organization_id
             INNER JOIN users u ON u.id = om.user_id
             WHERE (om.role IN " . $this->roleList() . " OR u.id = o.owner_id)
               AND u.deleted_at IS NULL AND u.is_active = 1 AND u.email IS NOT NULL
             ORDER BY seg.mrr DESC, seg.organization_id ASC
             LIMIT {$limit}",
            $segment['params']
        )->getResultArray();

        return array_map(static fn (array $row): array => [
            'organization_id' => (int) $row['organization_id'],
            'organization_name' => $row['organization_name'],
            'plan_name' => $row['plan_name'],
            'mrr' => round((float) $row['mrr'], 2),
            'context' => $row['context'],
            'user_id' => (int) $row['user_id'],
            'email' => $row['email'],
            'first_name' => $row['first_name'],
            'last_name' => $row['last_name'],
        ], $rows);
    }

    /**
     * Organization-level preview (one row per account) for the growth tables.
     *
     * @param array<string, mixed> $config
     * @return list<array<string, mixed>>
     */
    public function organizations(string $key, array $config = [], int $limit = 100): array
    {
        $segment = $this->segmentSql($key, $config);
        $limit = max(1, min(500, $limit));

        $rows = $this->db->query(
            "SELECT seg.organization_id, seg.plan_name, seg.mrr, seg.context,
                    o.name AS organization_name, o.created_at AS organization_created_at,
                    (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = seg.organization_id) AS members,
                    (SELECT u.email FROM users u WHERE u.id = o.owner_id) AS owner_email,
                    (SELECT COALESCE(SUM(te.duration_seconds), 0) FROM time_entries te
                       WHERE te.organization_id = seg.organization_id
                         AND te.started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS seconds_30d,
                    (SELECT MAX(te.started_at) FROM time_entries te
                       WHERE te.organization_id = seg.organization_id) AS last_activity_at,
                    (SELECT COALESCE(SUM(pp.amount - pp.amount_refunded), 0) FROM platform_payments pp
                       WHERE pp.organization_id = seg.organization_id AND pp.status IN ('paid','partially_refunded')) AS lifetime_value
             FROM ({$segment['sql']}) seg
             INNER JOIN organizations o ON o.id = seg.organization_id
             ORDER BY seg.mrr DESC, seg.organization_id ASC
             LIMIT {$limit}",
            $segment['params']
        )->getResultArray();

        return array_map(static fn (array $row): array => [
            'organization_id' => (int) $row['organization_id'],
            'organization_name' => $row['organization_name'],
            'owner_email' => $row['owner_email'],
            'plan_name' => $row['plan_name'],
            'mrr' => round((float) $row['mrr'], 2),
            'context' => $row['context'],
            'members' => (int) $row['members'],
            'hours_30d' => round(((float) $row['seconds_30d']) / 3600, 1),
            'last_activity_at' => $row['last_activity_at'],
            'lifetime_value' => round((float) $row['lifetime_value'], 2),
            'created_at' => $row['organization_created_at'],
        ], $rows);
    }

    /**
     * @param array<string, mixed> $definition
     * @return array<string, mixed>
     */
    private function defaultConfig(array $definition): array
    {
        $config = [];
        foreach ($definition['config'] as $field) {
            $config[$field['key']] = $field['default'];
        }

        return $config;
    }

    /**
     * Each segment yields: organization_id, plan_name, mrr, context.
     *
     * @param array<string, mixed> $config
     * @return array{sql: string, params: list<mixed>}
     */
    private function segmentSql(string $key, array $config): array
    {
        $base = "
            FROM organization_subscriptions os
            INNER JOIN organizations o ON o.id = os.organization_id AND o.is_active = 1
            LEFT JOIN plans p ON p.id = os.plan_id
        ";
        $mrr = "CASE WHEN os.billing_cycle = 'yearly' THEN os.amount / 12 ELSE os.amount END";

        switch ($key) {
            case 'trial_ending':
                $days = $this->intConfig($config, 'days', 3, 1, 30);

                return [
                    'sql' => "SELECT os.organization_id, p.name AS plan_name, {$mrr} AS mrr,
                                     CONCAT('Trial ends ', DATE_FORMAT(os.trial_ends_at, '%b %e')) AS context
                              {$base}
                              WHERE os.status = 'trial'
                                AND os.trial_ends_at IS NOT NULL
                                AND os.trial_ends_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? DAY)",
                    'params' => [$days],
                ];

            case 'trial_no_activity':
                $days = $this->intConfig($config, 'days', 3, 1, 60);

                return [
                    'sql' => "SELECT os.organization_id, p.name AS plan_name, {$mrr} AS mrr,
                                     'No time tracked yet' AS context
                              {$base}
                              WHERE os.status = 'trial'
                                AND o.created_at <= DATE_SUB(NOW(), INTERVAL ? DAY)
                                AND NOT EXISTS (
                                    SELECT 1 FROM time_entries te WHERE te.organization_id = os.organization_id
                                )",
                    'params' => [$days],
                ];

            case 'trial_expired_unconverted':
                $days = $this->intConfig($config, 'days', 30, 1, 365);

                return [
                    'sql' => "SELECT os.organization_id, p.name AS plan_name, 0 AS mrr,
                                     CONCAT('Trial expired ', DATE_FORMAT(os.trial_ends_at, '%b %e')) AS context
                              {$base}
                              WHERE os.status IN ('trial', 'expired', 'cancelled')
                                AND os.trial_ends_at IS NOT NULL
                                AND os.trial_ends_at < NOW()
                                AND os.trial_ends_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                                AND NOT EXISTS (
                                    SELECT 1 FROM platform_payments pp
                                    WHERE pp.organization_id = os.organization_id AND pp.status = 'paid'
                                )",
                    'params' => [$days],
                ];

            case 'past_due':
                return [
                    'sql' => "SELECT os.organization_id, p.name AS plan_name, {$mrr} AS mrr,
                                     CONCAT('Past due since ', DATE_FORMAT(os.current_period_end, '%b %e')) AS context
                              {$base}
                              WHERE os.status = 'past_due'",
                    'params' => [],
                ];

            case 'churned_recent':
                $days = $this->intConfig($config, 'days', 45, 1, 365);

                return [
                    'sql' => "SELECT os.organization_id, p.name AS plan_name, 0 AS mrr,
                                     CONCAT('Cancelled ', DATE_FORMAT(os.cancelled_at, '%b %e')) AS context
                              {$base}
                              WHERE os.cancelled_at IS NOT NULL
                                AND os.cancelled_at >= DATE_SUB(NOW(), INTERVAL ? DAY)",
                    'params' => [$days],
                ];

            case 'churned_long':
                $days = $this->intConfig($config, 'days', 90, 30, 720);

                return [
                    'sql' => "SELECT os.organization_id, p.name AS plan_name, 0 AS mrr,
                                     CONCAT('Gone ', DATEDIFF(NOW(), os.cancelled_at), ' days') AS context
                              {$base}
                              WHERE os.cancelled_at IS NOT NULL
                                AND os.cancelled_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
                    'params' => [$days],
                ];

            case 'at_risk_dormant':
                $days = $this->intConfig($config, 'days', 14, 3, 120);

                return [
                    'sql' => "SELECT os.organization_id, p.name AS plan_name, {$mrr} AS mrr,
                                     CONCAT('No activity for ', COALESCE(DATEDIFF(NOW(), (
                                        SELECT MAX(te.started_at) FROM time_entries te
                                        WHERE te.organization_id = os.organization_id
                                     )), 999), ' days') AS context
                              {$base}
                              WHERE os.status = 'active' AND os.amount > 0
                                AND NOT EXISTS (
                                    SELECT 1 FROM time_entries te
                                    WHERE te.organization_id = os.organization_id
                                      AND te.started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                                )",
                    'params' => [$days],
                ];

            case 'usage_drop':
                $days = $this->intConfig($config, 'days', 14, 7, 90);
                $drop = $this->intConfig($config, 'drop_percent', 40, 10, 95);
                $keepRatio = (100 - $drop) / 100;

                return [
                    'sql' => "SELECT os.organization_id, p.name AS plan_name, {$mrr} AS mrr,
                                     CONCAT('Usage down ', ROUND((1 - (recent.seconds / previous.seconds)) * 100), '%') AS context
                              {$base}
                              INNER JOIN (
                                    SELECT organization_id, SUM(duration_seconds) AS seconds
                                    FROM time_entries
                                    WHERE started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                                    GROUP BY organization_id
                              ) recent ON recent.organization_id = os.organization_id
                              INNER JOIN (
                                    SELECT organization_id, SUM(duration_seconds) AS seconds
                                    FROM time_entries
                                    WHERE started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                                      AND started_at < DATE_SUB(NOW(), INTERVAL ? DAY)
                                    GROUP BY organization_id
                              ) previous ON previous.organization_id = os.organization_id
                              WHERE os.status = 'active' AND os.amount > 0
                                AND previous.seconds > 0
                                AND recent.seconds < previous.seconds * ?",
                    'params' => [$days, $days * 2, $days, $keepRatio],
                ];

            case 'power_users':
                $hours = $this->intConfig($config, 'hours', 100, 10, 2000);

                return [
                    'sql' => "SELECT os.organization_id, p.name AS plan_name, {$mrr} AS mrr,
                                     CONCAT(ROUND(usg.seconds / 3600), 'h tracked in 30 days') AS context
                              {$base}
                              INNER JOIN (
                                    SELECT organization_id, SUM(duration_seconds) AS seconds
                                    FROM time_entries
                                    WHERE started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                                    GROUP BY organization_id
                              ) usg ON usg.organization_id = os.organization_id
                              WHERE os.status = 'active' AND os.amount > 0
                                AND usg.seconds >= ? * 3600",
                    'params' => [$hours],
                ];

            case 'seat_limit_near':
                $threshold = $this->intConfig($config, 'threshold_percent', 80, 50, 100) / 100;

                return [
                    'sql' => "SELECT os.organization_id, p.name AS plan_name, {$mrr} AS mrr,
                                     CONCAT(seats.members, ' of ', p.max_users, ' seats used') AS context
                              {$base}
                              INNER JOIN (
                                    SELECT organization_id, COUNT(*) AS members
                                    FROM organization_members GROUP BY organization_id
                              ) seats ON seats.organization_id = os.organization_id
                              WHERE os.status IN ('active', 'trial')
                                AND p.max_users IS NOT NULL AND p.max_users > 0
                                AND seats.members >= p.max_users * ?",
                    'params' => [$threshold],
                ];

            case 'free_plan_engaged':
                $hours = $this->intConfig($config, 'hours', 10, 1, 500);

                return [
                    'sql' => "SELECT os.organization_id, p.name AS plan_name, 0 AS mrr,
                                     CONCAT(ROUND(usg.seconds / 3600), 'h on free plan') AS context
                              {$base}
                              INNER JOIN (
                                    SELECT organization_id, SUM(duration_seconds) AS seconds
                                    FROM time_entries
                                    WHERE started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                                    GROUP BY organization_id
                              ) usg ON usg.organization_id = os.organization_id
                              WHERE os.status IN ('active', 'trial')
                                AND (os.amount = 0 OR p.slug = 'free')
                                AND usg.seconds >= ? * 3600",
                    'params' => [$hours],
                ];

            case 'new_signups':
                $days = $this->intConfig($config, 'days', 7, 1, 90);

                return [
                    'sql' => "SELECT o.id AS organization_id, p.name AS plan_name, COALESCE({$mrr}, 0) AS mrr,
                                     CONCAT('Joined ', DATE_FORMAT(o.created_at, '%b %e')) AS context
                              FROM organizations o
                              LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
                              LEFT JOIN plans p ON p.id = os.plan_id
                              WHERE o.is_active = 1
                                AND o.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)",
                    'params' => [$days],
                ];

            case 'solo_no_team':
                $days = $this->intConfig($config, 'days', 7, 1, 180);

                return [
                    'sql' => "SELECT o.id AS organization_id, p.name AS plan_name, COALESCE({$mrr}, 0) AS mrr,
                                     'Still a team of one' AS context
                              FROM organizations o
                              LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
                              LEFT JOIN plans p ON p.id = os.plan_id
                              WHERE o.is_active = 1
                                AND o.created_at <= DATE_SUB(NOW(), INTERVAL ? DAY)
                                AND (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id) <= 1
                                AND NOT EXISTS (
                                    SELECT 1 FROM organization_invitations oi WHERE oi.organization_id = o.id
                                )",
                    'params' => [$days],
                ];

            case 'monthly_to_annual':
                $months = $this->intConfig($config, 'months', 3, 1, 36);

                return [
                    'sql' => "SELECT os.organization_id, p.name AS plan_name, {$mrr} AS mrr,
                                     CONCAT('Monthly for ', TIMESTAMPDIFF(MONTH, os.created_at, NOW()), ' months') AS context
                              {$base}
                              WHERE os.status = 'active' AND os.amount > 0
                                AND os.billing_cycle = 'monthly'
                                AND os.created_at <= DATE_SUB(NOW(), INTERVAL ? MONTH)",
                    'params' => [$months],
                ];

            case 'all_paying':
                return [
                    'sql' => "SELECT os.organization_id, p.name AS plan_name, {$mrr} AS mrr,
                                     CONCAT(p.name, ' · ', os.billing_cycle) AS context
                              {$base}
                              WHERE os.status = 'active' AND os.amount > 0",
                    'params' => [],
                ];

            case 'all_organizations':
                return [
                    'sql' => "SELECT o.id AS organization_id, COALESCE(p.name, 'No plan') AS plan_name,
                                     COALESCE({$mrr}, 0) AS mrr, COALESCE(os.status, 'none') AS context
                              FROM organizations o
                              LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
                              LEFT JOIN plans p ON p.id = os.plan_id
                              WHERE o.is_active = 1",
                    'params' => [],
                ];
        }

        throw new \RuntimeException('Unknown segment: ' . $key);
    }

    private function intConfig(array $config, string $key, int $default, int $min, int $max): int
    {
        $value = isset($config[$key]) && $config[$key] !== '' ? (int) $config[$key] : $default;

        return max($min, min($max, $value));
    }

    private function roleList(): string
    {
        return "('" . implode("','", self::DECISION_MAKER_ROLES) . "')";
    }
}
