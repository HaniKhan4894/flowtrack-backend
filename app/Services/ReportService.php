<?php

namespace App\Services;

use App\Models\TimeEntryModel;
use App\Models\ProjectModel;
use App\Models\UserModel;

class ReportService
{
    protected $timeEntryModel;
    protected $projectModel;
    protected $userModel;
    protected $db;

    public function __construct()
    {
        $this->timeEntryModel = new TimeEntryModel();
        $this->projectModel = new ProjectModel();
        $this->userModel = new UserModel();
        $this->db = \Config\Database::connect();
    }

    private function normalizeStartDate(string $date): string
    {
        return strlen($date) <= 10 ? $date . ' 00:00:00' : $date;
    }

    private function normalizeEndDate(string $date): string
    {
        return strlen($date) <= 10 ? $date . ' 23:59:59' : $date;
    }

    private function applyDateFilters($builder, array $filters, string $column = 'started_at'): void
    {
        if (isset($filters['start_date'])) {
            $builder->where($column . ' >=', $this->normalizeStartDate($filters['start_date']));
        }

        if (isset($filters['end_date'])) {
            $builder->where($column . ' <=', $this->normalizeEndDate($filters['end_date']));
        }
    }

    /**
     * Get time summary report
     */
    public function getTimeSummary(array $filters): array
    {
        $builder = $this->timeEntryModel->builder();

        if (isset($filters['user_id'])) {
            $builder->where('user_id', $filters['user_id']);
        }

        if (isset($filters['organization_id'])) {
            $builder->where('organization_id', $filters['organization_id']);
        }

        if (isset($filters['project_id'])) {
            $builder->where('project_id', $filters['project_id']);
        }

        $this->applyDateFilters($builder, $filters);

        $result = $builder->select('
            COUNT(*) as total_entries,
            COALESCE(SUM(duration_seconds), 0) as total_seconds,
            COALESCE(AVG(duration_seconds), 0) as avg_seconds,
            COALESCE(SUM(CASE WHEN is_billable = 1 THEN duration_seconds ELSE 0 END), 0) as billable_seconds,
            COALESCE(SUM(CASE WHEN is_billable = 0 THEN duration_seconds ELSE 0 END), 0) as non_billable_seconds
        ', false)->get()->getRowArray();

        return [
            'total_entries' => (int) ($result['total_entries'] ?? 0),
            'total_hours' => round(((int) ($result['total_seconds'] ?? 0)) / 3600, 2),
            'avg_hours' => round(((float) ($result['avg_seconds'] ?? 0)) / 3600, 2),
            'billable_hours' => round(((int) ($result['billable_seconds'] ?? 0)) / 3600, 2),
            'non_billable_hours' => round(((int) ($result['non_billable_seconds'] ?? 0)) / 3600, 2),
        ];
    }

    /**
     * Get project breakdown report
     */
    public function getProjectBreakdown(array $filters): array
    {
        $builder = $this->timeEntryModel->builder();

        if (isset($filters['user_id'])) {
            $builder->where('time_entries.user_id', $filters['user_id']);
        }

        if (isset($filters['organization_id'])) {
            $builder->where('time_entries.organization_id', $filters['organization_id']);
        }

        $this->applyDateFilters($builder, $filters, 'time_entries.started_at');

        $results = $builder->select('
            projects.id,
            projects.name,
            projects.client_name,
            COUNT(time_entries.id) as entries_count,
            SUM(time_entries.duration_seconds) as total_seconds
        ')
        ->join('projects', 'projects.id = time_entries.project_id', 'left')
        ->groupBy('projects.id')
        ->orderBy('total_seconds', 'DESC')
        ->get()
        ->getResultArray();

        return array_map(function($row) {
            $row['total_hours'] = round($row['total_seconds'] / 3600, 2);
            return $row;
        }, $results);
    }

    /**
     * Get user productivity report
     */
    public function getUserProductivity(int $userId, string $startDate, string $endDate): array
    {
        // Time summary
        $timeSummary = $this->getTimeSummary([
            'user_id' => $userId,
            'start_date' => $startDate,
            'end_date' => $endDate
        ]);

        // Daily breakdown
        $dailyBreakdown = $this->timeEntryModel->builder()
            ->select('DATE(started_at) as date, SUM(duration_seconds) as total_seconds')
            ->where('user_id', $userId)
            ->where('started_at >=', $startDate)
            ->where('started_at <=', $endDate)
            ->groupBy('DATE(started_at)')
            ->orderBy('date', 'ASC')
            ->get()
            ->getResultArray();

        $dailyBreakdown = array_map(function($row) {
            $row['hours'] = round($row['total_seconds'] / 3600, 2);
            return $row;
        }, $dailyBreakdown);

        return [
            'summary' => $timeSummary,
            'daily_breakdown' => $dailyBreakdown,
        ];
    }

    /**
     * Export report to CSV
     */
    public function exportToCSV(array $data, string $filename): string
    {
        $filepath = WRITEPATH . 'exports/' . $filename;

        // Create directory if not exists
        if (!is_dir(WRITEPATH . 'exports')) {
            mkdir(WRITEPATH . 'exports', 0755, true);
        }

        $file = fopen($filepath, 'w');

        // Write headers
        if (!empty($data)) {
            fputcsv($file, array_keys($data[0]));
        }

        // Write data
        foreach ($data as $row) {
            fputcsv($file, $row);
        }

        fclose($file);

        return $filepath;
    }

    /**
     * Get dashboard summary
     *
     * @param int $organizationId Organization scope
     * @param int|null $userId When set, stats are limited to this user (team member view)
     */
    public function getSummary(int $organizationId, ?int $userId = null): array
    {
        $timeFilters = ['organization_id' => $organizationId];
        if ($userId !== null) {
            $timeFilters['user_id'] = $userId;
        }
        $timeSummary = $this->getTimeSummary($timeFilters);

        $activeTimerBuilder = $this->timeEntryModel->builder()
            ->where('organization_id', $organizationId)
            ->where('ended_at', null);
        if ($userId !== null) {
            $activeTimerBuilder->where('user_id', $userId);
        }
        $activeTimers = $activeTimerBuilder->countAllResults();

        $teamCount = $userId !== null
            ? 1
            : $this->db->table('organization_members')->where('organization_id', $organizationId)->countAllResults();

        // Weekly breakdown (last 7 days)
        $weeklyStats = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-$i days"));
            $dayName = date('D', strtotime($date));

            $weeklyBuilder = $this->db->table('time_entries')
                ->select('COALESCE(SUM(duration_seconds), 0) as total_seconds', false)
                ->where('organization_id', $organizationId)
                ->where('DATE(started_at)', $date);
            if ($userId !== null) {
                $weeklyBuilder->where('user_id', $userId);
            }
            $row = $weeklyBuilder->get()->getRowArray();

            $seconds = (int) ($row['total_seconds'] ?? 0);

            $weeklyStats[] = [
                'day' => $dayName,
                'hours' => round($seconds / 3600, 2),
            ];
        }

        // Recent Activity
        $recentBuilder = $this->timeEntryModel->builder()
            ->select('
                time_entries.id,
                users.first_name,
                users.last_name,
                projects.name as project_name,
                time_entries.description,
                time_entries.started_at,
                time_entries.duration_seconds
            ')
            ->join('users', 'users.id = time_entries.user_id')
            ->join('projects', 'projects.id = time_entries.project_id', 'left')
            ->where('time_entries.organization_id', $organizationId);
        if ($userId !== null) {
            $recentBuilder->where('time_entries.user_id', $userId);
        }
        $recentActivity = $recentBuilder
            ->orderBy('time_entries.started_at', 'DESC')
            ->limit(5)
            ->get()
            ->getResultArray();

        $formattedActivity = array_map(function($act) {
            $start = strtotime($act['started_at']);
            $diff = time() - $start;
            
            if ($diff < 60) $time = 'just now';
            elseif ($diff < 3600) $time = floor($diff / 60) . 'm ago';
            else $time = floor($diff / 3600) . 'h ago';

            return [
                'id' => $act['id'],
                'user' => $act['first_name'] . ' ' . $act['last_name'],
                'action' => 'worked on',
                'target' => $act['project_name'] ?? 'General Task',
                'time' => $time,
                'duration' => $this->formatDuration($act['duration_seconds'] ?? 0)
            ];
        }, $recentActivity);

        return [
            'total_hours' => $timeSummary['total_hours'],
            'productivity_score' => 85, // Placeholder logic
            'team_count' => $teamCount,
            'active_timers' => $activeTimers,
            'recent_activity' => $formattedActivity,
            'weekly_stats' => $weeklyStats,
            'scope' => $userId !== null ? 'own' : 'organization',
        ];
    }

    /**
     * Get team leaderboard
     */
    public function getTeamLeaderboard(int $organizationId, string $startDate, string $endDate): array
    {
        $results = $this->timeEntryModel->builder()
            ->select('
                users.id,
                users.first_name,
                users.last_name,
                users.email,
                COUNT(time_entries.id) as entries_count,
                SUM(time_entries.duration_seconds) as total_seconds
            ')
            ->join('users', 'users.id = time_entries.user_id')
            ->where('time_entries.organization_id', $organizationId)
            ->where('time_entries.started_at >=', $this->normalizeStartDate($startDate))
            ->where('time_entries.started_at <=', $this->normalizeEndDate($endDate))
            ->groupBy('users.id')
            ->orderBy('total_seconds', 'DESC')
            ->limit(10)
            ->get()
            ->getResultArray();

        return array_map(function($row, $index) {
            $row['rank'] = $index + 1;
            $row['total_hours'] = round($row['total_seconds'] / 3600, 2);
            unset($row['total_seconds']);
            return $row;
        }, $results, array_keys($results));
    }

    private function formatDuration(int $seconds): string
    {
        $h = floor($seconds / 3600);
        $m = floor(($seconds % 3600) / 60);
        $s = $seconds % 60;
        return sprintf('%02d:%02d:%02d', $h, $m, $s);
    }
}
