<?php

namespace App\Services;

use App\Models\ActivityLogModel;
use App\Models\ProductivityRuleModel;

class ActivityLogService
{
    protected $activityLogModel;
    protected $productivityRuleModel;
    protected $db;

    public function __construct()
    {
        $this->activityLogModel = new ActivityLogModel();
        $this->productivityRuleModel = new ProductivityRuleModel();
        $this->db = \Config\Database::connect();
    }

    public function logActivity(int $timeEntryId, int $userId, array $data): array
    {
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
            'duration_seconds' => (int)($data['duration_seconds'] ?? 0),
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

        if (isset($filters['start_date'])) {
            $builder->where('logged_at >=', $filters['start_date']);
        }

        if (isset($filters['end_date'])) {
            $builder->where('logged_at <=', $filters['end_date']);
        }

        $page = $filters['page'] ?? 1;
        $perPage = $filters['per_page'] ?? 50;
        $offset = ($page - 1) * $perPage;

        $total = $builder->countAllResults(false);
        $logs = $builder->orderBy('logged_at', 'DESC')->limit($perPage, $offset)->get()->getResultArray();

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
}
