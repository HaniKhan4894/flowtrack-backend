<?php

namespace App\Services;

use App\Models\ActivityLogModel;
use App\Models\ProductivityRuleModel;
use App\Models\TimeEntryModel;
use App\Services\TimezoneService;

class ActivityLogService
{
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

    public function logActivity(int $timeEntryId, int $userId, array $data): array
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

        $insertData = [
            'time_entry_id'    => (int)$timeEntryId,
            'user_id'          => (int)$userId,
            'app_name'         => $data['app_name'] ?? 'Unknown',
            'window_title'     => $data['window_title'] ?? '',
            'url'              => $data['url'] ?? '',
            'category'         => $data['category'] ?? $this->categorizeActivity($data),
            'duration_seconds' => (int)($data['duration_seconds'] ?? 0) ?: 60,
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

    private function categorizeActivity(array $data): string
    {
        // Get productivity rules (simplified - should cache this)
        $rules = $this->productivityRuleModel
            ->where('is_active', true)
            ->findAll();

        foreach ($rules as $rule) {
            $match = false;

            switch ($rule['rule_type']) {
                case 'app':
                    if (isset($data['app_name']) && stripos($data['app_name'], $rule['pattern']) !== false) {
                        $match = true;
                    }
                    break;
                case 'url':
                    if (isset($data['url']) && stripos($data['url'], $rule['pattern']) !== false) {
                        $match = true;
                    }
                    break;
                case 'keyword':
                    if (isset($data['window_title']) && stripos($data['window_title'], $rule['pattern']) !== false) {
                        $match = true;
                    }
                    break;
            }

            if ($match) {
                return $rule['category'];
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

    private function isInternalTrackerApp(string $appName): bool
    {
        $name = strtolower(trim($appName));
        if ($name === '') {
            return true;
        }

        return str_contains($name, 'flowtrack')
            || $name === 'electron'
            || str_contains($name, 'flowtrack-desktop');
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

        $rows = array_values(array_filter($rows, fn ($row) => !$this->isInternalTrackerApp((string) ($row['app_name'] ?? ''))));
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
            'total_seconds' => $totalSeconds,
            'total_events' => (int) $this->db->table('activity_logs')
                ->where('user_id', $userId)
                ->where('logged_at >=', $startDate)
                ->where('logged_at <=', $endDate)
                ->countAllResults(),
        ];
    }
}
