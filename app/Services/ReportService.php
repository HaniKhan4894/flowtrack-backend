<?php

namespace App\Services;

use App\Models\TimeEntryModel;
use App\Models\ProjectModel;
use App\Models\UserModel;
use App\Services\TimezoneService;

class ReportService
{
    protected $timeEntryModel;
    protected $projectModel;
    protected $userModel;
    protected $timezoneService;
    protected $db;

    public function __construct()
    {
        $this->timeEntryModel = new TimeEntryModel();
        $this->projectModel = new ProjectModel();
        $this->userModel = new UserModel();
        $this->timezoneService = new TimezoneService();
        $this->db = \Config\Database::connect();
    }

    private function getOrgTimezone(array $filters): string
    {
        $orgId = (int) ($filters['organization_id'] ?? 0);

        return $this->timezoneService->getOrgTimezone($orgId);
    }

    private function normalizeStartDate(string $date, ?string $phpTz = null): string
    {
        if ($phpTz && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return $this->timezoneService->dateRangeUtc($date, $date, $phpTz)[0];
        }

        return strlen($date) <= 10 ? $date . ' 00:00:00' : $date;
    }

    private function normalizeEndDate(string $date, ?string $phpTz = null): string
    {
        if ($phpTz && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return $this->timezoneService->dateRangeUtc($date, $date, $phpTz)[1];
        }

        return strlen($date) <= 10 ? $date . ' 23:59:59' : $date;
    }

    private function applyDateFilters($builder, array $filters, string $column = 'started_at'): void
    {
        $phpTz = $this->getOrgTimezone($filters);

        if (isset($filters['start_date'])) {
            $builder->where($column . ' >=', $this->normalizeStartDate($filters['start_date'], $phpTz));
        }

        if (isset($filters['end_date'])) {
            $builder->where($column . ' <=', $this->normalizeEndDate($filters['end_date'], $phpTz));
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
        } elseif (!empty($filters['user_ids']) && is_array($filters['user_ids'])) {
            $builder->whereIn('user_id', array_map('intval', $filters['user_ids']));
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
        } elseif (!empty($filters['user_ids']) && is_array($filters['user_ids'])) {
            $builder->whereIn('time_entries.user_id', array_map('intval', $filters['user_ids']));
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
     * @param int[]|null $userIds When set (and userId null), stats are limited to these users
     */
    public function getSummary(int $organizationId, ?int $userId = null, ?array $userIds = null): array
    {
        $scopedUserIds = $this->resolveScopeUserIds($organizationId, $userId, $userIds);

        $timeFilters = ['organization_id' => $organizationId];
        if ($scopedUserIds !== null) {
            if (count($scopedUserIds) === 1) {
                $timeFilters['user_id'] = $scopedUserIds[0];
            }
        }
        $timeSummary = $this->getTimeSummaryForUsers($organizationId, $scopedUserIds, $timeFilters);

        $activeTimerBuilder = $this->timeEntryModel->builder()
            ->where('organization_id', $organizationId)
            ->where('ended_at', null);
        $this->applyUserScope($activeTimerBuilder, $scopedUserIds);
        $activeTimers = $activeTimerBuilder->countAllResults();

        $teamCount = $scopedUserIds !== null
            ? count($scopedUserIds)
            : $this->db->table('organization_members')->where('organization_id', $organizationId)->countAllResults();

        // Weekly breakdown (last 7 days in org timezone)
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        $weeklyStats = [];
        for ($i = 6; $i >= 0; $i--) {
            $localDate = (new \DateTime('now', new \DateTimeZone($phpTz)))
                ->modify("-{$i} days")
                ->format('Y-m-d');
            $dayName = (new \DateTime($localDate, new \DateTimeZone($phpTz)))->format('D');
            [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($localDate, $localDate, $phpTz);

            $weeklyBuilder = $this->db->table('time_entries')
                ->select('COALESCE(SUM(duration_seconds), 0) as total_seconds', false)
                ->where('organization_id', $organizationId)
                ->where('started_at >=', $startUtc)
                ->where('started_at <=', $endUtc);
            $this->applyUserScope($weeklyBuilder, $scopedUserIds, 'user_id');
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
        $this->applyUserScope($recentBuilder, $scopedUserIds, 'time_entries.user_id');
        $recentActivity = $recentBuilder
            ->orderBy('time_entries.started_at', 'DESC')
            ->limit(5)
            ->get()
            ->getResultArray();

        $formattedActivity = array_map(function ($act) use ($phpTz) {
            $start = strtotime($act['started_at']);
            $diff = time() - $start;

            if ($diff < 60) {
                $time = 'just now';
            } elseif ($diff < 3600) {
                $time = floor($diff / 60) . 'm ago';
            } else {
                $time = floor($diff / 3600) . 'h ago';
            }

            $localStarted = $this->timezoneService->toOrgLocal($act['started_at'], $phpTz);

            return [
                'id' => $act['id'],
                'user' => $act['first_name'] . ' ' . $act['last_name'],
                'action' => 'worked on',
                'target' => $act['project_name'] ?? 'General Task',
                'time' => $time,
                'started_at_local' => $localStarted,
                'duration' => $this->formatDuration($act['duration_seconds'] ?? 0),
            ];
        }, $recentActivity);

        $goalMetrics = $this->getGoalMetrics($organizationId, $scopedUserIds);

        return [
            'total_hours' => $timeSummary['total_hours'],
            'productivity_score' => $this->calculateProductivityScore($organizationId, $scopedUserIds),
            'team_count' => $teamCount,
            'active_timers' => $activeTimers,
            'recent_activity' => $formattedActivity,
            'weekly_stats' => $weeklyStats,
            'hours_today' => $goalMetrics['hours_today'],
            'daily_target' => $goalMetrics['daily_target'],
            'pct_of_target' => $goalMetrics['pct_of_target'],
            'scope' => $scopedUserIds === null ? 'organization' : (count($scopedUserIds) === 1 ? 'own' : 'team'),
        ];
    }

    /**
     * Active timers for scoped users (who is working now).
     *
     * @param int[] $userIds
     */
    public function getActiveSessions(int $organizationId, array $userIds): array
    {
        if (empty($userIds)) {
            return [];
        }

        // Split any open timers that crossed midnight before reporting live elapsed.
        try {
            (new TimeEntryService())->syncOpenTimersForUsers($userIds);
        } catch (\Throwable $e) {
            log_message('error', 'Active session day-boundary sync failed: ' . $e->getMessage());
        }

        $rows = $this->timeEntryModel->builder()
            ->select('
                time_entries.id,
                time_entries.user_id,
                time_entries.started_at,
                time_entries.paused_at,
                time_entries.paused_duration_seconds,
                users.first_name,
                users.last_name,
                users.email,
                projects.name as project_name
            ')
            ->join('users', 'users.id = time_entries.user_id')
            ->join('projects', 'projects.id = time_entries.project_id', 'left')
            ->where('time_entries.organization_id', $organizationId)
            ->where('time_entries.ended_at', null)
            ->whereIn('time_entries.user_id', $userIds)
            ->orderBy('time_entries.started_at', 'ASC')
            ->get()
            ->getResultArray();

        $now = time();

        return array_map(function (array $row) use ($now) {
            $startedAt = strtotime((string) $row['started_at']);
            $pausedSeconds = (int) ($row['paused_duration_seconds'] ?? 0);
            $elapsedSeconds = max(0, $now - $startedAt - $pausedSeconds);

            if (!empty($row['paused_at'])) {
                $elapsedSeconds = max(0, strtotime((string) $row['paused_at']) - $startedAt - $pausedSeconds);
            }

            return [
                'time_entry_id' => (int) $row['id'],
                'user_id' => (int) $row['user_id'],
                'user_name' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
                'email' => $row['email'] ?? null,
                'project_name' => $row['project_name'] ?? 'General Task',
                'started_at' => $row['started_at'],
                'is_paused' => !empty($row['paused_at']),
                'elapsed_seconds' => $elapsedSeconds,
                'elapsed' => $this->formatDuration($elapsedSeconds),
            ];
        }, $rows);
    }

    /**
     * Get team leaderboard
     *
     * @param int[]|null $userIds Optional scope filter
     */
    public function getTeamLeaderboard(int $organizationId, string $startDate, string $endDate, ?array $userIds = null): array
    {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        $startUtc = $this->normalizeStartDate($startDate, $phpTz);
        $endUtc = $this->normalizeEndDate($endDate, $phpTz);
        $periodDays = max(1, (int) ((strtotime($endDate) - strtotime($startDate)) / 86400) + 1);

        $builder = $this->timeEntryModel->builder()
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
            ->where('time_entries.started_at >=', $startUtc)
            ->where('time_entries.started_at <=', $endUtc);

        if ($userIds !== null && !empty($userIds)) {
            $builder->whereIn('time_entries.user_id', $userIds);
        }

        $results = $builder
            ->groupBy('users.id')
            ->orderBy('total_seconds', 'DESC')
            ->limit(10)
            ->get()
            ->getResultArray();

        $defaultDailyHours = $this->getDefaultDailyHours($organizationId);
        $memberTargets = $this->getMemberDailyTargets($organizationId);

        return array_map(function ($row, $index) use ($periodDays, $defaultDailyHours, $memberTargets) {
            $userId = (int) $row['id'];
            $totalHours = round(((int) $row['total_seconds']) / 3600, 2);
            $dailyTarget = $memberTargets[$userId] ?? $defaultDailyHours;
            $periodTarget = round($dailyTarget * $periodDays, 2);
            $goalAttainment = $periodTarget > 0
                ? (int) min(100, round(($totalHours / $periodTarget) * 100))
                : 0;

            $row['rank'] = $index + 1;
            $row['total_hours'] = $totalHours;
            $row['daily_target'] = $dailyTarget;
            $row['goal_attainment_pct'] = $goalAttainment;
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

    private function calculateProductivityScore(int $organizationId, ?array $scopedUserIds = null): int
    {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        $weekStart = (new \DateTime('now', new \DateTimeZone($phpTz)))
            ->modify('-6 days')
            ->format('Y-m-d');
        $today = (new \DateTime('now', new \DateTimeZone($phpTz)))->format('Y-m-d');
        [$startUtc] = $this->timezoneService->dayRangeUtc($weekStart, $phpTz);
        [, $endUtc] = $this->timezoneService->dayRangeUtc($today, $phpTz);

        $builder = $this->db->table('activity_logs')
            ->select('category, SUM(CASE WHEN activity_logs.duration_seconds > 0 THEN activity_logs.duration_seconds ELSE 60 END) as total_seconds', false)
            ->join('time_entries', 'time_entries.id = activity_logs.time_entry_id')
            ->where('time_entries.organization_id', $organizationId)
            ->where('activity_logs.logged_at >=', $startUtc)
            ->where('activity_logs.logged_at <=', $endUtc);

        $this->applyUserScope($builder, $scopedUserIds, 'activity_logs.user_id');

        $rows = $builder->groupBy('category')->get()->getResultArray();
        $productive = 0;
        $total = 0;

        foreach ($rows as $row) {
            $seconds = (int) ($row['total_seconds'] ?? 0);
            $total += $seconds;
            if (($row['category'] ?? '') === 'productive') {
                $productive += $seconds;
            }
        }

        return $total > 0 ? (int) round(($productive / $total) * 100) : 0;
    }

    /**
     * Hourly activity timeline for a single org-local day (Trackabi-style).
     */
    public function getHourlyTimeline(int $organizationId, int $userId, string $localDate): array
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $localDate)) {
            $localDate = (new \DateTime('now', new \DateTimeZone('UTC')))->format('Y-m-d');
        }

        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        [$startUtc, $endUtc] = $this->timezoneService->dayRangeUtc($localDate, $phpTz);

        $rows = $this->db->table('activity_logs')
            ->select('activity_logs.app_name, activity_logs.category, activity_logs.duration_seconds, activity_logs.logged_at')
            ->join('time_entries', 'time_entries.id = activity_logs.time_entry_id')
            ->where('time_entries.organization_id', $organizationId)
            ->where('activity_logs.user_id', $userId)
            ->where('activity_logs.logged_at >=', $startUtc)
            ->where('activity_logs.logged_at <=', $endUtc)
            ->orderBy('activity_logs.logged_at', 'ASC')
            ->get()
            ->getResultArray();

        $buckets = [];
        for ($h = 0; $h < 24; $h++) {
            $buckets[$h] = [
                'hour' => $h,
                'label' => sprintf('%02d:00', $h),
                'total_seconds' => 0,
                'productive_seconds' => 0,
                'unproductive_seconds' => 0,
                'neutral_seconds' => 0,
                'apps' => [],
            ];
        }

        $tz = new \DateTimeZone($phpTz);

        foreach ($rows as $row) {
            $appName = trim((string) ($row['app_name'] ?? ''));
            if ($appName === '') {
                continue;
            }

            $seconds = (int) ($row['duration_seconds'] ?? 0);
            if ($seconds <= 0) {
                $seconds = 60;
            }

            $loggedAt = (string) ($row['logged_at'] ?? '');
            if ($loggedAt === '') {
                continue;
            }

            try {
                $dt = new \DateTime($loggedAt, new \DateTimeZone('UTC'));
                $dt->setTimezone($tz);
                $hour = (int) $dt->format('G');
            } catch (\Exception $e) {
                continue;
            }

            if ($hour < 0 || $hour > 23) {
                continue;
            }

            $category = $row['category'] ?? 'uncategorized';
            $buckets[$hour]['total_seconds'] += $seconds;

            if ($category === 'productive') {
                $buckets[$hour]['productive_seconds'] += $seconds;
            } elseif ($category === 'unproductive') {
                $buckets[$hour]['unproductive_seconds'] += $seconds;
            } else {
                $buckets[$hour]['neutral_seconds'] += $seconds;
            }

            if ($appName !== '') {
                if (!isset($buckets[$hour]['apps'][$appName])) {
                    $buckets[$hour]['apps'][$appName] = [
                        'app_name' => $appName,
                        'category' => $category,
                        'seconds' => 0,
                    ];
                }
                $buckets[$hour]['apps'][$appName]['seconds'] += $seconds;
            }
        }

        $hours = [];
        $dayTotal = 0;
        $dayProductive = 0;
        $dayUnproductive = 0;
        $dayNeutral = 0;

        foreach ($buckets as $bucket) {
            $apps = array_values($bucket['apps']);
            usort($apps, fn ($a, $b) => $b['seconds'] <=> $a['seconds']);
            $apps = array_slice($apps, 0, 10);

            $hours[] = [
                'hour' => $bucket['hour'],
                'label' => $bucket['label'],
                'total_seconds' => $bucket['total_seconds'],
                'productive_seconds' => $bucket['productive_seconds'],
                'unproductive_seconds' => $bucket['unproductive_seconds'],
                'neutral_seconds' => $bucket['neutral_seconds'],
                'apps' => $apps,
            ];

            $dayTotal += $bucket['total_seconds'];
            $dayProductive += $bucket['productive_seconds'];
            $dayUnproductive += $bucket['unproductive_seconds'];
            $dayNeutral += $bucket['neutral_seconds'];
        }

        return [
            'date' => $localDate,
            'timezone' => $phpTz,
            'user_id' => $userId,
            'hours' => $hours,
            'summary' => [
                'total_seconds' => $dayTotal,
                'productive_seconds' => $dayProductive,
                'unproductive_seconds' => $dayUnproductive,
                'neutral_seconds' => $dayNeutral,
                'focus_score' => $dayTotal > 0 ? (int) round(($dayProductive / $dayTotal) * 100) : 0,
            ],
        ];
    }

    /**
     * @param int[]|null $userIds
     */
    private function resolveScopeUserIds(int $organizationId, ?int $userId, ?array $userIds): ?array
    {
        if ($userId !== null) {
            return [$userId];
        }

        if ($userIds !== null) {
            $filtered = array_values(array_unique(array_map('intval', $userIds)));
            $memberCount = $this->db->table('organization_members')
                ->where('organization_id', $organizationId)
                ->countAllResults();

            return count($filtered) >= $memberCount ? null : $filtered;
        }

        return null;
    }

    /**
     * @param int[]|null $userIds
     */
    private function applyUserScope($builder, ?array $userIds, string $column = 'user_id'): void
    {
        if ($userIds === null || empty($userIds)) {
            return;
        }

        if (count($userIds) === 1) {
            $builder->where($column, $userIds[0]);
            return;
        }

        $builder->whereIn($column, $userIds);
    }

    /**
     * @param int[]|null $userIds
     */
    private function getTimeSummaryForUsers(int $organizationId, ?array $userIds, array $baseFilters): array
    {
        if ($userIds === null || count($userIds) !== 1) {
            $builder = $this->timeEntryModel->builder()
                ->where('organization_id', $organizationId);

            $this->applyUserScope($builder, $userIds);

            if (isset($baseFilters['start_date']) || isset($baseFilters['end_date'])) {
                $this->applyDateFilters($builder, $baseFilters);
            }

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

        return $this->getTimeSummary($baseFilters);
    }

    /**
     * @param int[]|null $scopedUserIds
     */
    private function getGoalMetrics(int $organizationId, ?array $scopedUserIds): array
    {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        $today = (new \DateTime('now', new \DateTimeZone($phpTz)))->format('Y-m-d');
        [$startUtc, $endUtc] = $this->timezoneService->dayRangeUtc($today, $phpTz);

        $builder = $this->db->table('time_entries')
            ->select('COALESCE(SUM(duration_seconds), 0) as total_seconds', false)
            ->where('organization_id', $organizationId)
            ->where('started_at >=', $startUtc)
            ->where('started_at <=', $endUtc);
        $this->applyUserScope($builder, $scopedUserIds);

        $row = $builder->get()->getRowArray();
        $hoursToday = round(((int) ($row['total_seconds'] ?? 0)) / 3600, 2);

        $defaultDailyHours = $this->getDefaultDailyHours($organizationId);
        $memberTargets = $this->getMemberDailyTargets($organizationId);

        if ($scopedUserIds === null) {
            $members = $this->db->table('organization_members')
                ->select('user_id, daily_hours_target')
                ->where('organization_id', $organizationId)
                ->get()
                ->getResultArray();
            $dailyTarget = 0.0;
            foreach ($members as $member) {
                $target = $member['daily_hours_target'] ?? null;
                $dailyTarget += $target !== null && $target !== ''
                    ? (float) $target
                    : $defaultDailyHours;
            }
        } elseif (count($scopedUserIds) === 1) {
            $userId = $scopedUserIds[0];
            $dailyTarget = $memberTargets[$userId] ?? $defaultDailyHours;
        } else {
            $dailyTarget = 0.0;
            foreach ($scopedUserIds as $userId) {
                $dailyTarget += $memberTargets[$userId] ?? $defaultDailyHours;
            }
        }

        $dailyTarget = round((float) $dailyTarget, 2);
        $pctOfTarget = $dailyTarget > 0
            ? (int) min(100, round(($hoursToday / $dailyTarget) * 100))
            : 0;

        return [
            'hours_today' => $hoursToday,
            'daily_target' => $dailyTarget,
            'pct_of_target' => $pctOfTarget,
        ];
    }

    private function getDefaultDailyHours(int $organizationId): float
    {
        $org = $this->db->table('organizations')
            ->select('settings')
            ->where('id', $organizationId)
            ->get()
            ->getRowArray();

        $settings = [];
        if (!empty($org['settings'])) {
            $decoded = is_string($org['settings']) ? json_decode($org['settings'], true) : $org['settings'];
            $settings = is_array($decoded) ? $decoded : [];
        }

        $default = $settings['default_daily_hours'] ?? 8;

        return round((float) $default, 2);
    }

    /**
     * @return array<int, float>
     */
    private function getMemberDailyTargets(int $organizationId): array
    {
        $rows = $this->db->table('organization_members')
            ->select('user_id, daily_hours_target')
            ->where('organization_id', $organizationId)
            ->get()
            ->getResultArray();

        $targets = [];
        foreach ($rows as $row) {
            if ($row['daily_hours_target'] !== null && $row['daily_hours_target'] !== '') {
                $targets[(int) $row['user_id']] = round((float) $row['daily_hours_target'], 2);
            }
        }

        return $targets;
    }

    public function exportToPdf(array $data, string $filename, string $title = 'Report'): string
    {
        if (!is_dir(WRITEPATH . 'exports')) {
            mkdir(WRITEPATH . 'exports', 0755, true);
        }

        $filepath = WRITEPATH . 'exports/' . $filename;
        $rows = $this->normalizeExportRows($data);

        $html = '<html><head><style>
            body { font-family: DejaVu Sans, sans-serif; font-size: 12px; }
            h1 { font-size: 18px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
            th { background: #f5f5f5; }
        </style></head><body>';
        $html .= '<h1>' . htmlspecialchars($title) . '</h1>';
        $html .= '<p>Generated: ' . date('Y-m-d H:i:s') . '</p>';

        if (!empty($rows)) {
            $html .= '<table><thead><tr>';
            foreach (array_keys($rows[0]) as $header) {
                $html .= '<th>' . htmlspecialchars((string) $header) . '</th>';
            }
            $html .= '</tr></thead><tbody>';
            foreach ($rows as $row) {
                $html .= '<tr>';
                foreach ($row as $value) {
                    $html .= '<td>' . htmlspecialchars(is_scalar($value) ? (string) $value : json_encode($value)) . '</td>';
                }
                $html .= '</tr>';
            }
            $html .= '</tbody></table>';
        } else {
            $html .= '<p>No data available.</p>';
        }

        $html .= '</body></html>';

        $dompdf = new \Dompdf\Dompdf();
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'landscape');
        $dompdf->render();
        file_put_contents($filepath, $dompdf->output());

        return $filepath;
    }

    public function exportToExcel(array $data, string $filename): string
    {
        if (!is_dir(WRITEPATH . 'exports')) {
            mkdir(WRITEPATH . 'exports', 0755, true);
        }

        $filepath = WRITEPATH . 'exports/' . $filename;
        $rows = $this->normalizeExportRows($data);

        $spreadsheet = new \PhpOffice\PhpSpreadsheet\Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();

        if (!empty($rows)) {
            $headers = array_keys($rows[0]);
            $col = 1;
            foreach ($headers as $header) {
                $sheet->setCellValue([$col, 1], $header);
                $col++;
            }

            $rowNum = 2;
            foreach ($rows as $row) {
                $col = 1;
                foreach ($headers as $header) {
                    $sheet->setCellValue([$col, $rowNum], $row[$header] ?? '');
                    $col++;
                }
                $rowNum++;
            }
        }

        $writer = new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($spreadsheet);
        $writer->save($filepath);

        return $filepath;
    }

    private function normalizeExportRows(array $data): array
    {
        if (empty($data)) {
            return [];
        }

        if (isset($data[0]) && is_array($data[0])) {
            return array_map(function ($row) {
                return array_map(fn ($v) => is_scalar($v) || $v === null ? $v : json_encode($v), $row);
            }, $data);
        }

        $flat = [];
        foreach ($data as $key => $value) {
            $flat[$key] = is_scalar($value) || $value === null ? $value : json_encode($value);
        }

        return [$flat];
    }

    public function getTopUrls(int $organizationId, string $startDate, string $endDate, ?int $userId = null, int $limit = 20): array
    {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($startDate, $endDate, $phpTz);

        $builder = $this->db->table('activity_logs al')
            ->select('al.url, al.category, SUM(CASE WHEN al.duration_seconds > 0 THEN al.duration_seconds ELSE 60 END) as total_seconds, COUNT(*) as visit_count')
            ->join('time_entries te', 'te.id = al.time_entry_id')
            ->where('te.organization_id', $organizationId)
            ->where('al.logged_at >=', $startUtc)
            ->where('al.logged_at <=', $endUtc)
            ->where('al.url !=', '')
            ->where('al.url IS NOT NULL');

        if ($userId) {
            $builder->where('al.user_id', $userId);
        }

        $rows = $builder->groupBy('al.url, al.category')
            ->orderBy('total_seconds', 'DESC')
            ->limit($limit)
            ->get()
            ->getResultArray();

        $totalSeconds = (int) array_sum(array_column($rows, 'total_seconds'));

        return [
            'urls' => array_map(function ($row) use ($totalSeconds) {
                $seconds = (int) $row['total_seconds'];
                return [
                    'url' => $row['url'],
                    'category' => $row['category'] ?? 'uncategorized',
                    'total_seconds' => $seconds,
                    'total_hours' => round($seconds / 3600, 2),
                    'visit_count' => (int) $row['visit_count'],
                    'percentage' => $totalSeconds > 0 ? round(($seconds / $totalSeconds) * 100, 1) : 0,
                ];
            }, $rows),
            'total_seconds' => $totalSeconds,
        ];
    }

    public function getOrgProductivity(int $organizationId, string $startDate, string $endDate): array
    {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($startDate, $endDate, $phpTz);

        $members = $this->db->table('organization_members om')
            ->select('om.user_id, users.first_name, users.last_name')
            ->join('users', 'users.id = om.user_id')
            ->where('om.organization_id', $organizationId)
            ->get()
            ->getResultArray();

        $results = [];
        foreach ($members as $member) {
            $userId = (int) $member['user_id'];
            $stats = $this->db->table('activity_logs al')
                ->select('al.category, SUM(CASE WHEN al.duration_seconds > 0 THEN al.duration_seconds ELSE 60 END) as total_seconds', false)
                ->join('time_entries te', 'te.id = al.time_entry_id')
                ->where('te.organization_id', $organizationId)
                ->where('al.user_id', $userId)
                ->where('al.logged_at >=', $startUtc)
                ->where('al.logged_at <=', $endUtc)
                ->groupBy('al.category')
                ->get()
                ->getResultArray();

            $productive = 0;
            $total = 0;
            foreach ($stats as $stat) {
                $seconds = (int) $stat['total_seconds'];
                $total += $seconds;
                if (($stat['category'] ?? '') === 'productive') {
                    $productive += $seconds;
                }
            }

            $timeSummary = $this->getTimeSummary([
                'organization_id' => $organizationId,
                'user_id' => $userId,
                'start_date' => $startDate,
                'end_date' => $endDate,
            ]);

            $results[] = [
                'user_id' => $userId,
                'first_name' => $member['first_name'],
                'last_name' => $member['last_name'],
                'total_hours' => $timeSummary['total_hours'],
                'productivity_score' => $total > 0 ? (int) round(($productive / $total) * 100) : 0,
                'productive_hours' => round($productive / 3600, 2),
            ];
        }

        usort($results, fn ($a, $b) => $b['productivity_score'] <=> $a['productivity_score']);

        return [
            'members' => $results,
            'organization_id' => $organizationId,
            'start_date' => $startDate,
            'end_date' => $endDate,
        ];
    }

    public function getProjectProfitability(int $organizationId, string $startDate, string $endDate): array
    {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($startDate, $endDate, $phpTz);

        $projects = $this->db->table('projects p')
            ->select('p.id, p.name, p.client_name, p.client_id, p.budget_amount, p.budget_hours, c.name as client_ref_name, c.default_rate')
            ->join('clients c', 'c.id = p.client_id', 'left')
            ->where('p.organization_id', $organizationId)
            ->get()
            ->getResultArray();

        $results = [];
        foreach ($projects as $project) {
            $projectId = (int) $project['id'];

            $time = $this->db->table('time_entries')
                ->select('COALESCE(SUM(duration_seconds), 0) as total_seconds, COALESCE(SUM(CASE WHEN is_billable = 1 THEN duration_seconds ELSE 0 END), 0) as billable_seconds', false)
                ->where('organization_id', $organizationId)
                ->where('project_id', $projectId)
                ->where('started_at >=', $startUtc)
                ->where('started_at <=', $endUtc)
                ->get()
                ->getRowArray();

            $totalSeconds = (int) ($time['total_seconds'] ?? 0);
            $billableSeconds = (int) ($time['billable_seconds'] ?? 0);
            $hours = $totalSeconds / 3600;
            $billableHours = $billableSeconds / 3600;

            $rate = $project['default_rate'] !== null ? (float) $project['default_rate'] : null;
            $revenue = $rate !== null ? round($billableHours * $rate, 2) : null;
            $budgetAmount = $project['budget_amount'] !== null ? (float) $project['budget_amount'] : null;
            $margin = ($revenue !== null && $budgetAmount !== null) ? round($revenue - $budgetAmount, 2) : null;

            $results[] = [
                'project_id' => $projectId,
                'project_name' => $project['name'],
                'client_name' => $project['client_ref_name'] ?? $project['client_name'],
                'total_hours' => round($hours, 2),
                'billable_hours' => round($billableHours, 2),
                'estimated_revenue' => $revenue,
                'budget_amount' => $budgetAmount,
                'margin' => $margin,
            ];
        }

        usort($results, fn ($a, $b) => ($b['estimated_revenue'] ?? 0) <=> ($a['estimated_revenue'] ?? 0));

        return [
            'projects' => $results,
            'start_date' => $startDate,
            'end_date' => $endDate,
        ];
    }

    public function getIdleBreakdown(int $organizationId, string $startDate, string $endDate, ?int $userId = null): array
    {
        $builder = $this->db->table('daily_idle_stats dis')
            ->select('dis.*, users.first_name, users.last_name')
            ->join('users', 'users.id = dis.user_id')
            ->where('dis.organization_id', $organizationId)
            ->where('dis.date >=', $startDate)
            ->where('dis.date <=', $endDate);

        if ($userId) {
            $builder->where('dis.user_id', $userId);
        }

        $rows = $builder->orderBy('dis.date', 'ASC')->get()->getResultArray();

        $totalIdle = 0;
        $totalActive = 0;
        $byUser = [];

        foreach ($rows as $row) {
            $idle = (int) $row['idle_seconds'];
            $active = (int) $row['active_seconds'];
            $totalIdle += $idle;
            $totalActive += $active;
            $uid = (int) $row['user_id'];

            if (!isset($byUser[$uid])) {
                $byUser[$uid] = [
                    'user_id' => $uid,
                    'first_name' => $row['first_name'],
                    'last_name' => $row['last_name'],
                    'idle_seconds' => 0,
                    'active_seconds' => 0,
                ];
            }
            $byUser[$uid]['idle_seconds'] += $idle;
            $byUser[$uid]['active_seconds'] += $active;
        }

        $users = array_values(array_map(function ($u) {
            $total = $u['idle_seconds'] + $u['active_seconds'];
            return [
                'user_id' => $u['user_id'],
                'first_name' => $u['first_name'],
                'last_name' => $u['last_name'],
                'idle_seconds' => $u['idle_seconds'],
                'active_seconds' => $u['active_seconds'],
                'idle_hours' => round($u['idle_seconds'] / 3600, 2),
                'active_hours' => round($u['active_seconds'] / 3600, 2),
                'idle_percentage' => $total > 0 ? round(($u['idle_seconds'] / $total) * 100, 1) : 0,
            ];
        }, $byUser));

        usort($users, static fn ($a, $b) => $b['idle_seconds'] <=> $a['idle_seconds']);

        $grandTotal = $totalIdle + $totalActive;

        return [
            'summary' => [
                'idle_hours' => round($totalIdle / 3600, 2),
                'active_hours' => round($totalActive / 3600, 2),
                'idle_percentage' => $grandTotal > 0 ? round(($totalIdle / $grandTotal) * 100, 1) : 0,
            ],
            'users' => $users,
            'daily' => array_map(fn ($r) => [
                'date' => $r['date'],
                'user_id' => (int) $r['user_id'],
                'idle_seconds' => (int) $r['idle_seconds'],
                'active_seconds' => (int) $r['active_seconds'],
            ], $rows),
            'start_date' => $startDate,
            'end_date' => $endDate,
        ];
    }

    /**
     * Month calendar of logged hours (org timezone) with week totals + project list.
     *
     * Filters: organization_id, year, month, user_id?, user_ids?
     */
    public function getHoursCalendar(array $filters): array
    {
        $organizationId = (int) ($filters['organization_id'] ?? 0);
        $phpTz = $this->getOrgTimezone($filters);
        $tz = new \DateTimeZone($phpTz);

        $nowLocal = new \DateTime('now', $tz);
        $year = (int) ($filters['year'] ?? $nowLocal->format('Y'));
        $month = (int) ($filters['month'] ?? $nowLocal->format('n'));
        if ($month < 1 || $month > 12) {
            $month = (int) $nowLocal->format('n');
        }

        $startLocal = sprintf('%04d-%02d-01', $year, $month);
        $monthStart = new \DateTime($startLocal, $tz);
        $monthEnd = (clone $monthStart)->modify('last day of this month');
        $endLocal = $monthEnd->format('Y-m-d');
        $daysInMonth = (int) $monthEnd->format('j');

        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($startLocal, $endLocal, $phpTz);

        $builder = $this->db->table('time_entries')
            ->select('started_at, duration_seconds, project_id, ended_at')
            ->where('organization_id', $organizationId)
            ->where('started_at >=', $startUtc)
            ->where('started_at <=', $endUtc)
            ->where('ended_at IS NOT NULL', null, false);

        if (isset($filters['user_id'])) {
            $builder->where('user_id', (int) $filters['user_id']);
        } elseif (!empty($filters['user_ids']) && is_array($filters['user_ids'])) {
            $builder->whereIn('user_id', array_map('intval', $filters['user_ids']));
        }

        $rows = $builder->get()->getResultArray();

        $secondsByDate = [];
        $projectsByDate = [];
        $projectSeconds = [];
        $allProjects = [];

        foreach ($rows as $row) {
            $seconds = (int) ($row['duration_seconds'] ?? 0);
            if ($seconds <= 0) {
                continue;
            }

            try {
                $localDate = (new \DateTime((string) $row['started_at'], new \DateTimeZone('UTC')))
                    ->setTimezone($tz)
                    ->format('Y-m-d');
            } catch (\Exception $e) {
                continue;
            }

            $secondsByDate[$localDate] = ($secondsByDate[$localDate] ?? 0) + $seconds;

            $projectId = isset($row['project_id']) && $row['project_id'] !== null && $row['project_id'] !== ''
                ? (int) $row['project_id']
                : 0;

            if ($projectId > 0) {
                $projectsByDate[$localDate][$projectId] = true;
                $projectSeconds[$projectId] = ($projectSeconds[$projectId] ?? 0) + $seconds;
                $allProjects[$projectId] = true;
            }
        }

        // Calendar grid: pad to Monday-start weeks
        $padBefore = ((int) $monthStart->format('N')) - 1; // 0=Mon … 6=Sun
        $gridStart = (clone $monthStart)->modify("-{$padBefore} days");
        $totalCells = (int) ceil(($padBefore + $daysInMonth) / 7) * 7;

        $days = [];
        $cursor = clone $gridStart;
        for ($i = 0; $i < $totalCells; $i++) {
            $dateStr = $cursor->format('Y-m-d');
            $inMonth = $cursor->format('Y-m') === $monthStart->format('Y-m');
            $seconds = $inMonth ? (int) ($secondsByDate[$dateStr] ?? 0) : 0;
            $days[] = [
                'date' => $dateStr,
                'day' => (int) $cursor->format('j'),
                'in_month' => $inMonth,
                'is_today' => $dateStr === $nowLocal->format('Y-m-d'),
                'seconds' => $seconds,
                'hours_label' => $this->formatHoursLabel($seconds),
                'project_count' => $inMonth ? count($projectsByDate[$dateStr] ?? []) : 0,
            ];
            $cursor->modify('+1 day');
        }

        $weeks = [];
        $weekChunks = array_chunk($days, 7);
        foreach ($weekChunks as $index => $chunk) {
            $inMonthDays = array_values(array_filter($chunk, static fn ($d) => $d['in_month']));
            if ($inMonthDays === []) {
                continue;
            }
            $weekSeconds = array_sum(array_map(static fn ($d) => (int) $d['seconds'], $inMonthDays));
            $weekProjects = [];
            foreach ($inMonthDays as $d) {
                foreach (array_keys($projectsByDate[$d['date']] ?? []) as $pid) {
                    $weekProjects[$pid] = true;
                }
            }
            $weeks[] = [
                'week_index' => $index + 1,
                'start_date' => $chunk[0]['date'],
                'end_date' => $chunk[6]['date'],
                'seconds' => $weekSeconds,
                'hours_label' => $this->formatHoursLabel($weekSeconds),
                'project_count' => count($weekProjects),
            ];
        }

        $projectIds = array_keys($projectSeconds);
        $projectNames = [];
        if ($projectIds !== []) {
            $nameRows = $this->db->table('projects')
                ->select('id, name')
                ->whereIn('id', $projectIds)
                ->get()
                ->getResultArray();
            foreach ($nameRows as $nr) {
                $projectNames[(int) $nr['id']] = (string) $nr['name'];
            }
        }

        arsort($projectSeconds);
        $projects = [];
        foreach ($projectSeconds as $pid => $secs) {
            $projects[] = [
                'id' => (int) $pid,
                'name' => $projectNames[$pid] ?? 'Project',
                'seconds' => (int) $secs,
                'hours_label' => $this->formatHoursLabel((int) $secs),
            ];
        }

        $totalSeconds = array_sum($secondsByDate);

        $scope = 'all';
        if (isset($filters['user_id'])) {
            $scope = 'user';
        } elseif (!empty($filters['user_ids'])) {
            $scope = 'team';
        }

        return [
            'year' => $year,
            'month' => $month,
            'month_label' => $monthStart->format('F Y'),
            'start_date' => $startLocal,
            'end_date' => $endLocal,
            'timezone' => $phpTz,
            'scope' => $scope,
            'user_id' => isset($filters['user_id']) ? (int) $filters['user_id'] : null,
            'total_seconds' => $totalSeconds,
            'hours_label' => $this->formatHoursLabel($totalSeconds),
            'project_count' => count($allProjects),
            'days' => $days,
            'weeks' => $weeks,
            'projects' => $projects,
        ];
    }

    /** Trackabi-style "55:24" (hours:minutes). */
    private function formatHoursLabel(int $seconds): string
    {
        $seconds = max(0, $seconds);
        $h = intdiv($seconds, 3600);
        $m = intdiv($seconds % 3600, 60);

        return sprintf('%d:%02d', $h, $m);
    }
}
