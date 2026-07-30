<?php

namespace App\Services\Admin;

use CodeIgniter\Database\BaseConnection;

/**
 * Growth analytics: acquisition funnel, cohort retention, churn analysis,
 * expansion signals and per-account health scores.
 */
class AdminGrowthService
{
    protected BaseConnection $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    /**
     * Signup → activation → trial → paid → retained.
     */
    public function funnel(int $days = 90): array
    {
        $days = max(7, min(365, $days));

        $row = $this->db->query("
            SELECT
                COUNT(DISTINCT o.id) AS signups,
                COUNT(DISTINCT CASE WHEN act.entries > 0 THEN o.id END) AS activated,
                COUNT(DISTINCT CASE WHEN members.total > 1 THEN o.id END) AS invited_team,
                COUNT(DISTINCT CASE WHEN os.id IS NOT NULL THEN o.id END) AS started_trial,
                COUNT(DISTINCT CASE WHEN paid.total > 0 THEN o.id END) AS converted,
                COUNT(DISTINCT CASE WHEN os.status = 'active' AND os.amount > 0 THEN o.id END) AS retained
            FROM organizations o
            LEFT JOIN organization_subscriptions os ON os.organization_id = o.id
            LEFT JOIN (
                SELECT organization_id, COUNT(*) AS entries FROM time_entries GROUP BY organization_id
            ) act ON act.organization_id = o.id
            LEFT JOIN (
                SELECT organization_id, COUNT(*) AS total FROM organization_members GROUP BY organization_id
            ) members ON members.organization_id = o.id
            LEFT JOIN (
                SELECT organization_id, COUNT(*) AS total FROM platform_payments
                WHERE status IN ('paid','partially_refunded') GROUP BY organization_id
            ) paid ON paid.organization_id = o.id
            WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        ", [$days])->getRowArray() ?: [];

        $signups = max(0, (int) ($row['signups'] ?? 0));
        $stages = [
            ['key' => 'signups', 'label' => 'Signed up', 'count' => $signups],
            ['key' => 'activated', 'label' => 'Tracked first time entry', 'count' => (int) ($row['activated'] ?? 0)],
            ['key' => 'invited_team', 'label' => 'Invited a teammate', 'count' => (int) ($row['invited_team'] ?? 0)],
            ['key' => 'started_trial', 'label' => 'Started a subscription/trial', 'count' => (int) ($row['started_trial'] ?? 0)],
            ['key' => 'converted', 'label' => 'Made a payment', 'count' => (int) ($row['converted'] ?? 0)],
            ['key' => 'retained', 'label' => 'Still paying', 'count' => (int) ($row['retained'] ?? 0)],
        ];

        $previous = $signups;

        return [
            'days' => $days,
            'stages' => array_map(static function (array $stage) use ($signups, &$previous): array {
                $stage['percent_of_signups'] = $signups > 0 ? round(($stage['count'] / $signups) * 100, 1) : 0.0;
                $stage['step_conversion'] = $previous > 0 ? round(($stage['count'] / $previous) * 100, 1) : 0.0;
                $stage['drop_off'] = max(0, $previous - $stage['count']);
                $previous = $stage['count'];

                return $stage;
            }, $stages),
        ];
    }

    /**
     * Monthly signup cohorts with activity retention and paid conversion.
     */
    public function cohorts(int $months = 9): array
    {
        $months = max(3, min(24, $months));

        $sizes = $this->db->query("
            SELECT DATE_FORMAT(o.created_at, '%Y-%m') AS cohort,
                   COUNT(*) AS size,
                   SUM(CASE WHEN paid.total > 0 THEN 1 ELSE 0 END) AS converted,
                   COALESCE(SUM(paid.revenue), 0) AS revenue
            FROM organizations o
            LEFT JOIN (
                SELECT organization_id, COUNT(*) AS total, SUM(amount - amount_refunded) AS revenue
                FROM platform_payments WHERE status IN ('paid','partially_refunded')
                GROUP BY organization_id
            ) paid ON paid.organization_id = o.id
            WHERE o.created_at >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL ? MONTH)
            GROUP BY cohort
            ORDER BY cohort ASC
        ", [$months - 1])->getResultArray();

        $retention = $this->db->query("
            SELECT DATE_FORMAT(o.created_at, '%Y-%m') AS cohort,
                   TIMESTAMPDIFF(
                       MONTH,
                       DATE_FORMAT(o.created_at, '%Y-%m-01'),
                       DATE_FORMAT(te.started_at, '%Y-%m-01')
                   ) AS month_offset,
                   COUNT(DISTINCT o.id) AS active_orgs
            FROM organizations o
            INNER JOIN time_entries te ON te.organization_id = o.id
            WHERE o.created_at >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL ? MONTH)
              AND te.started_at >= o.created_at
            GROUP BY cohort, month_offset
        ", [$months - 1])->getResultArray();

        $matrix = [];
        foreach ($retention as $row) {
            $offset = (int) $row['month_offset'];
            if ($offset < 0 || $offset >= $months) {
                continue;
            }
            $matrix[$row['cohort']][$offset] = (int) $row['active_orgs'];
        }

        $currentMonth = date('Y-m');

        return [
            'months' => $months,
            'cohorts' => array_map(static function (array $row) use ($matrix, $months, $currentMonth): array {
                $size = max(1, (int) $row['size']);
                $available = max(1, (int) ((strtotime($currentMonth . '-01') - strtotime($row['cohort'] . '-01')) / 2592000) + 1);
                $periods = [];

                for ($offset = 0; $offset < min($months, $available); $offset++) {
                    $active = $matrix[$row['cohort']][$offset] ?? 0;
                    $periods[] = [
                        'offset' => $offset,
                        'active' => $active,
                        'percent' => round(($active / $size) * 100, 1),
                    ];
                }

                return [
                    'cohort' => $row['cohort'],
                    'size' => (int) $row['size'],
                    'converted' => (int) $row['converted'],
                    'conversion_percent' => round(((int) $row['converted'] / $size) * 100, 1),
                    'revenue' => round((float) $row['revenue'], 2),
                    'revenue_per_signup' => round(((float) $row['revenue']) / $size, 2),
                    'periods' => $periods,
                ];
            }, $sizes),
        ];
    }

    /**
     * Churn volumes, MRR lost, tenure at cancellation and churn by plan.
     */
    public function churnAnalysis(int $months = 12): array
    {
        $months = max(3, min(24, $months));

        $trend = $this->db->query("
            SELECT DATE_FORMAT(cancelled_at, '%Y-%m') AS month,
                   COUNT(*) AS churned,
                   COALESCE(SUM(CASE WHEN billing_cycle = 'yearly' THEN amount / 12 ELSE amount END), 0) AS mrr_lost,
                   COALESCE(AVG(TIMESTAMPDIFF(DAY, created_at, cancelled_at)), 0) AS avg_tenure_days
            FROM organization_subscriptions
            WHERE cancelled_at IS NOT NULL
              AND cancelled_at >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL ? MONTH)
            GROUP BY month
            ORDER BY month ASC
        ", [$months - 1])->getResultArray();

        $newTrend = $this->db->query("
            SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
                   COUNT(*) AS started,
                   COALESCE(SUM(CASE WHEN billing_cycle = 'yearly' THEN amount / 12 ELSE amount END), 0) AS mrr_added
            FROM organization_subscriptions
            WHERE created_at >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL ? MONTH)
            GROUP BY month
        ", [$months - 1])->getResultArray();

        $newByMonth = [];
        foreach ($newTrend as $row) {
            $newByMonth[$row['month']] = [
                'started' => (int) $row['started'],
                'mrr_added' => round((float) $row['mrr_added'], 2),
            ];
        }

        $byPlan = $this->db->query("
            SELECT COALESCE(p.name, 'Unknown') AS plan_name,
                   COUNT(*) AS churned,
                   COALESCE(SUM(CASE WHEN os.billing_cycle = 'yearly' THEN os.amount / 12 ELSE os.amount END), 0) AS mrr_lost,
                   COALESCE(AVG(TIMESTAMPDIFF(DAY, os.created_at, os.cancelled_at)), 0) AS avg_tenure_days
            FROM organization_subscriptions os
            LEFT JOIN plans p ON p.id = os.plan_id
            WHERE os.cancelled_at IS NOT NULL
            GROUP BY p.name
            ORDER BY churned DESC
        ")->getResultArray();

        $tenure = $this->db->query("
            SELECT
                SUM(CASE WHEN days <= 30 THEN 1 ELSE 0 END) AS within_30,
                SUM(CASE WHEN days BETWEEN 31 AND 90 THEN 1 ELSE 0 END) AS within_90,
                SUM(CASE WHEN days BETWEEN 91 AND 180 THEN 1 ELSE 0 END) AS within_180,
                SUM(CASE WHEN days BETWEEN 181 AND 365 THEN 1 ELSE 0 END) AS within_365,
                SUM(CASE WHEN days > 365 THEN 1 ELSE 0 END) AS beyond_365
            FROM (
                SELECT TIMESTAMPDIFF(DAY, created_at, cancelled_at) AS days
                FROM organization_subscriptions WHERE cancelled_at IS NOT NULL
            ) t
        ")->getRowArray() ?: [];

        $winbacks = $this->db->query("
            SELECT COUNT(*) AS total FROM organization_subscriptions
            WHERE cancelled_at IS NOT NULL AND status = 'active'
        ")->getRowArray() ?: [];

        return [
            'trend' => array_map(static function (array $row) use ($newByMonth): array {
                $new = $newByMonth[$row['month']] ?? ['started' => 0, 'mrr_added' => 0.0];
                $mrrLost = round((float) $row['mrr_lost'], 2);

                return [
                    'month' => $row['month'],
                    'churned' => (int) $row['churned'],
                    'started' => $new['started'],
                    'net_accounts' => $new['started'] - (int) $row['churned'],
                    'mrr_lost' => $mrrLost,
                    'mrr_added' => $new['mrr_added'],
                    'net_mrr' => round($new['mrr_added'] - $mrrLost, 2),
                    'avg_tenure_days' => (int) round((float) $row['avg_tenure_days']),
                ];
            }, $trend),
            'by_plan' => array_map(static fn (array $row): array => [
                'plan_name' => $row['plan_name'],
                'churned' => (int) $row['churned'],
                'mrr_lost' => round((float) $row['mrr_lost'], 2),
                'avg_tenure_days' => (int) round((float) $row['avg_tenure_days']),
            ], $byPlan),
            'tenure_buckets' => [
                ['label' => '0-30 days', 'count' => (int) ($tenure['within_30'] ?? 0)],
                ['label' => '31-90 days', 'count' => (int) ($tenure['within_90'] ?? 0)],
                ['label' => '91-180 days', 'count' => (int) ($tenure['within_180'] ?? 0)],
                ['label' => '181-365 days', 'count' => (int) ($tenure['within_365'] ?? 0)],
                ['label' => '1 year+', 'count' => (int) ($tenure['beyond_365'] ?? 0)],
            ],
            'recovered_accounts' => (int) ($winbacks['total'] ?? 0),
        ];
    }

    /**
     * Expansion / contraction of recurring revenue month over month.
     */
    public function revenueMovement(int $months = 12): array
    {
        $months = max(3, min(24, $months));

        $rows = $this->db->query("
            SELECT DATE_FORMAT(paid_at, '%Y-%m') AS month, organization_id,
                   SUM(amount - amount_refunded) AS revenue
            FROM platform_payments
            WHERE status IN ('paid','partially_refunded')
              AND paid_at >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL ? MONTH)
            GROUP BY month, organization_id
            ORDER BY month ASC
        ", [$months])->getResultArray();

        $byMonth = [];
        foreach ($rows as $row) {
            $byMonth[$row['month']][(int) $row['organization_id']] = round((float) $row['revenue'], 2);
        }

        $monthKeys = array_keys($byMonth);
        $movement = [];

        foreach ($monthKeys as $index => $month) {
            if ($index === 0) {
                continue;
            }

            $previousMonth = $monthKeys[$index - 1];
            $prev = $byMonth[$previousMonth];
            $current = $byMonth[$month];

            $newRevenue = 0.0;
            $expansion = 0.0;
            $contraction = 0.0;
            $churned = 0.0;
            $retained = 0.0;

            foreach ($current as $orgId => $amount) {
                if (!isset($prev[$orgId])) {
                    $newRevenue += $amount;
                    continue;
                }

                $delta = round($amount - $prev[$orgId], 2);
                $retained += min($amount, $prev[$orgId]);
                if ($delta > 0) {
                    $expansion += $delta;
                } elseif ($delta < 0) {
                    $contraction += abs($delta);
                }
            }

            foreach ($prev as $orgId => $amount) {
                if (!isset($current[$orgId])) {
                    $churned += $amount;
                }
            }

            $prevTotal = array_sum($prev);
            $movement[] = [
                'month' => $month,
                'starting_revenue' => round($prevTotal, 2),
                'new' => round($newRevenue, 2),
                'expansion' => round($expansion, 2),
                'contraction' => round($contraction, 2),
                'churned' => round($churned, 2),
                'ending_revenue' => round(array_sum($current), 2),
                'net_retention_percent' => $prevTotal > 0
                    ? round((($retained + $expansion) / $prevTotal) * 100, 1)
                    : 0.0,
                'gross_retention_percent' => $prevTotal > 0
                    ? round(($retained / $prevTotal) * 100, 1)
                    : 0.0,
            ];
        }

        return $movement;
    }

    /**
     * Health score per paying account so retention effort can be prioritised.
     */
    public function healthScores(int $limit = 60): array
    {
        $limit = max(10, min(200, $limit));

        $rows = $this->db->query("
            SELECT
                o.id AS organization_id, o.name AS organization_name,
                p.name AS plan_name,
                os.status,
                CASE WHEN os.billing_cycle = 'yearly' THEN os.amount / 12 ELSE os.amount END AS mrr,
                os.user_count, p.max_users,
                (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id) AS members,
                (SELECT MAX(te.started_at) FROM time_entries te WHERE te.organization_id = o.id) AS last_activity_at,
                COALESCE((SELECT SUM(te.duration_seconds) FROM time_entries te
                    WHERE te.organization_id = o.id AND te.started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)), 0) AS seconds_30d,
                COALESCE((SELECT SUM(te.duration_seconds) FROM time_entries te
                    WHERE te.organization_id = o.id
                      AND te.started_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
                      AND te.started_at < DATE_SUB(NOW(), INTERVAL 30 DAY)), 0) AS seconds_prev_30d,
                COALESCE((SELECT COUNT(DISTINCT te.user_id) FROM time_entries te
                    WHERE te.organization_id = o.id AND te.started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)), 0) AS active_members,
                COALESCE((SELECT COUNT(*) FROM platform_payments pp
                    WHERE pp.organization_id = o.id AND pp.status = 'failed'
                      AND pp.failed_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)), 0) AS failed_payments,
                COALESCE((SELECT SUM(pp.amount - pp.amount_refunded) FROM platform_payments pp
                    WHERE pp.organization_id = o.id AND pp.status IN ('paid','partially_refunded')), 0) AS lifetime_value
            FROM organizations o
            INNER JOIN organization_subscriptions os ON os.organization_id = o.id
            LEFT JOIN plans p ON p.id = os.plan_id
            WHERE o.is_active = 1
              AND os.status IN ('active', 'trial', 'past_due')
            ORDER BY mrr DESC
            LIMIT {$limit}
        ")->getResultArray();

        $accounts = array_map(function (array $row): array {
            $score = 100;
            $reasons = [];

            $lastActivity = $row['last_activity_at'] ?? null;
            $daysIdle = $lastActivity === null ? null : (int) floor((time() - strtotime($lastActivity)) / 86400);

            if ($daysIdle === null) {
                $score -= 45;
                $reasons[] = 'Never tracked any time';
            } elseif ($daysIdle >= 21) {
                $score -= 40;
                $reasons[] = "No activity for {$daysIdle} days";
            } elseif ($daysIdle >= 10) {
                $score -= 22;
                $reasons[] = "Quiet for {$daysIdle} days";
            } elseif ($daysIdle >= 4) {
                $score -= 8;
                $reasons[] = "Last active {$daysIdle} days ago";
            }

            $hours = round(((float) $row['seconds_30d']) / 3600, 1);
            $prevHours = round(((float) $row['seconds_prev_30d']) / 3600, 1);
            $trend = $prevHours > 0 ? round((($hours - $prevHours) / $prevHours) * 100, 1) : null;

            if ($trend !== null && $trend <= -40) {
                $score -= 20;
                $reasons[] = 'Usage down ' . abs((int) $trend) . '% vs last month';
            } elseif ($trend !== null && $trend <= -15) {
                $score -= 10;
                $reasons[] = 'Usage trending down';
            }

            $members = max(1, (int) $row['members']);
            $activeMembers = (int) $row['active_members'];
            $adoption = round(($activeMembers / $members) * 100);

            if ($adoption < 40) {
                $score -= 15;
                $reasons[] = "Only {$adoption}% of seats active";
            } elseif ($adoption < 70) {
                $score -= 6;
            }

            if ((int) $row['failed_payments'] > 0) {
                $score -= 15;
                $reasons[] = (int) $row['failed_payments'] . ' failed payment(s) in 90 days';
            }

            if (($row['status'] ?? '') === 'past_due') {
                $score -= 20;
                $reasons[] = 'Subscription past due';
            }

            $score = max(0, min(100, $score));

            $opportunities = [];
            $maxUsers = $row['max_users'] === null ? null : (int) $row['max_users'];
            if ($maxUsers !== null && $maxUsers > 0 && $members >= $maxUsers * 0.8) {
                $opportunities[] = 'Near seat limit — upgrade candidate';
            }
            if ($hours >= 100 && $score >= 70) {
                $opportunities[] = 'Power user — expansion / referral candidate';
            }

            return [
                'organization_id' => (int) $row['organization_id'],
                'organization_name' => $row['organization_name'],
                'plan_name' => $row['plan_name'],
                'status' => $row['status'],
                'mrr' => round((float) $row['mrr'], 2),
                'lifetime_value' => round((float) $row['lifetime_value'], 2),
                'members' => $members,
                'active_members' => $activeMembers,
                'seat_adoption_percent' => $adoption,
                'hours_30d' => $hours,
                'hours_prev_30d' => $prevHours,
                'usage_trend_percent' => $trend,
                'days_idle' => $daysIdle,
                'failed_payments' => (int) $row['failed_payments'],
                'health_score' => $score,
                'health_band' => $score >= 75 ? 'healthy' : ($score >= 50 ? 'watch' : 'at_risk'),
                'risk_reasons' => $reasons,
                'opportunities' => $opportunities,
                'last_activity_at' => $lastActivity,
            ];
        }, $rows);

        usort($accounts, static fn (array $a, array $b): int => $a['health_score'] <=> $b['health_score']);

        $bands = ['healthy' => 0, 'watch' => 0, 'at_risk' => 0];
        $mrrAtRisk = 0.0;
        foreach ($accounts as $account) {
            $bands[$account['health_band']]++;
            if ($account['health_band'] === 'at_risk') {
                $mrrAtRisk += $account['mrr'];
            }
        }

        return [
            'accounts' => $accounts,
            'bands' => $bands,
            'mrr_at_risk' => round($mrrAtRisk, 2),
        ];
    }

    /**
     * Headline growth numbers for the dashboard hero row.
     */
    public function keyMetrics(): array
    {
        $subs = $this->db->query("
            SELECT
                COALESCE(SUM(CASE WHEN status = 'active' AND amount > 0
                    THEN (CASE WHEN billing_cycle = 'yearly' THEN amount / 12 ELSE amount END) ELSE 0 END), 0) AS mrr,
                SUM(CASE WHEN status = 'active' AND amount > 0 THEN 1 ELSE 0 END) AS paying,
                SUM(CASE WHEN status = 'trial' THEN 1 ELSE 0 END) AS trials,
                SUM(CASE WHEN status = 'past_due' THEN 1 ELSE 0 END) AS past_due,
                SUM(CASE WHEN cancel_at_period_end = 1 AND status = 'active' THEN 1 ELSE 0 END) AS pending_cancel
            FROM organization_subscriptions
        ")->getRowArray() ?: [];

        $payments = $this->db->query("
            SELECT
                COALESCE(SUM(CASE WHEN paid_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN amount - amount_refunded ELSE 0 END), 0) AS collected_30d,
                COALESCE(SUM(CASE WHEN paid_at >= DATE_SUB(NOW(), INTERVAL 60 DAY) AND paid_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
                    THEN amount - amount_refunded ELSE 0 END), 0) AS collected_prev_30d,
                COALESCE(SUM(amount - amount_refunded), 0) AS lifetime,
                COUNT(DISTINCT organization_id) AS paying_orgs
            FROM platform_payments
            WHERE status IN ('paid','partially_refunded')
        ")->getRowArray() ?: [];

        $trialConversion = $this->db->query("
            SELECT
                COUNT(*) AS trials_ended,
                SUM(CASE WHEN converted.total > 0 THEN 1 ELSE 0 END) AS converted
            FROM organization_subscriptions os
            LEFT JOIN (
                SELECT organization_id, COUNT(*) AS total FROM platform_payments
                WHERE status IN ('paid','partially_refunded') GROUP BY organization_id
            ) converted ON converted.organization_id = os.organization_id
            WHERE os.trial_ends_at IS NOT NULL
              AND os.trial_ends_at < NOW()
              AND os.trial_ends_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
        ")->getRowArray() ?: [];

        $campaigns = $this->db->query("
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN status IN ('active','sending','scheduled') THEN 1 ELSE 0 END) AS running,
                   COALESCE(SUM(total_sent), 0) AS sent,
                   COALESCE(SUM(total_converted), 0) AS conversions,
                   COALESCE(SUM(converted_revenue), 0) AS attributed_revenue
            FROM marketing_campaigns
        ")->getRowArray() ?: [];

        $collected30 = round((float) ($payments['collected_30d'] ?? 0), 2);
        $collectedPrev = round((float) ($payments['collected_prev_30d'] ?? 0), 2);
        $trialsEnded = max(0, (int) ($trialConversion['trials_ended'] ?? 0));
        $mrr = round((float) ($subs['mrr'] ?? 0), 2);
        $payingOrgs = max(1, (int) ($payments['paying_orgs'] ?? 0));

        return [
            'mrr' => $mrr,
            'arr' => round($mrr * 12, 2),
            'paying_accounts' => (int) ($subs['paying'] ?? 0),
            'trials' => (int) ($subs['trials'] ?? 0),
            'past_due' => (int) ($subs['past_due'] ?? 0),
            'pending_cancellations' => (int) ($subs['pending_cancel'] ?? 0),
            'collected_30d' => $collected30,
            'collected_growth_percent' => $collectedPrev > 0
                ? round((($collected30 - $collectedPrev) / $collectedPrev) * 100, 1)
                : null,
            'lifetime_revenue' => round((float) ($payments['lifetime'] ?? 0), 2),
            'average_revenue_per_account' => round(((float) ($payments['lifetime'] ?? 0)) / $payingOrgs, 2),
            'trial_conversion_percent' => $trialsEnded > 0
                ? round(((int) ($trialConversion['converted'] ?? 0) / $trialsEnded) * 100, 1)
                : 0.0,
            'campaigns' => [
                'total' => (int) ($campaigns['total'] ?? 0),
                'running' => (int) ($campaigns['running'] ?? 0),
                'emails_sent' => (int) ($campaigns['sent'] ?? 0),
                'conversions' => (int) ($campaigns['conversions'] ?? 0),
                'attributed_revenue' => round((float) ($campaigns['attributed_revenue'] ?? 0), 2),
            ],
        ];
    }

    /**
     * Distribution of accounts by monthly engagement, to spot the dormant tail.
     */
    public function engagementDistribution(): array
    {
        $row = $this->db->query("
            SELECT
                SUM(CASE WHEN hours = 0 THEN 1 ELSE 0 END) AS dormant,
                SUM(CASE WHEN hours > 0 AND hours < 10 THEN 1 ELSE 0 END) AS light,
                SUM(CASE WHEN hours >= 10 AND hours < 50 THEN 1 ELSE 0 END) AS steady,
                SUM(CASE WHEN hours >= 50 AND hours < 200 THEN 1 ELSE 0 END) AS heavy,
                SUM(CASE WHEN hours >= 200 THEN 1 ELSE 0 END) AS power
            FROM (
                SELECT o.id,
                       COALESCE((SELECT SUM(te.duration_seconds) FROM time_entries te
                            WHERE te.organization_id = o.id
                              AND te.started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)), 0) / 3600 AS hours
                FROM organizations o
                WHERE o.is_active = 1
            ) t
        ")->getRowArray() ?: [];

        return [
            ['bucket' => 'Dormant (0h)', 'count' => (int) ($row['dormant'] ?? 0)],
            ['bucket' => 'Light (<10h)', 'count' => (int) ($row['light'] ?? 0)],
            ['bucket' => 'Steady (10-50h)', 'count' => (int) ($row['steady'] ?? 0)],
            ['bucket' => 'Heavy (50-200h)', 'count' => (int) ($row['heavy'] ?? 0)],
            ['bucket' => 'Power (200h+)', 'count' => (int) ($row['power'] ?? 0)],
        ];
    }
}
