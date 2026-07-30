<?php

namespace App\Services\Admin;

use CodeIgniter\Database\BaseConnection;

/**
 * Platform-wide KPIs for the super-admin overview dashboard.
 *
 * Revenue is derived from `organization_subscriptions.amount`, which holds the
 * charge for one billing cycle, so yearly rows are divided by 12 to reach MRR.
 */
class AdminMetricsService
{
    protected BaseConnection $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    public function getOverview(): array
    {
        return [
            'totals' => $this->totals(),
            'revenue' => $this->revenue(),
            'growth' => $this->growth(),
            'churn' => $this->churn(),
            'engagement' => $this->engagement(),
            'attention' => $this->attention(),
            'plan_distribution' => $this->planDistribution(),
        ];
    }

    public function totals(): array
    {
        $orgs = $this->db->query("
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS suspended
            FROM organizations
        ")->getRowArray() ?: [];

        $users = $this->db->query("
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN email_verified_at IS NULL THEN 1 ELSE 0 END) AS unverified,
                SUM(CASE WHEN is_super_admin = 1 THEN 1 ELSE 0 END) AS super_admins
            FROM users
            WHERE deleted_at IS NULL
        ")->getRowArray() ?: [];

        $subs = $this->db->query("
            SELECT status, COUNT(*) AS total
            FROM organization_subscriptions
            GROUP BY status
        ")->getResultArray();

        $byStatus = [];
        foreach ($subs as $row) {
            $byStatus[$row['status']] = (int) $row['total'];
        }

        return [
            'organizations' => (int) ($orgs['total'] ?? 0),
            'organizations_active' => (int) ($orgs['active'] ?? 0),
            'organizations_suspended' => (int) ($orgs['suspended'] ?? 0),
            'users' => (int) ($users['total'] ?? 0),
            'users_active' => (int) ($users['active'] ?? 0),
            'users_unverified' => (int) ($users['unverified'] ?? 0),
            'super_admins' => (int) ($users['super_admins'] ?? 0),
            'projects' => $this->db->table('projects')->countAllResults(),
            'time_entries' => $this->db->table('time_entries')->countAllResults(),
            'subscriptions_by_status' => $byStatus,
            'plans' => $this->db->table('plans')->countAllResults(),
        ];
    }

    public function revenue(): array
    {
        $row = $this->db->query("
            SELECT
                COALESCE(SUM(CASE WHEN os.billing_cycle = 'yearly' THEN os.amount / 12 ELSE os.amount END), 0) AS mrr,
                COUNT(*) AS paying_accounts,
                COALESCE(SUM(os.user_count), 0) AS billed_seats
            FROM organization_subscriptions os
            WHERE os.status = 'active' AND os.amount > 0
        ")->getRowArray() ?: [];

        $mrr = round((float) ($row['mrr'] ?? 0), 2);
        $payingAccounts = (int) ($row['paying_accounts'] ?? 0);

        $trialPipeline = $this->db->query("
            SELECT
                COALESCE(SUM(CASE WHEN billing_cycle = 'yearly' THEN amount / 12 ELSE amount END), 0) AS mrr,
                COUNT(*) AS accounts
            FROM organization_subscriptions
            WHERE status = 'trial'
        ")->getRowArray() ?: [];

        $pastDue = $this->db->query("
            SELECT
                COALESCE(SUM(CASE WHEN billing_cycle = 'yearly' THEN amount / 12 ELSE amount END), 0) AS mrr,
                COUNT(*) AS accounts
            FROM organization_subscriptions
            WHERE status = 'past_due'
        ")->getRowArray() ?: [];

        return [
            'mrr' => $mrr,
            'arr' => round($mrr * 12, 2),
            'arpa' => $payingAccounts > 0 ? round($mrr / $payingAccounts, 2) : 0.0,
            'paying_accounts' => $payingAccounts,
            'billed_seats' => (int) ($row['billed_seats'] ?? 0),
            'trial_pipeline_mrr' => round((float) ($trialPipeline['mrr'] ?? 0), 2),
            'trial_accounts' => (int) ($trialPipeline['accounts'] ?? 0),
            'past_due_mrr' => round((float) ($pastDue['mrr'] ?? 0), 2),
            'past_due_accounts' => (int) ($pastDue['accounts'] ?? 0),
            'invoiced_to_clients' => round((float) ($this->db->query("
                SELECT COALESCE(SUM(total), 0) AS total FROM invoices WHERE status = 'paid'
            ")->getRowArray()['total'] ?? 0), 2),
        ];
    }

    public function growth(): array
    {
        return [
            'organizations' => $this->periodComparison('organizations'),
            'users' => $this->periodComparison('users', 'deleted_at IS NULL'),
            'subscriptions' => $this->periodComparison('organization_subscriptions'),
        ];
    }

    /**
     * Current 30-day window vs the 30 days before it.
     */
    private function periodComparison(string $table, ?string $extraWhere = null): array
    {
        $where = $extraWhere ? "AND {$extraWhere}" : '';

        $row = $this->db->query("
            SELECT
                SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS current_period,
                SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
                          AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS previous_period
            FROM {$table}
            WHERE 1 = 1 {$where}
        ")->getRowArray() ?: [];

        $current = (int) ($row['current_period'] ?? 0);
        $previous = (int) ($row['previous_period'] ?? 0);

        return [
            'current' => $current,
            'previous' => $previous,
            'change_percent' => $previous > 0
                ? round((($current - $previous) / $previous) * 100, 1)
                : ($current > 0 ? 100.0 : 0.0),
        ];
    }

    public function churn(): array
    {
        $cancelled30 = (int) ($this->db->query("
            SELECT COUNT(*) AS total
            FROM organization_subscriptions
            WHERE cancelled_at IS NOT NULL AND cancelled_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        ")->getRowArray()['total'] ?? 0);

        $activeAtStart = (int) ($this->db->query("
            SELECT COUNT(*) AS total
            FROM organization_subscriptions
            WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
              AND (cancelled_at IS NULL OR cancelled_at >= DATE_SUB(NOW(), INTERVAL 30 DAY))
        ")->getRowArray()['total'] ?? 0);

        $trialConversions = $this->db->query("
            SELECT
                SUM(CASE WHEN action = 'trial_start' THEN 1 ELSE 0 END) AS trials_started,
                SUM(CASE WHEN action IN ('subscribe', 'upgrade') THEN 1 ELSE 0 END) AS converted
            FROM subscription_history
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
        ")->getRowArray() ?: [];

        $trialsStarted = (int) ($trialConversions['trials_started'] ?? 0);
        $converted = (int) ($trialConversions['converted'] ?? 0);

        return [
            'cancelled_30d' => $cancelled30,
            'active_at_period_start' => $activeAtStart,
            'churn_rate_percent' => $activeAtStart > 0 ? round(($cancelled30 / $activeAtStart) * 100, 2) : 0.0,
            'pending_cancellations' => (int) ($this->db->query("
                SELECT COUNT(*) AS total FROM organization_subscriptions
                WHERE cancel_at_period_end = 1 AND status IN ('active', 'trial')
            ")->getRowArray()['total'] ?? 0),
            'trials_started_90d' => $trialsStarted,
            'trial_conversions_90d' => $converted,
            'trial_conversion_percent' => $trialsStarted > 0 ? round(($converted / $trialsStarted) * 100, 1) : 0.0,
        ];
    }

    public function engagement(): array
    {
        $activeUsers = $this->db->query("
            SELECT
                COUNT(DISTINCT CASE WHEN started_at >= CURDATE() THEN user_id END) AS dau,
                COUNT(DISTINCT CASE WHEN started_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN user_id END) AS wau,
                COUNT(DISTINCT CASE WHEN started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN user_id END) AS mau
            FROM time_entries
        ")->getRowArray() ?: [];

        $hours = $this->db->query("
            SELECT
                COALESCE(SUM(CASE WHEN started_at >= CURDATE() THEN duration_seconds ELSE 0 END), 0) AS today,
                COALESCE(SUM(CASE WHEN started_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN duration_seconds ELSE 0 END), 0) AS week,
                COALESCE(SUM(CASE WHEN started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN duration_seconds ELSE 0 END), 0) AS month
            FROM time_entries
        ")->getRowArray() ?: [];

        $dau = (int) ($activeUsers['dau'] ?? 0);
        $mau = (int) ($activeUsers['mau'] ?? 0);

        return [
            'dau' => $dau,
            'wau' => (int) ($activeUsers['wau'] ?? 0),
            'mau' => $mau,
            'stickiness_percent' => $mau > 0 ? round(($dau / $mau) * 100, 1) : 0.0,
            'live_sessions' => $this->db->table('time_entries')->where('ended_at', null)->countAllResults(),
            'hours_today' => round(((int) ($hours['today'] ?? 0)) / 3600, 1),
            'hours_7d' => round(((int) ($hours['week'] ?? 0)) / 3600, 1),
            'hours_30d' => round(((int) ($hours['month'] ?? 0)) / 3600, 1),
            'screenshots_30d' => (int) ($this->db->query("
                SELECT COUNT(*) AS total FROM screenshots WHERE captured_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            ")->getRowArray()['total'] ?? 0),
        ];
    }

    /**
     * Accounts that need a human to look at them.
     */
    public function attention(): array
    {
        $trialsExpiring = $this->db->query("
            SELECT os.id, os.organization_id, o.name AS organization_name, p.name AS plan_name,
                   os.trial_ends_at, os.user_count
            FROM organization_subscriptions os
            JOIN organizations o ON o.id = os.organization_id
            LEFT JOIN plans p ON p.id = os.plan_id
            WHERE os.status = 'trial'
              AND os.trial_ends_at IS NOT NULL
              AND os.trial_ends_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
            ORDER BY os.trial_ends_at ASC
            LIMIT 20
        ")->getResultArray();

        $pastDue = $this->db->query("
            SELECT os.id, os.organization_id, o.name AS organization_name, p.name AS plan_name,
                   os.amount, os.billing_cycle, os.current_period_end
            FROM organization_subscriptions os
            JOIN organizations o ON o.id = os.organization_id
            LEFT JOIN plans p ON p.id = os.plan_id
            WHERE os.status = 'past_due'
            ORDER BY os.current_period_end ASC
            LIMIT 20
        ")->getResultArray();

        $dormant = $this->db->query("
            SELECT o.id, o.name, o.created_at, MAX(te.started_at) AS last_activity
            FROM organizations o
            LEFT JOIN time_entries te ON te.organization_id = o.id
            WHERE o.is_active = 1
            GROUP BY o.id, o.name, o.created_at
            HAVING last_activity IS NULL OR last_activity < DATE_SUB(NOW(), INTERVAL 14 DAY)
            ORDER BY last_activity IS NULL DESC, last_activity ASC
            LIMIT 20
        ")->getResultArray();

        return [
            'trials_expiring' => $trialsExpiring,
            'past_due' => $pastDue,
            'dormant_organizations' => $dormant,
            'failed_webhooks_24h' => (int) ($this->db->query("
                SELECT COUNT(*) AS total FROM webhook_deliveries
                WHERE success = 0 AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ")->getRowArray()['total'] ?? 0),
        ];
    }

    public function planDistribution(): array
    {
        return $this->db->query("
            SELECT
                p.id, p.name, p.slug, p.price_monthly,
                COUNT(os.id) AS accounts,
                SUM(CASE WHEN os.status = 'active' THEN 1 ELSE 0 END) AS active_accounts,
                SUM(CASE WHEN os.status = 'trial' THEN 1 ELSE 0 END) AS trial_accounts,
                COALESCE(SUM(CASE WHEN os.status = 'active'
                    THEN (CASE WHEN os.billing_cycle = 'yearly' THEN os.amount / 12 ELSE os.amount END)
                    ELSE 0 END), 0) AS mrr
            FROM plans p
            LEFT JOIN organization_subscriptions os ON os.plan_id = p.id
            GROUP BY p.id, p.name, p.slug, p.price_monthly
            ORDER BY p.sort_order ASC, p.id ASC
        ")->getResultArray();
    }

    /**
     * Daily series for the overview charts.
     */
    public function getTimeseries(int $days = 30): array
    {
        $days = max(7, min(180, $days));

        $signups = $this->db->query("
            SELECT DATE(created_at) AS day, COUNT(*) AS total
            FROM users
            WHERE deleted_at IS NULL AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(created_at)
        ", [$days])->getResultArray();

        $orgs = $this->db->query("
            SELECT DATE(created_at) AS day, COUNT(*) AS total
            FROM organizations
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(created_at)
        ", [$days])->getResultArray();

        $hours = $this->db->query("
            SELECT DATE(started_at) AS day, COALESCE(SUM(duration_seconds), 0) AS seconds,
                   COUNT(DISTINCT user_id) AS active_users
            FROM time_entries
            WHERE started_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(started_at)
        ", [$days])->getResultArray();

        $revenue = $this->db->query("
            SELECT DATE(created_at) AS day, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS events
            FROM subscription_history
            WHERE action IN ('subscribe', 'upgrade', 'renew', 'renewal', 'stripe_checkout')
              AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(created_at)
        ", [$days])->getResultArray();

        $signupMap = array_column($signups, 'total', 'day');
        $orgMap = array_column($orgs, 'total', 'day');
        $hourMap = array_column($hours, 'seconds', 'day');
        $activeMap = array_column($hours, 'active_users', 'day');
        $revenueMap = array_column($revenue, 'amount', 'day');

        $series = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $day = date('Y-m-d', strtotime("-{$i} days"));
            $series[] = [
                'day' => $day,
                'label' => date('M j', strtotime($day)),
                'signups' => (int) ($signupMap[$day] ?? 0),
                'organizations' => (int) ($orgMap[$day] ?? 0),
                'hours' => round(((int) ($hourMap[$day] ?? 0)) / 3600, 2),
                'active_users' => (int) ($activeMap[$day] ?? 0),
                'revenue' => round((float) ($revenueMap[$day] ?? 0), 2),
            ];
        }

        return $series;
    }

    /**
     * Latest signups and subscription movements for the overview feed.
     */
    public function getRecentActivity(int $limit = 10): array
    {
        $limit = max(1, min(50, $limit));

        $signups = $this->db->query("
            SELECT u.id, u.first_name, u.last_name, u.email, u.created_at, u.email_verified_at,
                   o.id AS organization_id, o.name AS organization_name
            FROM users u
            LEFT JOIN organization_members om ON om.user_id = u.id
            LEFT JOIN organizations o ON o.id = om.organization_id
            WHERE u.deleted_at IS NULL
            GROUP BY u.id, u.first_name, u.last_name, u.email, u.created_at, u.email_verified_at, o.id, o.name
            ORDER BY u.created_at DESC
            LIMIT {$limit}
        ")->getResultArray();

        $subscriptionEvents = $this->db->query("
            SELECT sh.id, sh.organization_id, o.name AS organization_name, sh.action, sh.amount,
                   sh.billing_cycle, sh.created_at,
                   fp.name AS from_plan, tp.name AS to_plan
            FROM subscription_history sh
            LEFT JOIN organizations o ON o.id = sh.organization_id
            LEFT JOIN plans fp ON fp.id = sh.from_plan_id
            LEFT JOIN plans tp ON tp.id = sh.to_plan_id
            ORDER BY sh.created_at DESC
            LIMIT {$limit}
        ")->getResultArray();

        return [
            'signups' => $signups,
            'subscription_events' => $subscriptionEvents,
        ];
    }
}
