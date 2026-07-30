<?php

namespace App\Services\Admin;

use App\Models\PlatformSettingModel;
use CodeIgniter\Database\BaseConnection;

/**
 * Operational health for the platform portal: database, storage, integrations,
 * webhook delivery, and recent application errors.
 */
class AdminSystemService
{
    use AdminAuditTrail;

    protected BaseConnection $db;
    protected PlatformSettingModel $settings;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
        $this->settings = new PlatformSettingModel();
    }

    public function getHealth(): array
    {
        return [
            'checked_at' => date('c'),
            'environment' => [
                'ci_environment' => ENVIRONMENT,
                'php_version' => PHP_VERSION,
                'server_time' => date('Y-m-d H:i:s'),
                'timezone' => date_default_timezone_get(),
            ],
            'database' => $this->databaseHealth(),
            'storage' => $this->storageHealth(),
            'integrations' => $this->integrationHealth(),
            'webhooks' => $this->webhookHealth(),
            'jobs' => $this->jobHealth(),
            'errors' => $this->recentErrors(),
            'settings' => $this->platformSettings(),
        ];
    }

    private function databaseHealth(): array
    {
        $start = microtime(true);
        $connected = true;
        try {
            $this->db->query('SELECT 1');
        } catch (\Throwable $e) {
            $connected = false;
        }
        $latencyMs = round((microtime(true) - $start) * 1000, 2);

        $tables = [];
        try {
            $rows = $this->db->query("
                SELECT table_name AS name, table_rows AS approx_rows,
                       ROUND((data_length + index_length) / 1024 / 1024, 2) AS size_mb
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                ORDER BY (data_length + index_length) DESC
                LIMIT 15
            ")->getResultArray();
            $tables = array_map(static fn (array $r) => [
                'name' => $r['name'],
                'approx_rows' => (int) $r['approx_rows'],
                'size_mb' => (float) $r['size_mb'],
            ], $rows);
        } catch (\Throwable $e) {
            $tables = [];
        }

        $totalSize = 0.0;
        try {
            $totalSize = (float) ($this->db->query("
                SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb
                FROM information_schema.tables WHERE table_schema = DATABASE()
            ")->getRowArray()['size_mb'] ?? 0);
        } catch (\Throwable $e) {
            $totalSize = 0.0;
        }

        return [
            'connected' => $connected,
            'latency_ms' => $latencyMs,
            'driver' => $this->db->DBDriver,
            'database' => $this->db->getDatabase(),
            'total_size_mb' => $totalSize,
            'largest_tables' => $tables,
        ];
    }

    private function storageHealth(): array
    {
        $writablePath = WRITEPATH;
        $screenshots = $this->db->table('screenshots')->countAllResults();

        $logSize = 0;
        $logDir = $writablePath . 'logs';
        if (is_dir($logDir)) {
            foreach (glob($logDir . '/*.log') ?: [] as $file) {
                $logSize += (int) @filesize($file);
            }
        }

        $uploadsDir = $writablePath . 'uploads';
        $uploadSize = 0;
        if (is_dir($uploadsDir)) {
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($uploadsDir, \FilesystemIterator::SKIP_DOTS)
            );
            foreach ($iterator as $file) {
                if ($file->isFile()) {
                    $uploadSize += $file->getSize();
                }
            }
        }

        return [
            'writable_path' => $writablePath,
            'writable' => is_writable($writablePath),
            'disk_free_gb' => round(((float) (@disk_free_space($writablePath) ?: 0)) / 1073741824, 2),
            'disk_total_gb' => round(((float) (@disk_total_space($writablePath) ?: 0)) / 1073741824, 2),
            'log_size_mb' => round($logSize / 1048576, 2),
            'uploads_size_mb' => round($uploadSize / 1048576, 2),
            'screenshot_records' => $screenshots,
        ];
    }

    private function integrationHealth(): array
    {
        $configured = [
            'stripe' => (bool) env('STRIPE_SECRET_KEY'),
            'stripe_webhook' => (bool) env('STRIPE_WEBHOOK_SECRET'),
            'google_oauth' => (bool) env('GOOGLE_CLIENT_ID'),
            'github_oauth' => (bool) env('GITHUB_CLIENT_ID'),
            'slack' => (bool) env('SLACK_CLIENT_ID'),
            'jira' => (bool) env('JIRA_CLIENT_ID'),
            'openai' => (bool) env('OPENAI_API_KEY'),
            'smtp' => (bool) (config('Email')->SMTPHost ?? null),
        ];

        $perProvider = [];
        try {
            $perProvider = $this->db->query("
                SELECT provider, COUNT(*) AS organizations,
                       SUM(CASE WHEN is_enabled = 1 THEN 1 ELSE 0 END) AS enabled
                FROM organization_integrations
                GROUP BY provider
                ORDER BY organizations DESC
            ")->getResultArray();
        } catch (\Throwable $e) {
            $perProvider = [];
        }

        return [
            'configured' => $configured,
            'per_provider' => $perProvider,
        ];
    }

    private function webhookHealth(): array
    {
        try {
            $summary = $this->db->query("
                SELECT
                    COUNT(*) AS total_24h,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS succeeded_24h,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed_24h
                FROM webhook_deliveries
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ")->getRowArray() ?: [];

            $failures = $this->db->table('webhook_deliveries wd')
                ->select('wd.id, wd.event, wd.status_code, wd.attempts, wd.response_snippet, wd.created_at,
                          we.url, o.name AS organization_name', false)
                ->join('webhook_endpoints we', 'we.id = wd.endpoint_id', 'left')
                ->join('organizations o', 'o.id = wd.organization_id', 'left')
                ->where('wd.success', 0)
                ->orderBy('wd.created_at', 'DESC')
                ->limit(20)
                ->get()
                ->getResultArray();

            $endpoints = $this->db->query("
                SELECT COUNT(*) AS total, SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active
                FROM webhook_endpoints
            ")->getRowArray() ?: [];
        } catch (\Throwable $e) {
            return ['available' => false];
        }

        $total = (int) ($summary['total_24h'] ?? 0);
        $succeeded = (int) ($summary['succeeded_24h'] ?? 0);

        return [
            'available' => true,
            'endpoints_total' => (int) ($endpoints['total'] ?? 0),
            'endpoints_active' => (int) ($endpoints['active'] ?? 0),
            'deliveries_24h' => $total,
            'succeeded_24h' => $succeeded,
            'failed_24h' => (int) ($summary['failed_24h'] ?? 0),
            'success_rate_percent' => $total > 0 ? round(($succeeded / $total) * 100, 1) : 100.0,
            'recent_failures' => $failures,
        ];
    }

    /**
     * Background work signals — scheduled reports and automation runs.
     */
    private function jobHealth(): array
    {
        $out = [];

        try {
            $out['scheduled_reports'] = $this->db->query("
                SELECT COUNT(*) AS total,
                       SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
                       MAX(last_sent_at) AS last_sent_at
                FROM scheduled_reports
            ")->getRowArray() ?: [];
        } catch (\Throwable $e) {
            $out['scheduled_reports'] = null;
        }

        try {
            $out['automations'] = $this->db->query("
                SELECT COUNT(*) AS total, SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active
                FROM automations
            ")->getRowArray() ?: [];
        } catch (\Throwable $e) {
            $out['automations'] = null;
        }

        $out['stale_timers'] = $this->db->query("
            SELECT COUNT(*) AS total FROM time_entries
            WHERE ended_at IS NULL AND started_at < DATE_SUB(NOW(), INTERVAL 16 HOUR)
        ")->getRowArray()['total'] ?? 0;

        $out['expired_trials_not_closed'] = $this->db->query("
            SELECT COUNT(*) AS total FROM organization_subscriptions
            WHERE status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at < NOW()
        ")->getRowArray()['total'] ?? 0;

        return $out;
    }

    /**
     * Tail of the current CodeIgniter log file, newest first.
     */
    public function recentErrors(int $limit = 40): array
    {
        $file = WRITEPATH . 'logs/log-' . date('Y-m-d') . '.log';
        if (!is_file($file)) {
            return [];
        }

        $contents = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!$contents) {
            return [];
        }

        $entries = [];
        foreach (array_reverse($contents) as $line) {
            if (!preg_match('/^(CRITICAL|ERROR|WARNING|ALERT|EMERGENCY)\s*-\s*(\S+\s\S+)\s*-->\s*(.*)$/i', $line, $m)) {
                continue;
            }
            $entries[] = [
                'level' => strtoupper($m[1]),
                'logged_at' => $m[2],
                'message' => mb_substr($m[3], 0, 500),
            ];
            if (count($entries) >= $limit) {
                break;
            }
        }

        return $entries;
    }

    public function platformSettings(): array
    {
        $stored = $this->settings->allValues();

        return [
            'maintenance_mode' => ($stored['maintenance_mode'] ?? '0') === '1',
            'maintenance_message' => $stored['maintenance_message'] ?? '',
            'signups_enabled' => ($stored['signups_enabled'] ?? '1') === '1',
            'default_trial_days' => (int) ($stored['default_trial_days'] ?? 14),
            'support_email' => $stored['support_email'] ?? '',
        ];
    }

    public function updatePlatformSettings(array $data, int $adminUserId): array
    {
        $map = [
            'maintenance_mode' => fn ($v) => !empty($v) && $v !== 'false' ? '1' : '0',
            'maintenance_message' => fn ($v) => (string) $v,
            'signups_enabled' => fn ($v) => !empty($v) && $v !== 'false' ? '1' : '0',
            'default_trial_days' => fn ($v) => (string) max(0, min(365, (int) $v)),
            'support_email' => fn ($v) => (string) $v,
        ];

        $applied = [];
        foreach ($map as $key => $cast) {
            if (array_key_exists($key, $data)) {
                $value = $cast($data[$key]);
                $this->settings->setValue($key, $value, $adminUserId);
                $applied[$key] = $value;
            }
        }

        if ($applied === []) {
            throw new \RuntimeException('Nothing to update');
        }

        $this->recordAdminAction($adminUserId, 'platform_settings.update', 'platform_settings', null, $applied);

        return $this->platformSettings();
    }

    /**
     * Close timers left running far past a plausible workday.
     */
    public function closeStaleTimers(int $adminUserId, int $hours = 16): array
    {
        $hours = max(4, min(72, $hours));
        $cutoff = date('Y-m-d H:i:s', strtotime("-{$hours} hours"));

        $stale = $this->db->table('time_entries')
            ->select('id, started_at')
            ->where('ended_at', null)
            ->where('started_at <', $cutoff)
            ->get()
            ->getResultArray();

        $closed = 0;
        foreach ($stale as $entry) {
            $endedAt = date('Y-m-d H:i:s', strtotime($entry['started_at']) + ($hours * 3600));
            $this->db->table('time_entries')->where('id', $entry['id'])->update([
                'ended_at' => $endedAt,
                'duration_seconds' => $hours * 3600,
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
            $closed++;
        }

        $this->recordAdminAction($adminUserId, 'system.close_stale_timers', 'time_entry', null, [
            'closed' => $closed,
            'cutoff_hours' => $hours,
        ]);

        return ['closed' => $closed, 'cutoff_hours' => $hours];
    }
}
