<?php

namespace App\Services;

use App\Models\ActivityLogModel;
use App\Models\ProductivityRuleModel;
use App\Models\TimeEntryModel;
use App\Services\TimezoneService;

class ActivityLogService
{
    /**
     * Tolerance for client/server clock skew when matching a segment to its entry window.
     * Desktop segments are stamped with their start time and flushed up to a minute later.
     */
    private const WINDOW_GRACE_SECONDS = 90;

    protected $activityLogModel;
    protected $productivityRuleModel;
    protected $timeEntryModel;
    protected $timezoneService;
    protected $db;

    public function __construct()
    {
        $this->activityLogModel = new ActivityLogModel();
        $this->productivityRuleModel = new ProductivityRuleModel();
        $this->timeEntryModel = new TimeEntryModel();
        $this->timezoneService = new TimezoneService();
        $this->db = \Config\Database::connect();
    }

    /**
     * Store one activity segment, trimmed to the part that overlaps its time entry.
     *
     * @return array|null The stored log, or null when the segment lies outside the entry window
     *                    (stale desktop client still syncing to a stopped/paused timer).
     */
    public function logActivity(int $timeEntryId, int $userId, array $data): ?array
    {
        $entry = $this->timeEntryModel->find($timeEntryId);
        if (!$entry || (int)$entry['user_id'] !== $userId) {
            throw new \Exception('Invalid time entry context');
        }

        // Define all fields with defaults and manual timestamps to bypass Model magic
        $loggedAt = $data['logged_at'] ?? date('Y-m-d H:i:s');
        if (strpos($loggedAt, 'T') !== false) {
            $loggedAt = date('Y-m-d H:i:s', strtotime($loggedAt));
        }

        $duration = (int)($data['duration_seconds'] ?? 0) ?: 60;
        [$loggedAt, $duration] = $this->clampSegmentToEntry($entry, $loggedAt, $duration);

        if ($duration <= 0) {
            return null;
        }

        $insertData = [
            'time_entry_id'    => (int)$timeEntryId,
            'user_id'          => (int)$userId,
            'app_name'         => $this->truncate((string) ($data['app_name'] ?? 'Unknown'), 191),
            'window_title'     => $this->truncate((string) ($data['window_title'] ?? ''), 500),
            'url'              => $this->truncate((string) ($data['url'] ?? ''), 1000),
            'category'         => $this->categorizeActivity($data, (int) $entry['organization_id']),
            'duration_seconds' => $duration,
            'keyboard_strokes' => (int)($data['keyboard_strokes'] ?? 0),
            'mouse_clicks'     => (int)($data['mouse_clicks'] ?? 0),
            'mouse_movement'   => (int)($data['mouse_movement'] ?? 0),
            'logged_at'        => $loggedAt,
            'created_at'       => date('Y-m-d H:i:s'),
        ];
        
        $this->db->table('activity_logs')->insert($insertData);
        $logId = $this->db->insertID();

        return $this->activityLogModel->find($logId);
    }

    /**
     * Seconds a timer is allowed to collect activity for: start until stop / pause / now.
     *
     * @return array{0:string,1:int} Clamped logged_at and duration (0 when fully outside).
     */
    private function clampSegmentToEntry(array $entry, string $loggedAt, int $duration): array
    {
        $entryStart = strtotime((string) ($entry['started_at'] ?? ''));
        if (!$entryStart) {
            return [$loggedAt, $duration];
        }

        $entryEnd = $this->entryTrackingEnd($entry);
        $windowStart = $entryStart - self::WINDOW_GRACE_SECONDS;
        $windowEnd = $entryEnd + self::WINDOW_GRACE_SECONDS;

        $segmentStart = strtotime($loggedAt) ?: time();
        $segmentEnd = $segmentStart + max(0, $duration);

        $start = max($segmentStart, $windowStart);
        $end = min($segmentEnd, $windowEnd);

        if ($end <= $start) {
            return [$loggedAt, 0];
        }

        return [date('Y-m-d H:i:s', $start), $end - $start];
    }

    /**
     * Last moment an entry was actively tracking (stop time, pause time, or now).
     */
    private function entryTrackingEnd(array $entry): int
    {
        if (!empty($entry['ended_at'])) {
            return (int) (strtotime((string) $entry['ended_at']) ?: time());
        }

        if (!empty($entry['paused_at'])) {
            return (int) (strtotime((string) $entry['paused_at']) ?: time());
        }

        return time();
    }

    /**
     * Whether a timer can still accept activity — used to tell stale clients to stop.
     */
    public function isEntryCollecting(array $entry): bool
    {
        return empty($entry['ended_at']) && empty($entry['paused_at']);
    }

    public function recordIdleStats(int $userId, int $organizationId, string $loggedAt, int $idleSeconds, int $activeSeconds): void
    {
        if ($idleSeconds <= 0 && $activeSeconds <= 0) {
            return;
        }

        $date = date('Y-m-d', strtotime($loggedAt));

        $existing = $this->db->table('daily_idle_stats')
            ->where('user_id', $userId)
            ->where('organization_id', $organizationId)
            ->where('date', $date)
            ->get()
            ->getRowArray();

        if ($existing) {
            $this->db->table('daily_idle_stats')->where('id', $existing['id'])->update([
                'idle_seconds' => (int) $existing['idle_seconds'] + $idleSeconds,
                'active_seconds' => (int) $existing['active_seconds'] + $activeSeconds,
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
        } else {
            $this->db->table('daily_idle_stats')->insert([
                'user_id' => $userId,
                'organization_id' => $organizationId,
                'date' => $date,
                'idle_seconds' => $idleSeconds,
                'active_seconds' => $activeSeconds,
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
        }
    }

    private function categorizeActivity(array $data, int $organizationId): string
    {
        $rules = $this->sortedActiveRules($organizationId);

        foreach ($rules as $rule) {
            if ($this->ruleMatches($data, $rule)) {
                return (string) $rule['category'];
            }
        }

        // No rule matched – fall back to any valid client-supplied category
        $clientCat = $data['category'] ?? null;
        $valid = ['productive', 'unproductive', 'neutral', 'uncategorized'];
        return in_array($clientCat, $valid, true) ? (string) $clientCat : 'uncategorized';
    }

    /** @return list<array<string, mixed>> */
    private function sortedActiveRules(int $organizationId): array
    {
        $rules = $this->productivityRuleModel
            ->where('organization_id', $organizationId)
            ->where('is_active', true)
            ->findAll();

        // url/keyword rules before app rules (more specific first).
        $typePriority = ['url' => 2, 'keyword' => 2, 'app' => 1];
        usort($rules, static function (array $a, array $b) use ($typePriority): int {
            return ($typePriority[$b['rule_type']] ?? 0) - ($typePriority[$a['rule_type']] ?? 0);
        });

        return $rules;
    }

    /** @param array<string, mixed> $data */
    /** @param array<string, mixed> $rule */
    private function ruleMatches(array $data, array $rule): bool
    {
        $appName = (string) ($data['app_name'] ?? '');
        $windowTitle = (string) ($data['window_title'] ?? '');
        $url = (string) ($data['url'] ?? '');
        $pattern = (string) ($rule['pattern'] ?? '');

        if ($pattern === '') {
            return false;
        }

        switch ($rule['rule_type']) {
            case 'app':
                return $appName !== '' && stripos($appName, $pattern) !== false;
            case 'url':
                // Match captured URL, or fall back to window title (browser tabs often lack a URL).
                if ($url !== '' && stripos($url, $pattern) !== false) {
                    return true;
                }
                return $windowTitle !== '' && stripos($windowTitle, $pattern) !== false;
            case 'keyword':
                return $windowTitle !== '' && stripos($windowTitle, $pattern) !== false;
            default:
                return false;
        }
    }

    private function truncate(string $value, int $maxLength): string
    {
        if ($maxLength <= 0) {
            return '';
        }

        return mb_strlen($value) > $maxLength ? mb_substr($value, 0, $maxLength) : $value;
    }

    /**
     * Re-apply current productivity rules to all existing activity logs for an org.
     * Processes in batches of 500 to avoid memory/lock issues.
     * Returns the number of rows updated.
     */
    public function recategorizeForOrganization(int $organizationId, ?string $fromDate = null): int
    {
        $rules = $this->sortedActiveRules($organizationId);

        $batchSize = 500;
        $offset    = 0;
        $updated   = 0;

        while (true) {
            $builder = $this->db->table('activity_logs al')
                ->join('time_entries te', 'te.id = al.time_entry_id', 'inner')
                ->select('al.id, al.app_name, al.window_title, al.url, al.category')
                ->where('te.organization_id', $organizationId)
                ->limit($batchSize, $offset);

            if ($fromDate !== null) {
                $builder->where('al.logged_at >=', $fromDate . ' 00:00:00');
            }

            $rows = $builder->get()->getResultArray();
            if (empty($rows)) {
                break;
            }

            foreach ($rows as $row) {
                $data = [
                    'app_name'     => $row['app_name'],
                    'window_title' => $row['window_title'],
                    'url'          => $row['url'],
                ];
                $newCategory = $this->applyRules($data, $rules);

                if ($newCategory !== $row['category']) {
                    $this->db->table('activity_logs')
                        ->where('id', $row['id'])
                        ->update(['category' => $newCategory]);
                    $updated++;
                }
            }

            $offset += $batchSize;
            if (count($rows) < $batchSize) {
                break;
            }
        }

        return $updated;
    }

    /** Apply a pre-loaded, pre-sorted rule list to a data row. */
    private function applyRules(array $data, array $rules): string
    {
        foreach ($rules as $rule) {
            if ($this->ruleMatches($data, $rule)) {
                return (string) $rule['category'];
            }
        }

        return 'uncategorized';
    }

    public function getActivityLogs(array $filters): array
    {
        $builder = $this->activityLogModel->builder();

        if (isset($filters['user_id'])) {
            $builder->where('user_id', $filters['user_id']);
        }

        if (isset($filters['time_entry_id'])) {
            $builder->where('time_entry_id', $filters['time_entry_id']);
        }

        if (isset($filters['category'])) {
            $builder->where('category', $filters['category']);
        }

        if (isset($filters['start_date']) || isset($filters['end_date'])) {
            $orgId = (int) ($filters['organization_id'] ?? 0);
            $phpTz = $this->timezoneService->getOrgTimezone($orgId);
            if (isset($filters['start_date'])) {
                $startUtc = $this->timezoneService->dateRangeUtc($filters['start_date'], $filters['start_date'], $phpTz)[0];
                $builder->where('logged_at >=', $startUtc);
            }
            if (isset($filters['end_date'])) {
                $endUtc = $this->timezoneService->dateRangeUtc($filters['end_date'], $filters['end_date'], $phpTz)[1];
                $builder->where('logged_at <=', $endUtc);
            }
        }

        $page = $filters['page'] ?? 1;
        $perPage = $filters['per_page'] ?? 50;
        $offset = ($page - 1) * $perPage;

        $total = $builder->countAllResults(false);
        $logs = $builder->orderBy('logged_at', 'DESC')->limit($perPage, $offset)->get()->getResultArray();
        $phpTz = $this->timezoneService->getOrgTimezone((int) ($filters['organization_id'] ?? 0));
        $logs = $this->timezoneService->applyToCollection($logs, $phpTz, ['logged_at', 'created_at']);

        return [
            'data' => $logs,
            'pagination' => [
                'current_page' => (int)$page,
                'per_page' => (int)$perPage,
                'total' => $total,
                'total_pages' => ceil($total / $perPage)
            ]
        ];
    }

    public function getProductivityStats(int $userId, string $startDate, string $endDate): array
    {
        $builder = $this->activityLogModel->builder();
        
        $stats = $builder->select('category, SUM(duration_seconds) as total_seconds, COUNT(*) as count')
            ->where('user_id', $userId)
            ->where('logged_at >=', $startDate)
            ->where('logged_at <=', $endDate)
            ->groupBy('category')
            ->get()
            ->getResultArray();

        return $stats;
    }

    private function isBrowserApp(string $appName): bool
    {
        return (bool) preg_match('/chrome|firefox|edge|msedge|brave|opera|safari/i', $appName);
    }

    public function getTopApps(int $userId, string $startDate, string $endDate, int $limit = 10): array
    {
        $rows = $this->db->table('activity_logs')
            ->select('app_name, category, SUM(CASE WHEN duration_seconds > 0 THEN duration_seconds ELSE 60 END) as duration_seconds, COUNT(*) as event_count')
            ->where('user_id', $userId)
            ->where('logged_at >=', $startDate)
            ->where('logged_at <=', $endDate)
            ->groupBy('app_name, category')
            ->orderBy('duration_seconds', 'DESC')
            ->get()
            ->getResultArray();

        $rows = array_values(array_filter($rows, fn ($row) => trim((string) ($row['app_name'] ?? '')) !== ''));
        usort($rows, fn ($a, $b) => ((int) $b['duration_seconds']) <=> ((int) $a['duration_seconds']));
        $rows = array_slice($rows, 0, $limit);

        $totalSeconds = (int) array_sum(array_map(fn ($r) => (int) $r['duration_seconds'], $rows));

        $apps = array_map(function ($row) use ($totalSeconds) {
            $seconds = (int) $row['duration_seconds'];
            return [
                'app_name' => $row['app_name'],
                'category' => $row['category'] ?? 'uncategorized',
                'duration_seconds' => $seconds,
                'event_count' => (int) $row['event_count'],
                'percentage' => $totalSeconds > 0 ? round(($seconds / $totalSeconds) * 100, 1) : 0,
            ];
        }, $rows);

        return [
            'apps' => $apps,
            'tabs' => $this->getTopBrowserTabs($userId, $startDate, $endDate),
            'total_seconds' => $totalSeconds,
            'total_events' => (int) $this->db->table('activity_logs')
                ->where('user_id', $userId)
                ->where('logged_at >=', $startDate)
                ->where('logged_at <=', $endDate)
                ->countAllResults(),
        ];
    }

    private function getTopBrowserTabs(int $userId, string $startDate, string $endDate, int $limit = 10): array
    {
        $rows = $this->db->table('activity_logs')
            ->select('app_name, window_title, url, category, SUM(CASE WHEN duration_seconds > 0 THEN duration_seconds ELSE 60 END) as duration_seconds')
            ->where('user_id', $userId)
            ->where('logged_at >=', $startDate)
            ->where('logged_at <=', $endDate)
            ->where('window_title !=', '')
            ->groupBy('app_name, window_title, url, category')
            ->orderBy('duration_seconds', 'DESC')
            ->get()
            ->getResultArray();

        $rows = array_values(array_filter($rows, function ($row) {
            $title = (string) ($row['window_title'] ?? '');
            $app = (string) ($row['app_name'] ?? '');
            if ($title === '') {
                return false;
            }
            return $this->isBrowserApp($app) || !empty($row['url']);
        }));

        usort($rows, fn ($a, $b) => ((int) $b['duration_seconds']) <=> ((int) $a['duration_seconds']));

        $merged = [];
        foreach ($rows as $row) {
            $title = (string) ($row['window_title'] ?? '');
            $url = (string) ($row['url'] ?? '');
            $displayName = $this->resolveBrowserTabDisplayName($title, $url);
            $seconds = (int) ($row['duration_seconds'] ?? 0);

            if (!isset($merged[$displayName])) {
                $merged[$displayName] = [
                    'display_name' => $displayName,
                    'window_title' => $title,
                    'url' => $url,
                    'category' => $row['category'] ?? 'uncategorized',
                    'duration_seconds' => 0,
                ];
            }

            $merged[$displayName]['duration_seconds'] += $seconds;

            // Unproductive beats productive — if any segment was unproductive,
            // the whole tab entry should display as unproductive.
            $categories = ['unproductive' => 3, 'productive' => 2, 'neutral' => 1, 'uncategorized' => 0];
            $current = $categories[$merged[$displayName]['category']] ?? 0;
            $incoming = $categories[$row['category'] ?? 'uncategorized'] ?? 0;
            if ($incoming > $current) {
                $merged[$displayName]['category'] = $row['category'] ?? 'uncategorized';
            }
        }

        $browserRows = array_values($merged);
        usort($browserRows, fn ($a, $b) => ((int) $b['duration_seconds']) <=> ((int) $a['duration_seconds']));
        $browserRows = array_slice($browserRows, 0, $limit);

        $totalSeconds = (int) array_sum(array_map(fn ($r) => (int) $r['duration_seconds'], $browserRows));

        return array_map(function ($row) use ($totalSeconds) {
            $seconds = (int) $row['duration_seconds'];

            return [
                'display_name' => $row['display_name'],
                'window_title' => $row['window_title'],
                'url' => $row['url'] ?? '',
                'category' => $row['category'] ?? 'uncategorized',
                'duration_seconds' => $seconds,
                'percentage' => $totalSeconds > 0 ? round(($seconds / $totalSeconds) * 100, 1) : 0,
            ];
        }, $browserRows);
    }

    private function resolveBrowserTabDisplayName(string $windowTitle, string $url = ''): string
    {
        $title = trim($windowTitle);
        $urlHost = $this->hostnameFromUrl($url);

        if ($urlHost !== null) {
            return $this->formatHostnameLabel($urlHost);
        }

        if ($title === '') {
            return 'Unknown';
        }

        if (preg_match('/^localhost\b/i', $title) || preg_match('/\blocalhost\b/i', $title) || preg_match('/\bphpmyadmin\b/i', $title)) {
            return 'Localhost';
        }

        if (preg_match('/\s[-–—]\s*YouTube\s*$/i', $title)) {
            return 'YouTube';
        }

        $cleaned = preg_replace('/\s*[-–—]\s*(Google Chrome|Mozilla Firefox|Microsoft(?:\s*Edge)?)\s*$/i', '', $title) ?? $title;
        $cleaned = trim(preg_replace('/^\(\d+\)\s*/', '', $cleaned) ?? $cleaned);

        if (strcasecmp($cleaned, 'YouTube') === 0) {
            return 'YouTube';
        }

        if (preg_match('/^([a-z0-9][-a-z0-9]*(?:\.[a-z0-9][-a-z0-9]*)+)(?:\/[^\s]*)?/i', $cleaned, $domainMatch)) {
            return $this->formatHostnameLabel(strtolower($domainMatch[1]));
        }

        $brands = [
            ['pattern' => '/\btiktok\b/i', 'label' => 'TikTok'],
            ['pattern' => '/\byoutube\b/i', 'label' => 'YouTube'],
            ['pattern' => '/\bgithub\b/i', 'label' => 'GitHub'],
            ['pattern' => '/\bgitlab\b/i', 'label' => 'GitLab'],
            ['pattern' => '/\bstackoverflow\b/i', 'label' => 'Stack Overflow'],
            ['pattern' => '/\bfacebook\b/i', 'label' => 'Facebook'],
            ['pattern' => '/\binstagram\b/i', 'label' => 'Instagram'],
            ['pattern' => '/\blinkedin\b/i', 'label' => 'LinkedIn'],
            ['pattern' => '/\bnetflix\b/i', 'label' => 'Netflix'],
            ['pattern' => '/\breddit\b/i', 'label' => 'Reddit'],
        ];

        foreach ($brands as $brand) {
            if (preg_match($brand['pattern'], $cleaned)) {
                return $brand['label'];
            }
        }

        $beforeDash = trim(explode(' - ', str_replace(['–', '—'], '-', $cleaned))[0] ?? $cleaned);
        foreach ($brands as $brand) {
            if (preg_match($brand['pattern'], $beforeDash)) {
                return $brand['label'];
            }
        }

        if (strcasecmp($beforeDash, 'New Tab') === 0) {
            return 'New Tab';
        }

        // WAMP/local dev: tab title is often just the PHP filename with no URL captured.
        if (preg_match('/\.(php|tsx|ts|jsx|js|vue|html|css|json|md|sql)\b/i', $beforeDash)) {
            return 'Localhost';
        }

        return mb_strlen($beforeDash) > 32 ? mb_substr($beforeDash, 0, 32) . '…' : $beforeDash;
    }

    private function hostnameFromUrl(string $url): ?string
    {
        $raw = trim($url);
        if ($raw === '') {
            return null;
        }

        if (preg_match('/^https?:\/\/([^\/?#]+)/i', $raw, $match)) {
            return strtolower($match[1]);
        }

        if (preg_match('/^([a-z0-9][-a-z0-9]*(?:\.[a-z0-9][-a-z0-9]*)+)/i', $raw, $match)) {
            return strtolower($match[1]);
        }

        return null;
    }

    private function formatHostnameLabel(string $host): string
    {
        $h = strtolower(trim($host));
        if (in_array($h, ['localhost', '127.0.0.1', '::1'], true)) {
            return 'Localhost';
        }

        $known = [
            'tiktok.com' => 'TikTok',
            'www.tiktok.com' => 'TikTok',
            'youtube.com' => 'YouTube',
            'www.youtube.com' => 'YouTube',
            'm.youtube.com' => 'YouTube',
            'github.com' => 'GitHub',
            'www.github.com' => 'GitHub',
            'gitlab.com' => 'GitLab',
            'stackoverflow.com' => 'Stack Overflow',
            'www.stackoverflow.com' => 'Stack Overflow',
        ];

        if (isset($known[$h])) {
            return $known[$h];
        }

        $parts = array_values(array_filter(explode('.', $h)));
        if (count($parts) >= 2) {
            $name = $parts[0];
            $tld = $parts[count($parts) - 1];
            $cap = ucfirst($name);
            if ($tld === 'com') {
                return $cap . '.com';
            }
            if (in_array($tld, ['app', 'io', 'dev'], true)) {
                return $cap . '.' . $tld;
            }
            if (count($parts) === 3 && $parts[1] === 'vercel') {
                return $cap . '.com';
            }
        }

        return $host;
    }
}
