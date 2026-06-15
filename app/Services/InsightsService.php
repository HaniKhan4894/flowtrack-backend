<?php

namespace App\Services;

class InsightsService
{
    protected $db;
    protected ReportService $reportService;
    protected TimezoneService $timezoneService;
    protected ActivityLogService $activityLogService;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
        $this->reportService = new ReportService();
        $this->timezoneService = new TimezoneService();
        $this->activityLogService = new ActivityLogService();
    }

    public function getWeeklyManagerSummary(int $organizationId, ?int $managerUserId = null): array
    {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        $endLocal = (new \DateTime('now', new \DateTimeZone($phpTz)))->format('Y-m-d');
        $startLocal = (new \DateTime('now', new \DateTimeZone($phpTz)))->modify('-6 days')->format('Y-m-d');
        $prevEndLocal = (new \DateTime($startLocal, new \DateTimeZone($phpTz)))->modify('-1 day')->format('Y-m-d');
        $prevStartLocal = (new \DateTime($prevEndLocal, new \DateTimeZone($phpTz)))->modify('-6 days')->format('Y-m-d');

        $scopeUserIds = null;
        if ($managerUserId !== null) {
            $scopeUserIds = $this->resolveTeamUserIds($organizationId, $managerUserId);
        }

        $current = $this->reportService->getOrgProductivity($organizationId, $startLocal, $endLocal);
        $previous = $this->reportService->getOrgProductivity($organizationId, $prevStartLocal, $prevEndLocal);

        $currentAgg = $this->aggregateProductivity($current);
        $prevAgg = $this->aggregateProductivity($previous);
        $currentHours = $currentAgg['total_hours'];
        $prevHours = $prevAgg['total_hours'];
        $hoursDelta = $currentHours - $prevHours;

        $currentProductive = $currentAgg['productive_percent'];
        $prevProductive = $prevAgg['productive_percent'];

        $highlights = [];
        if ($hoursDelta > 2) {
            $highlights[] = "Team logged {$hoursDelta}h more than last week.";
        } elseif ($hoursDelta < -2) {
            $highlights[] = 'Team hours dropped ' . abs($hoursDelta) . 'h vs last week.';
        }
        if ($currentProductive - $prevProductive > 5) {
            $highlights[] = 'Productivity score improved by ' . round($currentProductive - $prevProductive, 1) . '%.';
        } elseif ($prevProductive - $currentProductive > 5) {
            $highlights[] = 'Productivity score declined by ' . round($prevProductive - $currentProductive, 1) . '%.';
        }

        $topMembers = $this->getTopMembersForRange($organizationId, $startLocal, $endLocal, $scopeUserIds, 5);
        $distractions = $this->getTopDistractions($organizationId, $startLocal, $endLocal, $scopeUserIds, 5);

        return [
            'period' => ['start' => $startLocal, 'end' => $endLocal],
            'comparison_period' => ['start' => $prevStartLocal, 'end' => $prevEndLocal],
            'total_hours' => $currentHours,
            'hours_delta' => round($hoursDelta, 2),
            'productive_percent' => $currentProductive,
            'productive_delta' => round($currentProductive - $prevProductive, 1),
            'highlights' => $highlights,
            'top_members' => $topMembers,
            'top_distractions' => $distractions,
            'daily_breakdown' => [],
        ];
    }

    protected function aggregateProductivity(array $data): array
    {
        $members = $data['members'] ?? [];
        $totalHours = array_sum(array_map(fn ($m) => (float) ($m['total_hours'] ?? 0), $members));
        $scores = array_map(fn ($m) => (float) ($m['productivity_score'] ?? 0), $members);
        $avgScore = count($scores) > 0 ? array_sum($scores) / count($scores) : 0;

        return [
            'total_hours' => round($totalHours, 2),
            'productive_percent' => round($avgScore, 1),
            'unproductive_percent' => round(max(0, 100 - $avgScore), 1),
        ];
    }

    public function getBenchmarks(int $organizationId, string $startDate, string $endDate): array
    {
        $profitability = $this->reportService->getProjectProfitability($organizationId, $startDate, $endDate);
        $byProject = $profitability['projects'] ?? [];
        $budgetMap = $this->db->table('projects')
            ->select('id, budget_hours')
            ->where('organization_id', $organizationId)
            ->get()
            ->getResultArray();
        $budgetByProject = [];
        foreach ($budgetMap as $row) {
            $budgetByProject[(int) $row['id']] = (float) ($row['budget_hours'] ?? 0);
        }

        foreach ($byProject as &$project) {
            $projectId = (int) ($project['project_id'] ?? 0);
            $hours = (float) ($project['total_hours'] ?? 0);
            $project['hours'] = $hours;
            $budget = $budgetByProject[$projectId] ?? 0;
            $project['budget_hours'] = $budget;
        }
        unset($project);
        $byRole = $this->getRoleBenchmarks($organizationId, $startDate, $endDate);
        $bySprint = $this->getSprintBenchmarks($organizationId);

        $orgAvgHours = 0;
        $projectCount = count($byProject);
        if ($projectCount > 0) {
            $orgAvgHours = array_sum(array_column($byProject, 'hours')) / $projectCount;
        }

        foreach ($byProject as &$project) {
            $hours = (float) ($project['hours'] ?? 0);
            $project['vs_org_avg_hours'] = $orgAvgHours > 0 ? round((($hours - $orgAvgHours) / $orgAvgHours) * 100, 1) : 0;
            $budget = (float) ($project['budget_hours'] ?? 0);
            $project['budget_utilization'] = $budget > 0 ? round(($hours / $budget) * 100, 1) : null;
        }
        unset($project);

        return [
            'period' => ['start' => $startDate, 'end' => $endDate],
            'org_avg_project_hours' => round($orgAvgHours, 2),
            'by_project' => $byProject,
            'by_role' => $byRole,
            'by_sprint' => $bySprint,
        ];
    }

    public function getWorkPatterns(int $organizationId, ?int $userId = null, int $days = 14): array
    {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        $endLocal = (new \DateTime('now', new \DateTimeZone($phpTz)))->format('Y-m-d');
        $startLocal = (new \DateTime('now', new \DateTimeZone($phpTz)))->modify('-' . ($days - 1) . ' days')->format('Y-m-d');
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($startLocal, $endLocal, $phpTz);

        $builder = $this->db->table('activity_logs')
            ->select('activity_logs.*')
            ->join('time_entries', 'time_entries.id = activity_logs.time_entry_id')
            ->where('time_entries.organization_id', $organizationId)
            ->where('activity_logs.logged_at >=', $startUtc)
            ->where('activity_logs.logged_at <=', $endUtc);

        if ($userId) {
            $builder->where('activity_logs.user_id', $userId);
        }

        $rows = $builder->get()->getResultArray();
        $hourly = array_fill(0, 24, 0);
        $categories = ['ide' => 0, 'browser' => 0, 'communication' => 0, 'other' => 0];
        $dayOfWeek = array_fill(0, 7, 0);
        $topApps = [];

        foreach ($rows as $row) {
            $seconds = (int) ($row['duration_seconds'] ?? 0);
            if ($seconds <= 0) {
                continue;
            }

            $local = $this->timezoneService->toOrgLocal($row['logged_at'], $phpTz);
            $hour = (int) date('G', strtotime($local));
            $dow = (int) date('w', strtotime($local));
            $hourly[$hour] += $seconds;
            $dayOfWeek[$dow] += $seconds;

            $category = $this->categorizeActivity($row);
            $categories[$category] += $seconds;

            $name = $row['app_name'] ?? $row['window_title'] ?? 'Unknown';
            $topApps[$name] = ($topApps[$name] ?? 0) + $seconds;
        }

        arsort($topApps);
        $peakHour = array_keys($hourly, max($hourly))[0] ?? 0;

        return [
            'period' => ['start' => $startLocal, 'end' => $endLocal, 'days' => $days],
            'peak_hour' => $peakHour,
            'hourly_distribution' => array_map(fn ($s) => round($s / 3600, 2), $hourly),
            'day_of_week_hours' => array_map(fn ($s) => round($s / 3600, 2), $dayOfWeek),
            'category_split' => $this->percentSplit($categories),
            'top_apps' => array_slice(array_map(fn ($k, $v) => ['name' => $k, 'hours' => round($v / 3600, 2)], array_keys($topApps), $topApps), 0, 8),
            'insights' => $this->buildPatternInsights($hourly, $categories, $peakHour),
        ];
    }

    public function getCoachSuggestions(int $organizationId, ?int $userId = null): array
    {
        $patterns = $this->getWorkPatterns($organizationId, $userId, 7);
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        $endLocal = (new \DateTime('now', new \DateTimeZone($phpTz)))->format('Y-m-d');
        $startLocal = (new \DateTime('now', new \DateTimeZone($phpTz)))->modify('-6 days')->format('Y-m-d');

        $productivity = $this->reportService->getOrgProductivity($organizationId, $startLocal, $endLocal);
        $agg = $this->aggregateProductivity($productivity);
        $productivePct = $agg['productive_percent'];
        $unproductivePct = $agg['unproductive_percent'];

        $suggestions = [];

        if ($unproductivePct > 25) {
            $suggestions[] = [
                'type' => 'focus',
                'priority' => 'high',
                'title' => 'Schedule deep-work blocks',
                'message' => round($unproductivePct) . '% of time was flagged unproductive. Block 90-minute focus sessions during peak hour ' . $patterns['peak_hour'] . ':00.',
            ];
        }

        if ($productivePct < 60) {
            $suggestions[] = [
                'type' => 'productivity',
                'priority' => 'medium',
                'title' => 'Raise productive time',
                'message' => 'Aim for 65%+ productive time by aligning app rules and reducing context switching.',
            ];
        }

        $browserPct = (float) ($patterns['category_split']['browser'] ?? 0);
        if ($browserPct > 35) {
            $suggestions[] = [
                'type' => 'distraction',
                'priority' => 'medium',
                'title' => 'Browser usage is high',
                'message' => round($browserPct) . '% of activity is browser-based. Batch research and communication into dedicated windows.',
            ];
        }

        $distractions = $this->getTopDistractions($organizationId, $startLocal, $endLocal, $userId ? [$userId] : null, 3);
        foreach ($distractions as $distraction) {
            $suggestions[] = [
                'type' => 'app',
                'priority' => 'low',
                'title' => 'Limit ' . $distraction['name'],
                'message' => $distraction['hours'] . 'h spent on unproductive app this week.',
            ];
        }

        if (empty($suggestions)) {
            $suggestions[] = [
                'type' => 'positive',
                'priority' => 'low',
                'title' => 'Strong work rhythm',
                'message' => 'Patterns look healthy. Keep protecting focus blocks around hour ' . $patterns['peak_hour'] . ':00.',
            ];
        }

        return [
            'productive_percent' => $productivePct,
            'suggestions' => $suggestions,
            'focus_window' => [
                'start_hour' => max(0, $patterns['peak_hour'] - 1),
                'end_hour' => min(23, $patterns['peak_hour'] + 2),
            ],
        ];
    }

    public function getDeliveryRisks(int $organizationId): array
    {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        $today = (new \DateTime('now', new \DateTimeZone($phpTz)))->format('Y-m-d');
        $weekStart = (new \DateTime('now', new \DateTimeZone($phpTz)))->modify('-6 days')->format('Y-m-d');

        $projects = $this->db->table('projects')
            ->where('organization_id', $organizationId)
            ->where('is_active', 1)
            ->get()
            ->getResultArray();

        $risks = [];
        foreach ($projects as $project) {
            $projectId = (int) $project['id'];
            $budgetHours = (float) ($project['budget_hours'] ?? 0);

            $logged = (float) $this->db->table('time_entries')
                ->select('COALESCE(SUM(duration_seconds),0)/3600 as hours', false)
                ->where('organization_id', $organizationId)
                ->where('project_id', $projectId)
                ->get()
                ->getRowArray()['hours'];

            $estimated = (float) $this->db->table('tasks')
                ->select('COALESCE(SUM(estimated_hours),0) as est', false)
                ->where('project_id', $projectId)
                ->where('is_active', 1)
                ->get()
                ->getRowArray()['est'];

            $openTasks = $this->db->table('tasks')
                ->where('project_id', $projectId)
                ->where('is_active', 1)
                ->countAllResults();

            $weekHours = (float) $this->db->table('time_entries')
                ->select('COALESCE(SUM(duration_seconds),0)/3600 as hours', false)
                ->where('organization_id', $organizationId)
                ->where('project_id', $projectId)
                ->where('started_at >=', $this->timezoneService->dayRangeUtc($weekStart, $phpTz)[0])
                ->get()
                ->getRowArray()['hours'];

            $burnRate = $budgetHours > 0 ? ($logged / $budgetHours) * 100 : null;
            $estimateBurn = $estimated > 0 ? ($logged / $estimated) * 100 : null;

            $severity = null;
            $reason = null;

            if ($burnRate !== null && $burnRate >= 90) {
                $severity = 'high';
                $reason = 'Budget hours ' . round($burnRate, 1) . '% consumed';
            } elseif ($estimateBurn !== null && $estimateBurn >= 85) {
                $severity = 'medium';
                $reason = 'Logged hours exceed ' . round($estimateBurn, 1) . '% of task estimates';
            } elseif ($openTasks > 0 && $estimateBurn !== null && $estimateBurn >= 75) {
                $severity = 'medium';
                $reason = $openTasks . ' open tasks with ' . round($estimateBurn, 1) . '% of estimated hours consumed';
            }

            if ($severity) {
                $risks[] = [
                    'project_id' => $projectId,
                    'project_name' => $project['name'],
                    'severity' => $severity,
                    'reason' => $reason,
                    'logged_hours' => round($logged, 2),
                    'budget_hours' => $budgetHours,
                    'estimated_hours' => round($estimated, 2),
                    'open_tasks' => $openTasks,
                    'weekly_hours' => round($weekHours, 2),
                ];
            }
        }

        $teamCapacity = $this->getTeamCapacityForecast($organizationId, $phpTz);

        return [
            'project_risks' => $risks,
            'capacity' => $teamCapacity,
            'generated_at' => date('c'),
        ];
    }

    public function listSprints(int $organizationId): array
    {
        return $this->db->table('sprints')
            ->where('organization_id', $organizationId)
            ->orderBy('start_date', 'DESC')
            ->limit(12)
            ->get()
            ->getResultArray();
    }

    public function createSprint(int $organizationId, array $data): array
    {
        $insert = [
            'organization_id' => $organizationId,
            'project_id' => !empty($data['project_id']) ? (int) $data['project_id'] : null,
            'name' => trim($data['name'] ?? 'Sprint'),
            'start_date' => $data['start_date'],
            'end_date' => $data['end_date'],
            'created_at' => date('Y-m-d H:i:s'),
        ];

        $this->db->table('sprints')->insert($insert);
        $insert['id'] = (int) $this->db->insertID();

        return $insert;
    }

    public function sendWeeklyDigests(): array
    {
        $orgs = $this->db->table('organizations')->select('id, name')->get()->getResultArray();
        $sent = 0;
        $notified = [];

        foreach ($orgs as $org) {
            $orgId = (int) $org['id'];
            $managers = $this->db->table('organization_members')
                ->select('organization_members.user_id, users.email, users.first_name')
                ->join('users', 'users.id = organization_members.user_id')
                ->join('roles', 'roles.id = organization_members.role_id')
                ->where('organization_members.organization_id', $orgId)
                ->whereIn('roles.slug', ['owner', 'admin', 'manager', 'team_lead'])
                ->get()
                ->getResultArray();

            foreach ($managers as $manager) {
                $summary = $this->getWeeklyManagerSummary($orgId, (int) $manager['user_id']);
                (new NotificationService())->notifyWeeklySummary((int) $manager['user_id'], $org['name'], $summary);
                (new EmailService())->sendWeeklyManagerSummary($manager, $org['name'], $summary);
                $sent++;
                $notified[] = $manager['user_id'];
            }
        }

        return ['sent_count' => $sent, 'user_ids' => $notified];
    }

    protected function getRoleBenchmarks(int $organizationId, string $startDate, string $endDate): array
    {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($startDate, $endDate, $phpTz);

        $rows = $this->db->table('time_entries')
            ->select('roles.name as role_name, roles.slug as role_slug, COALESCE(SUM(time_entries.duration_seconds),0) as total_seconds', false)
            ->join('organization_members', 'organization_members.user_id = time_entries.user_id AND organization_members.organization_id = time_entries.organization_id')
            ->join('roles', 'roles.id = organization_members.role_id')
            ->where('time_entries.organization_id', $organizationId)
            ->where('time_entries.started_at >=', $startUtc)
            ->where('time_entries.started_at <=', $endUtc)
            ->groupBy('roles.id')
            ->get()
            ->getResultArray();

        $result = [];
        foreach ($rows as $row) {
            $hours = round((int) $row['total_seconds'] / 3600, 2);
            $result[] = [
                'role' => $row['role_name'],
                'slug' => $row['role_slug'],
                'hours' => $hours,
            ];
        }

        return $result;
    }

    protected function getSprintBenchmarks(int $organizationId): array
    {
        $sprints = $this->listSprints($organizationId);
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        $benchmarks = [];

        foreach ($sprints as $sprint) {
            [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($sprint['start_date'], $sprint['end_date'], $phpTz);

            $builder = $this->db->table('time_entries')
                ->select('COALESCE(SUM(duration_seconds),0) as total_seconds', false)
                ->where('organization_id', $organizationId)
                ->where('started_at >=', $startUtc)
                ->where('started_at <=', $endUtc);

            if (!empty($sprint['project_id'])) {
                $builder->where('project_id', (int) $sprint['project_id']);
            }

            $seconds = (int) $builder->get()->getRowArray()['total_seconds'];

            $benchmarks[] = [
                'sprint_id' => (int) $sprint['id'],
                'name' => $sprint['name'],
                'start_date' => $sprint['start_date'],
                'end_date' => $sprint['end_date'],
                'hours' => round($seconds / 3600, 2),
            ];
        }

        return $benchmarks;
    }

    protected function getTopMembersForRange(int $organizationId, string $start, string $end, ?array $userIds, int $limit): array
    {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($start, $end, $phpTz);

        $builder = $this->db->table('time_entries')
            ->select('users.first_name, users.last_name, COALESCE(SUM(time_entries.duration_seconds),0) as total_seconds', false)
            ->join('users', 'users.id = time_entries.user_id')
            ->where('time_entries.organization_id', $organizationId)
            ->where('time_entries.started_at >=', $startUtc)
            ->where('time_entries.started_at <=', $endUtc)
            ->groupBy('time_entries.user_id')
            ->orderBy('total_seconds', 'DESC')
            ->limit($limit);

        if ($userIds !== null) {
            $builder->whereIn('time_entries.user_id', $userIds);
        }

        $rows = $builder->get()->getResultArray();

        return array_map(fn ($r) => [
            'name' => trim($r['first_name'] . ' ' . $r['last_name']),
            'hours' => round((int) $r['total_seconds'] / 3600, 2),
        ], $rows);
    }

    protected function getTopDistractions(int $organizationId, string $start, string $end, ?array $userIds, int $limit): array
    {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($start, $end, $phpTz);

        $builder = $this->db->table('activity_logs')
            ->select('COALESCE(activity_logs.app_name, activity_logs.window_title) as name, COALESCE(SUM(CASE WHEN activity_logs.duration_seconds > 0 THEN activity_logs.duration_seconds ELSE 60 END),0) as total_seconds', false)
            ->join('time_entries', 'time_entries.id = activity_logs.time_entry_id')
            ->where('time_entries.organization_id', $organizationId)
            ->where('activity_logs.category', 'unproductive')
            ->where('activity_logs.logged_at >=', $startUtc)
            ->where('activity_logs.logged_at <=', $endUtc)
            ->groupBy('name')
            ->orderBy('total_seconds', 'DESC')
            ->limit($limit);

        if ($userIds !== null) {
            $builder->whereIn('activity_logs.user_id', $userIds);
        }

        $rows = $builder->get()->getResultArray();

        return array_map(fn ($r) => [
            'name' => $r['name'],
            'hours' => round((int) $r['total_seconds'] / 3600, 2),
        ], $rows);
    }

    protected function getTeamCapacityForecast(int $organizationId, string $phpTz): array
    {
        $memberCount = $this->db->table('organization_members')
            ->where('organization_id', $organizationId)
            ->countAllResults();

        $weekStart = (new \DateTime('now', new \DateTimeZone($phpTz)))->modify('-6 days')->format('Y-m-d');
        $weekEnd = (new \DateTime('now', new \DateTimeZone($phpTz)))->format('Y-m-d');
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($weekStart, $weekEnd, $phpTz);

        $weekSeconds = (int) $this->db->table('time_entries')
            ->select('COALESCE(SUM(duration_seconds),0) as total', false)
            ->where('organization_id', $organizationId)
            ->where('started_at >=', $startUtc)
            ->where('started_at <=', $endUtc)
            ->get()
            ->getRowArray()['total'];

        $weekHours = round($weekSeconds / 3600, 2);
        $expectedCapacity = $memberCount * 40;
        $utilization = $expectedCapacity > 0 ? round(($weekHours / $expectedCapacity) * 100, 1) : 0;

        return [
            'team_size' => $memberCount,
            'weekly_hours_logged' => $weekHours,
            'expected_weekly_capacity' => $expectedCapacity,
            'utilization_percent' => $utilization,
            'forecast' => $utilization > 95
                ? 'Team is near capacity — delay risk on new work'
                : ($utilization < 60 ? 'Capacity available for additional scope' : 'Balanced capacity'),
        ];
    }

    protected function resolveTeamUserIds(int $organizationId, int $managerUserId): array
    {
        $member = $this->db->table('organization_members')
            ->where('organization_id', $organizationId)
            ->where('user_id', $managerUserId)
            ->get()
            ->getRowArray();

        if (!$member) {
            return [$managerUserId];
        }

        $role = $this->db->table('roles')->where('id', $member['role_id'])->get()->getRowArray();
        if ($role && in_array($role['slug'], ['owner', 'admin'], true)) {
            return [];
        }

        $teamId = $member['team_id'] ?? null;
        if ($teamId) {
            $ids = $this->db->table('organization_members')
                ->select('user_id')
                ->where('organization_id', $organizationId)
                ->where('team_id', $teamId)
                ->get()
                ->getResultArray();

            return array_map(fn ($r) => (int) $r['user_id'], $ids);
        }

        return [$managerUserId];
    }

    protected function categorizeActivity(array $row): string
    {
        $name = strtolower((string) ($row['app_name'] ?? $row['window_title'] ?? ''));
        $url = strtolower((string) ($row['url'] ?? ''));

        if (!empty($url) || str_contains($name, 'chrome') || str_contains($name, 'firefox') || str_contains($name, 'edge')) {
            return 'browser';
        }

        $ide = ['cursor', 'vscode', 'visual studio', 'intellij', 'phpstorm', 'webstorm', 'sublime', 'neovim'];
        foreach ($ide as $needle) {
            if (str_contains($name, $needle)) {
                return 'ide';
            }
        }

        $comm = ['slack', 'teams', 'zoom', 'discord', 'mail', 'outlook'];
        foreach ($comm as $needle) {
            if (str_contains($name, $needle)) {
                return 'communication';
            }
        }

        return 'other';
    }

    protected function percentSplit(array $categories): array
    {
        $total = array_sum($categories);
        if ($total <= 0) {
            return array_map(fn () => 0, $categories);
        }

        $result = [];
        foreach ($categories as $key => $value) {
            $result[$key] = round(($value / $total) * 100, 1);
        }

        return $result;
    }

    protected function buildPatternInsights(array $hourly, array $categories, int $peakHour): array
    {
        $insights = [];
        $peakHours = round($hourly[$peakHour] / 3600, 1);
        $insights[] = "Peak focus window around {$peakHour}:00 ({$peakHours}h logged).";

        $idePct = 0;
        $total = array_sum($categories);
        if ($total > 0) {
            $idePct = round(($categories['ide'] / $total) * 100);
        }
        if ($idePct > 40) {
            $insights[] = "IDE-heavy workflow ({$idePct}% of tracked activity).";
        }

        return $insights;
    }
}
