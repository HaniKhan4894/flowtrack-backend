<?php

namespace App\Services\Admin;

use CodeIgniter\Database\BaseConnection;

/**
 * Cross-tenant usage analytics: who is actually using the product, and how much
 * of it. Also surfaces storage-ish counters (screenshots, activity rows) that
 * drive infrastructure cost.
 */
class AdminUsageService
{
    protected BaseConnection $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    public function getOverview(int $days = 30): array
    {
        $days = max(7, min(180, $days));

        return [
            'range_days' => $days,
            'platform' => $this->platformCounters($days),
            'top_organizations' => $this->topOrganizations($days),
            'top_users' => $this->topUsers($days),
            'feature_adoption' => $this->featureAdoption(),
            'api_usage' => $this->apiUsage(),
            'hourly_distribution' => $this->hourlyDistribution($days),
        ];
    }

    private function platformCounters(int $days): array
    {
        $row = $this->db->query("
            SELECT
                COUNT(*) AS entries,
                COUNT(DISTINCT user_id) AS active_users,
                COUNT(DISTINCT organization_id) AS active_organizations,
                COALESCE(SUM(duration_seconds), 0) AS seconds,
                COALESCE(SUM(CASE WHEN is_manual = 1 THEN 1 ELSE 0 END), 0) AS manual_entries,
                COALESCE(SUM(CASE WHEN is_billable = 1 THEN duration_seconds ELSE 0 END), 0) AS billable_seconds
            FROM time_entries
            WHERE started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        ", [$days])->getRowArray() ?: [];

        $screenshots = $this->db->query("
            SELECT COUNT(*) AS total FROM screenshots WHERE captured_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        ", [$days])->getRowArray() ?: [];

        $activity = $this->db->query("
            SELECT COUNT(*) AS total FROM activity_logs WHERE logged_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        ", [$days])->getRowArray() ?: [];

        $seconds = (int) ($row['seconds'] ?? 0);

        return [
            'time_entries' => (int) ($row['entries'] ?? 0),
            'active_users' => (int) ($row['active_users'] ?? 0),
            'active_organizations' => (int) ($row['active_organizations'] ?? 0),
            'hours' => round($seconds / 3600, 1),
            'billable_hours' => round(((int) ($row['billable_seconds'] ?? 0)) / 3600, 1),
            'manual_entries' => (int) ($row['manual_entries'] ?? 0),
            'screenshots' => (int) ($screenshots['total'] ?? 0),
            'activity_rows' => (int) ($activity['total'] ?? 0),
            'invoices_created' => (int) ($this->db->query("
                SELECT COUNT(*) AS total FROM invoices WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            ", [$days])->getRowArray()['total'] ?? 0),
        ];
    }

    private function topOrganizations(int $days): array
    {
        return array_map(static function (array $row) {
            return [
                'organization_id' => (int) $row['organization_id'],
                'organization_name' => $row['organization_name'],
                'plan_name' => $row['plan_name'] ?? 'No plan',
                'hours' => round(((int) $row['seconds']) / 3600, 1),
                'active_users' => (int) $row['active_users'],
                'entries' => (int) $row['entries'],
                'screenshots' => (int) $row['screenshots'],
            ];
        }, $this->db->query("
            SELECT
                te.organization_id,
                o.name AS organization_name,
                p.name AS plan_name,
                COALESCE(SUM(te.duration_seconds), 0) AS seconds,
                COUNT(DISTINCT te.user_id) AS active_users,
                COUNT(te.id) AS entries,
                (SELECT COUNT(*) FROM screenshots s
                    JOIN time_entries t2 ON t2.id = s.time_entry_id
                    WHERE t2.organization_id = te.organization_id
                      AND s.captured_at >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS screenshots
            FROM time_entries te
            JOIN organizations o ON o.id = te.organization_id
            LEFT JOIN organization_subscriptions os
                ON os.organization_id = o.id AND os.status IN ('trial', 'active', 'past_due')
            LEFT JOIN plans p ON p.id = os.plan_id
            WHERE te.started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY te.organization_id, o.name, p.name
            ORDER BY seconds DESC
            LIMIT 15
        ", [$days, $days])->getResultArray());
    }

    private function topUsers(int $days): array
    {
        return array_map(static function (array $row) {
            return [
                'user_id' => (int) $row['user_id'],
                'name' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')) ?: $row['email'],
                'email' => $row['email'],
                'organization_name' => $row['organization_name'],
                'hours' => round(((int) $row['seconds']) / 3600, 1),
                'entries' => (int) $row['entries'],
            ];
        }, $this->db->query("
            SELECT te.user_id, u.first_name, u.last_name, u.email, o.name AS organization_name,
                   COALESCE(SUM(te.duration_seconds), 0) AS seconds, COUNT(te.id) AS entries
            FROM time_entries te
            JOIN users u ON u.id = te.user_id
            LEFT JOIN organizations o ON o.id = te.organization_id
            WHERE te.started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY te.user_id, u.first_name, u.last_name, u.email, o.name
            ORDER BY seconds DESC
            LIMIT 15
        ", [$days])->getResultArray());
    }

    /**
     * How many organizations actually use each major module.
     */
    private function featureAdoption(): array
    {
        $totalOrgs = max(1, $this->db->table('organizations')->countAllResults());

        $counts = [
            'Screenshots' => "SELECT COUNT(DISTINCT te.organization_id) AS total FROM screenshots s JOIN time_entries te ON te.id = s.time_entry_id",
            'Invoicing' => 'SELECT COUNT(DISTINCT organization_id) AS total FROM invoices',
            'Payroll' => 'SELECT COUNT(DISTINCT organization_id) AS total FROM payroll_runs',
            'Clients' => 'SELECT COUNT(DISTINCT organization_id) AS total FROM clients',
            'Leave' => 'SELECT COUNT(DISTINCT organization_id) AS total FROM leave_requests',
            'Timesheets' => 'SELECT COUNT(DISTINCT organization_id) AS total FROM timesheet_periods',
            'Integrations' => 'SELECT COUNT(DISTINCT organization_id) AS total FROM organization_integrations WHERE is_enabled = 1',
            'API keys' => 'SELECT COUNT(DISTINCT organization_id) AS total FROM api_keys WHERE is_active = 1',
            'Webhooks' => 'SELECT COUNT(DISTINCT organization_id) AS total FROM webhook_endpoints WHERE is_active = 1',
            'Teams' => 'SELECT COUNT(DISTINCT organization_id) AS total FROM teams',
        ];

        $out = [];
        foreach ($counts as $label => $sql) {
            try {
                $total = (int) ($this->db->query($sql)->getRowArray()['total'] ?? 0);
            } catch (\Throwable $e) {
                // A module table may not exist on older deployments.
                continue;
            }

            $out[] = [
                'feature' => $label,
                'organizations' => $total,
                'adoption_percent' => round(($total / $totalOrgs) * 100, 1),
            ];
        }

        usort($out, static fn (array $a, array $b) => $b['organizations'] <=> $a['organizations']);

        return $out;
    }

    private function apiUsage(): array
    {
        $keys = $this->db->query("
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN last_used_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS used_7d
            FROM api_keys
        ")->getRowArray() ?: [];

        $recent = $this->db->table('api_keys ak')
            ->select('ak.id, ak.name, ak.key_prefix, ak.last_used_at, ak.is_active, o.name AS organization_name')
            ->join('organizations o', 'o.id = ak.organization_id', 'left')
            ->orderBy('ak.last_used_at IS NULL', 'ASC', false)
            ->orderBy('ak.last_used_at', 'DESC')
            ->limit(10)
            ->get()
            ->getResultArray();

        return [
            'keys_total' => (int) ($keys['total'] ?? 0),
            'keys_active' => (int) ($keys['active'] ?? 0),
            'keys_used_7d' => (int) ($keys['used_7d'] ?? 0),
            'recent_keys' => $recent,
        ];
    }

    /**
     * When are people tracking time? Useful for capacity planning.
     */
    private function hourlyDistribution(int $days): array
    {
        $rows = $this->db->query("
            SELECT HOUR(started_at) AS hour, COUNT(*) AS entries, COALESCE(SUM(duration_seconds), 0) AS seconds
            FROM time_entries
            WHERE started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY HOUR(started_at)
        ", [$days])->getResultArray();

        $byHour = array_column($rows, null, 'hour');
        $series = [];
        for ($hour = 0; $hour < 24; $hour++) {
            $series[] = [
                'hour' => $hour,
                'label' => sprintf('%02d:00', $hour),
                'entries' => (int) ($byHour[$hour]['entries'] ?? 0),
                'hours' => round(((int) ($byHour[$hour]['seconds'] ?? 0)) / 3600, 1),
            ];
        }

        return $series;
    }
}
