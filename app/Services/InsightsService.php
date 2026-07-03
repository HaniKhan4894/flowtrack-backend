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

    /**
     * Phase 11 — Predictive forecasting.
     *
     * Projects forward each active project's budget-burn using the recent daily
     * trend (least-squares slope + average), estimating a budget-overrun date
     * and building a burn-up projection series for charting. Sprints get a
     * deadline-miss probability from required-vs-actual pace. Optionally adds an
     * AI narrative (BYOK) grounded strictly in the computed numbers.
     */
    public function getForecast(int $organizationId, int $historyDays = 30, int $horizonDays = 30): array
    {
        $historyDays = max(7, min(90, $historyDays));
        $horizonDays = max(7, min(120, $horizonDays));

        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        $todayLocal = (new \DateTime('now', new \DateTimeZone($phpTz)))->format('Y-m-d');
        $startLocal = (new \DateTime($todayLocal, new \DateTimeZone($phpTz)))->modify('-' . ($historyDays - 1) . ' days')->format('Y-m-d');

        $projectsRaw = $this->db->table('projects')
            ->where('organization_id', $organizationId)
            ->where('is_active', 1)
            ->get()
            ->getResultArray();

        $dailyByProject = $this->dailyHoursByProject($organizationId, $startLocal, $todayLocal, $phpTz);

        $projects = [];
        foreach ($projectsRaw as $project) {
            $projectId = (int) $project['id'];
            $budgetHours = (float) ($project['budget_hours'] ?? 0);

            $loggedTotal = (float) $this->db->table('time_entries')
                ->select('COALESCE(SUM(duration_seconds),0)/3600 as hours', false)
                ->where('organization_id', $organizationId)
                ->where('project_id', $projectId)
                ->get()
                ->getRowArray()['hours'];

            $daily = $dailyByProject[$projectId] ?? [];
            $series = $this->buildDailySeries($startLocal, $todayLocal, $phpTz, $daily);
            $recentHours = array_map(fn ($p) => $p['hours'], $series);

            $slope = $this->linearSlope($recentHours);
            $activeDays = count(array_filter($recentHours, fn ($h) => $h > 0));
            $avgDaily = $activeDays > 0 ? array_sum($recentHours) / max(1, count($recentHours)) : 0;
            // Blend average pace with trend to smooth spiky data.
            $burnRate = max(0, round(($avgDaily * 0.7) + (max(0, $avgDaily + $slope) * 0.3), 3));

            $projection = $this->buildProjection($series, $loggedTotal, $burnRate, $budgetHours, $horizonDays, $phpTz, $todayLocal);

            $utilization = $budgetHours > 0 ? round(($loggedTotal / $budgetHours) * 100, 1) : null;
            $projectedOverrunDate = $projection['overrun_date'];
            $daysToOverrun = $projection['days_to_overrun'];

            $risk = 'none';
            if ($budgetHours > 0) {
                if ($loggedTotal >= $budgetHours) {
                    $risk = 'high';
                } elseif ($daysToOverrun !== null && $daysToOverrun <= 7) {
                    $risk = 'high';
                } elseif ($daysToOverrun !== null && $daysToOverrun <= $horizonDays) {
                    $risk = 'medium';
                } elseif ($utilization !== null && $utilization >= 70) {
                    $risk = 'low';
                }
            }

            $projects[] = [
                'project_id'             => $projectId,
                'project_name'           => $project['name'],
                'color'                  => $project['color'] ?? null,
                'budget_hours'           => $budgetHours,
                'logged_hours'           => round($loggedTotal, 2),
                'daily_burn_rate'        => $burnRate,
                'trend_per_day'          => round($slope, 3),
                'utilization_percent'    => $utilization,
                'projected_overrun_date' => $projectedOverrunDate,
                'days_to_overrun'        => $daysToOverrun,
                'risk'                   => $risk,
                'series'                 => $projection['series'],
            ];
        }

        // Sort by risk severity then soonest overrun.
        $rank = ['high' => 0, 'medium' => 1, 'low' => 2, 'none' => 3];
        usort($projects, function ($a, $b) use ($rank) {
            $r = ($rank[$a['risk']] ?? 3) <=> ($rank[$b['risk']] ?? 3);
            if ($r !== 0) {
                return $r;
            }
            return ($a['days_to_overrun'] ?? PHP_INT_MAX) <=> ($b['days_to_overrun'] ?? PHP_INT_MAX);
        });

        $sprints = $this->forecastSprints($organizationId, $phpTz, $todayLocal);

        $result = [
            'generated_at' => date('c'),
            'history_days' => $historyDays,
            'horizon_days' => $horizonDays,
            'projects'     => $projects,
            'sprints'      => $sprints,
        ];

        $result['ai'] = $this->forecastNarrative($organizationId, $projects, $sprints);

        return $result;
    }

    /**
     * @return array<int, array<string,float>> project_id => [Y-m-d => hours]
     */
    protected function dailyHoursByProject(int $organizationId, string $startLocal, string $endLocal, string $phpTz): array
    {
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($startLocal, $endLocal, $phpTz);

        $rows = $this->db->table('time_entries')
            ->select('project_id, started_at, duration_seconds')
            ->where('organization_id', $organizationId)
            ->where('started_at >=', $startUtc)
            ->where('started_at <=', $endUtc)
            ->where('project_id IS NOT NULL')
            ->get()
            ->getResultArray();

        $out = [];
        foreach ($rows as $row) {
            $projectId = (int) $row['project_id'];
            $seconds = (int) ($row['duration_seconds'] ?? 0);
            if ($seconds <= 0) {
                continue;
            }
            $localDate = substr($this->timezoneService->toOrgLocal($row['started_at'], $phpTz), 0, 10);
            $out[$projectId][$localDate] = ($out[$projectId][$localDate] ?? 0) + ($seconds / 3600);
        }

        return $out;
    }

    /**
     * @param array<string,float> $daily
     * @return array<int, array{date:string, hours:float}>
     */
    protected function buildDailySeries(string $startLocal, string $endLocal, string $phpTz, array $daily): array
    {
        $series = [];
        $cursor = new \DateTime($startLocal, new \DateTimeZone($phpTz));
        $end = new \DateTime($endLocal, new \DateTimeZone($phpTz));

        while ($cursor <= $end) {
            $d = $cursor->format('Y-m-d');
            $series[] = ['date' => $d, 'hours' => round($daily[$d] ?? 0, 3)];
            $cursor->modify('+1 day');
        }

        return $series;
    }

    /**
     * Least-squares slope of a numeric series (units per index step).
     *
     * @param array<int,float> $values
     */
    protected function linearSlope(array $values): float
    {
        $n = count($values);
        if ($n < 2) {
            return 0.0;
        }
        $sumX = $sumY = $sumXY = $sumX2 = 0.0;
        foreach ($values as $i => $y) {
            $sumX += $i;
            $sumY += $y;
            $sumXY += $i * $y;
            $sumX2 += $i * $i;
        }
        $denom = ($n * $sumX2) - ($sumX * $sumX);
        if ($denom == 0.0) {
            return 0.0;
        }
        return (($n * $sumXY) - ($sumX * $sumY)) / $denom;
    }

    /**
     * Build a burn-up series: historical cumulative actuals plus a projected
     * cumulative line into the future at the given burn rate.
     *
     * @param array<int, array{date:string, hours:float}> $series
     * @return array{series:array<int,array<string,mixed>>, overrun_date:?string, days_to_overrun:?int}
     */
    protected function buildProjection(array $series, float $loggedTotal, float $burnRate, float $budgetHours, int $horizonDays, string $phpTz, string $todayLocal): array
    {
        // Historical cumulative within the window (used for the chart shape).
        $windowSum = array_sum(array_map(fn ($p) => $p['hours'], $series));
        $baseline = max(0, $loggedTotal - $windowSum);

        $out = [];
        $running = $baseline;
        foreach ($series as $point) {
            $running += $point['hours'];
            $out[] = [
                'date'       => $point['date'],
                'actual'     => round($running, 2),
                'projected'  => null,
                'budget'     => $budgetHours > 0 ? $budgetHours : null,
            ];
        }

        $overrunDate = null;
        $daysToOverrun = null;
        $projected = $loggedTotal;
        // Anchor projection at "today" so it visually continues the actual line.
        $out[count($out) - 1]['projected'] = round($projected, 2);

        $cursor = new \DateTime($todayLocal, new \DateTimeZone($phpTz));
        for ($day = 1; $day <= $horizonDays; $day++) {
            $cursor->modify('+1 day');
            $projected += $burnRate;
            $point = [
                'date'      => $cursor->format('Y-m-d'),
                'actual'    => null,
                'projected' => round($projected, 2),
                'budget'    => $budgetHours > 0 ? $budgetHours : null,
            ];
            $out[] = $point;

            if ($budgetHours > 0 && $overrunDate === null && $projected >= $budgetHours) {
                $overrunDate = $cursor->format('Y-m-d');
                $daysToOverrun = $day;
            }
        }

        // Already over budget today.
        if ($budgetHours > 0 && $loggedTotal >= $budgetHours) {
            $overrunDate = $todayLocal;
            $daysToOverrun = 0;
        }

        return ['series' => $out, 'overrun_date' => $overrunDate, 'days_to_overrun' => $daysToOverrun];
    }

    /**
     * @return array<int, array<string,mixed>>
     */
    protected function forecastSprints(int $organizationId, string $phpTz, string $todayLocal): array
    {
        $sprints = $this->db->table('sprints')
            ->where('organization_id', $organizationId)
            ->where('end_date >=', $todayLocal)
            ->orderBy('end_date', 'ASC')
            ->limit(8)
            ->get()
            ->getResultArray();

        $out = [];
        foreach ($sprints as $sprint) {
            $projectId = !empty($sprint['project_id']) ? (int) $sprint['project_id'] : null;

            $estimated = 0.0;
            if ($projectId) {
                $estimated = (float) $this->db->table('tasks')
                    ->select('COALESCE(SUM(estimated_hours),0) as est', false)
                    ->where('project_id', $projectId)
                    ->where('is_active', 1)
                    ->get()
                    ->getRowArray()['est'];
            }

            [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($sprint['start_date'], $sprint['end_date'], $phpTz);
            $loggedBuilder = $this->db->table('time_entries')
                ->select('COALESCE(SUM(duration_seconds),0)/3600 as hours', false)
                ->where('organization_id', $organizationId)
                ->where('started_at >=', $startUtc)
                ->where('started_at <=', $endUtc);
            if ($projectId) {
                $loggedBuilder->where('project_id', $projectId);
            }
            $logged = (float) $loggedBuilder->get()->getRowArray()['hours'];

            $today = new \DateTime($todayLocal, new \DateTimeZone($phpTz));
            $endDate = new \DateTime($sprint['end_date'], new \DateTimeZone($phpTz));
            $startDate = new \DateTime($sprint['start_date'], new \DateTimeZone($phpTz));
            $daysLeft = max(0, (int) $today->diff($endDate)->format('%r%a'));
            $elapsedDays = max(1, (int) $startDate->diff($today)->format('%r%a') + 1);

            $remaining = max(0, $estimated - $logged);
            $recentDaily = $logged / $elapsedDays;
            $requiredDaily = $daysLeft > 0 ? $remaining / $daysLeft : $remaining;

            $missProbability = null;
            $risk = 'none';
            if ($estimated > 0) {
                if ($remaining <= 0) {
                    $missProbability = 0.0;
                    $risk = 'none';
                } elseif ($recentDaily <= 0) {
                    $missProbability = 0.9;
                    $risk = 'high';
                } else {
                    $ratio = $requiredDaily / $recentDaily; // >1 means need to speed up
                    $missProbability = round(max(0, min(1, ($ratio - 0.8) / 1.2)), 2);
                    $risk = $missProbability >= 0.66 ? 'high' : ($missProbability >= 0.33 ? 'medium' : 'low');
                }
            }

            $out[] = [
                'sprint_id'        => (int) $sprint['id'],
                'name'             => $sprint['name'],
                'start_date'       => $sprint['start_date'],
                'end_date'         => $sprint['end_date'],
                'days_left'        => $daysLeft,
                'estimated_hours'  => round($estimated, 2),
                'logged_hours'     => round($logged, 2),
                'remaining_hours'  => round($remaining, 2),
                'recent_daily'     => round($recentDaily, 2),
                'required_daily'   => round($requiredDaily, 2),
                'miss_probability' => $missProbability,
                'risk'             => $risk,
            ];
        }

        return $out;
    }

    /**
     * Optional AI narrative grounded strictly in the computed forecast numbers.
     *
     * @param array<int,array<string,mixed>> $projects
     * @param array<int,array<string,mixed>> $sprints
     * @return array<string,mixed>
     */
    protected function forecastNarrative(int $organizationId, array $projects, array $sprints): array
    {
        $status = (new AiService())->statusFor($organizationId);
        if (empty($status['enabled'])) {
            return ['enabled' => false, 'narrative' => null, 'model' => null, 'source' => null];
        }

        $atRiskProjects = array_values(array_filter($projects, fn ($p) => $p['risk'] !== 'none'));
        $atRiskSprints = array_values(array_filter($sprints, fn ($s) => in_array($s['risk'], ['medium', 'high'], true)));

        if ($atRiskProjects === [] && $atRiskSprints === []) {
            return [
                'enabled'   => true,
                'narrative' => 'No budget-overrun or deadline-miss risks detected in the forecast window. Current pace is sustainable.',
                'model'     => $status['model'] ?? null,
                'source'    => $status['source'] ?? null,
            ];
        }

        $payload = [
            'projects' => array_map(fn ($p) => [
                'name'                => $p['project_name'],
                'budget_hours'        => $p['budget_hours'],
                'logged_hours'        => $p['logged_hours'],
                'daily_burn_rate'     => $p['daily_burn_rate'],
                'utilization_percent' => $p['utilization_percent'],
                'projected_overrun'   => $p['projected_overrun_date'],
                'days_to_overrun'     => $p['days_to_overrun'],
                'risk'                => $p['risk'],
            ], array_slice($atRiskProjects, 0, 10)),
            'sprints' => array_map(fn ($s) => [
                'name'             => $s['name'],
                'end_date'         => $s['end_date'],
                'days_left'        => $s['days_left'],
                'remaining_hours'  => $s['remaining_hours'],
                'required_daily'   => $s['required_daily'],
                'recent_daily'     => $s['recent_daily'],
                'miss_probability' => $s['miss_probability'],
                'risk'             => $s['risk'],
            ], array_slice($atRiskSprints, 0, 10)),
        ];

        $system = <<<SYS
You are FlowTrack's delivery-forecasting analyst. You are given ALREADY-COMPUTED
forecast numbers (budget burn rates, projected overrun dates, sprint pace vs the
pace required to hit the deadline). Do not invent numbers; only interpret the
data provided.

Write a concise executive briefing (max ~140 words) that:
- Calls out the projects most likely to overrun budget and roughly when.
- Flags sprints at risk of missing their deadline and what daily pace is needed.
- Gives 1-2 concrete, actionable recommendations (rescope, reassign, extend).
Use plain text with short lines. No JSON, no headings.
SYS;

        try {
            $narrative = (new AiService())->chatForOrg($organizationId, [
                ['role' => 'system', 'content' => $system],
                ['role' => 'user', 'content' => json_encode($payload, JSON_UNESCAPED_SLASHES)],
            ], ['temperature' => 0.3, 'max_tokens' => 400]);
        } catch (\Throwable $e) {
            return ['enabled' => true, 'narrative' => null, 'model' => $status['model'] ?? null, 'source' => $status['source'] ?? null, 'error' => 'AI narrative unavailable.'];
        }

        return [
            'enabled'   => true,
            'narrative' => trim($narrative),
            'model'     => $status['model'] ?? null,
            'source'    => $status['source'] ?? null,
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

        if ($userIds !== null && count($userIds) > 0) {
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

        if ($userIds !== null && count($userIds) > 0) {
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
