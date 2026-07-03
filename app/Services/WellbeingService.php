<?php

namespace App\Services;

/**
 * Phase 5 — Burnout detection + focus / wellbeing suite.
 *
 * Derives work-pattern signals (long days, after-hours & weekend work, lack of
 * breaks, marathon sessions, no days off) from tracked time + idle stats and
 * turns them into a burnout-risk score, contributing factors and concrete,
 * supportive recommendations. Heuristic and privacy-respecting (no AI required).
 */
class WellbeingService
{
    protected TimezoneService $tz;
    protected $db;

    public function __construct()
    {
        $this->tz = new TimezoneService();
        $this->db = \Config\Database::connect();
    }

    /**
     * @return array{user:array, period:array, metrics:array, score:int, level:string, factors:array, recommendations:array<int,string>}
     */
    public function forUser(int $organizationId, int $userId, int $days = 14): array
    {
        $user = $this->userInfo($organizationId, $userId);
        if (!$user) {
            throw new \RuntimeException('Member not found in this organization.');
        }

        return $this->assess($organizationId, $user, $days);
    }

    /**
     * @return array{period:array, summary:array, members:array<int,array>}
     */
    public function forTeam(int $organizationId, int $days = 14): array
    {
        $members = $this->db->table('organization_members m')
            ->select('u.id, u.first_name, u.last_name, u.email')
            ->join('users u', 'u.id = m.user_id')
            ->where('m.organization_id', $organizationId)
            ->get()
            ->getResultArray();

        $assessed = [];
        $counts = ['low' => 0, 'moderate' => 0, 'high' => 0];

        foreach ($members as $m) {
            $name = trim(($m['first_name'] ?? '') . ' ' . ($m['last_name'] ?? ''));
            $user = [
                'id'    => (int) $m['id'],
                'name'  => $name !== '' ? $name : (string) $m['email'],
                'email' => (string) $m['email'],
            ];
            $a = $this->assess($organizationId, $user, $days);
            $counts[$a['level']]++;
            $assessed[] = [
                'user'          => $a['user'],
                'score'         => $a['score'],
                'level'         => $a['level'],
                'tracked_hours' => $a['metrics']['total_hours'],
                'avg_daily'     => $a['metrics']['avg_daily_hours'],
                'top_factor'    => $a['factors'][0]['label'] ?? null,
            ];
        }

        usort($assessed, fn ($x, $y) => $y['score'] <=> $x['score']);

        return [
            'period'  => ['days' => $days],
            'summary' => [
                'members'    => count($assessed),
                'high_risk'  => $counts['high'],
                'moderate'   => $counts['moderate'],
                'low_risk'   => $counts['low'],
            ],
            'members' => $assessed,
        ];
    }

    /**
     * @param array{id:int,name:string,email:string} $user
     */
    private function assess(int $organizationId, array $user, int $days): array
    {
        $phpTz = $this->tz->getOrgTimezone($organizationId);
        $startLocal = date('Y-m-d', strtotime('-' . max(1, $days - 1) . ' days'));
        $endLocal = date('Y-m-d');
        [$startUtc, $endUtc] = $this->tz->dateRangeUtc($startLocal, $endLocal, $phpTz);

        $metrics = $this->metrics($organizationId, $user['id'], $startUtc, $endUtc, $phpTz, $days);
        [$score, $factors, $recommendations] = $this->score($metrics);

        return [
            'user'            => $user,
            'period'          => ['days' => $days, 'start' => $startLocal, 'end' => $endLocal],
            'metrics'         => $metrics,
            'score'           => $score,
            'level'           => $score >= 67 ? 'high' : ($score >= 34 ? 'moderate' : 'low'),
            'factors'         => $factors,
            'recommendations' => $recommendations,
        ];
    }

    /**
     * @return array<string,mixed>
     */
    private function metrics(int $organizationId, int $userId, string $startUtc, string $endUtc, string $phpTz, int $days): array
    {
        $rows = $this->db->table('time_entries')
            ->select('started_at, duration_seconds')
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->where('ended_at IS NOT NULL')
            ->where('started_at >=', $startUtc)
            ->where('started_at <=', $endUtc)
            ->get()
            ->getResultArray();

        $tz = new \DateTimeZone($phpTz);
        $utc = new \DateTimeZone('UTC');

        $totalSeconds = 0;
        $afterHours = 0;
        $weekend = 0;
        $longestSession = 0;
        $perDay = [];

        foreach ($rows as $r) {
            $secs = (int) $r['duration_seconds'];
            if ($secs <= 0) {
                continue;
            }
            $totalSeconds += $secs;
            $longestSession = max($longestSession, $secs);

            try {
                $dt = new \DateTime((string) $r['started_at'], $utc);
                $dt->setTimezone($tz);
            } catch (\Throwable $e) {
                continue;
            }

            $hour = (int) $dt->format('G');
            $dow = (int) $dt->format('w'); // 0=Sun..6=Sat
            $dayKey = $dt->format('Y-m-d');

            $perDay[$dayKey] = ($perDay[$dayKey] ?? 0) + $secs;

            if ($hour >= 20 || $hour < 6) {
                $afterHours += $secs;
            }
            if ($dow === 0 || $dow === 6) {
                $weekend += $secs;
            }
        }

        $activeDays = count($perDay);
        $maxDaySeconds = $perDay ? max($perDay) : 0;

        // Idle / break ratio from idle stats.
        $idle = $this->db->table('daily_idle_stats')
            ->select('SUM(idle_seconds) as idle, SUM(active_seconds) as active')
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->where('date >=', date('Y-m-d', strtotime('-' . max(1, $days - 1) . ' days')))
            ->get()
            ->getRowArray();

        $idleSecs = (int) ($idle['idle'] ?? 0);
        $activeSecs = (int) ($idle['active'] ?? 0);
        $breakRatio = ($idleSecs + $activeSecs) > 0 ? round($idleSecs / ($idleSecs + $activeSecs), 3) : null;

        $longestStreak = $this->longestStreak(array_keys($perDay));

        $totalHours = round($totalSeconds / 3600, 1);

        return [
            'total_hours'          => $totalHours,
            'active_days'          => $activeDays,
            'avg_daily_hours'      => $activeDays > 0 ? round($totalHours / $activeDays, 1) : 0.0,
            'max_day_hours'        => round($maxDaySeconds / 3600, 1),
            'longest_session_hours' => round($longestSession / 3600, 1),
            'after_hours_ratio'    => $totalSeconds > 0 ? round($afterHours / $totalSeconds, 3) : 0.0,
            'weekend_ratio'        => $totalSeconds > 0 ? round($weekend / $totalSeconds, 3) : 0.0,
            'break_ratio'          => $breakRatio,
            'longest_streak_days'  => $longestStreak,
        ];
    }

    /**
     * @param array<string,mixed> $m
     * @return array{0:int,1:array<int,array>,2:array<int,string>}
     */
    private function score(array $m): array
    {
        $score = 0.0;
        $factors = [];

        $avg = (float) $m['avg_daily_hours'];
        if ($avg > 8) {
            $impact = min(25, ($avg - 8) * 8);
            $score += $impact;
            $factors[] = $this->factor('Long working days', round($avg, 1) . 'h/day average', $impact);
        }

        $ah = (float) $m['after_hours_ratio'];
        if ($ah > 0.1) {
            $impact = min(20, $ah * 25);
            $score += $impact;
            $factors[] = $this->factor('After-hours work', round($ah * 100) . '% of time after 8pm / before 6am', $impact);
        }

        $we = (float) $m['weekend_ratio'];
        if ($we > 0.05) {
            $impact = min(15, $we * 30);
            $score += $impact;
            $factors[] = $this->factor('Weekend work', round($we * 100) . '% of time on weekends', $impact);
        }

        $ls = (float) $m['longest_session_hours'];
        if ($ls > 3) {
            $impact = min(15, ($ls - 3) * 5);
            $score += $impact;
            $factors[] = $this->factor('Marathon sessions', round($ls, 1) . 'h longest unbroken session', $impact);
        }

        $br = $m['break_ratio'];
        if ($br !== null) {
            if ($br < 0.05) {
                $score += 15;
                $factors[] = $this->factor('Few breaks', round($br * 100) . '% idle time', 15);
            } elseif ($br < 0.1) {
                $score += 8;
                $factors[] = $this->factor('Low break time', round($br * 100) . '% idle time', 8);
            }
        }

        $streak = (int) $m['longest_streak_days'];
        if ($streak >= 6) {
            $score += 15;
            $factors[] = $this->factor('No days off', $streak . ' consecutive days worked', 15);
        } elseif ($streak >= 5) {
            $score += 8;
            $factors[] = $this->factor('Little rest', $streak . ' consecutive days worked', 8);
        }

        $score = (int) round(max(0, min(100, $score)));

        usort($factors, fn ($a, $b) => $b['impact'] <=> $a['impact']);

        return [$score, $factors, $this->recommendations($m, $factors)];
    }

    /**
     * @return array{label:string, detail:string, impact:int}
     */
    private function factor(string $label, string $detail, float $impact): array
    {
        return ['label' => $label, 'detail' => $detail, 'impact' => (int) round($impact)];
    }

    /**
     * @param array<string,mixed> $m
     * @param array<int,array> $factors
     * @return array<int,string>
     */
    private function recommendations(array $m, array $factors): array
    {
        if (empty($factors)) {
            return ['Work patterns look balanced. Keep protecting focus time and regular breaks.'];
        }

        $recs = [];
        $labels = array_column($factors, 'label');

        if (in_array('Long working days', $labels, true)) {
            $recs[] = 'Consider capping daily tracked time and delegating or deferring lower-priority work.';
        }
        if (in_array('After-hours work', $labels, true)) {
            $recs[] = 'Encourage a clear end-of-day cutoff; avoid scheduling meetings or tasks late in the evening.';
        }
        if (in_array('Weekend work', $labels, true)) {
            $recs[] = 'Protect weekends for recovery — review workload and deadlines that spill into Saturday/Sunday.';
        }
        if (in_array('Marathon sessions', $labels, true)) {
            $recs[] = 'Introduce short breaks every ~90 minutes (Pomodoro) to sustain focus and reduce fatigue.';
        }
        if (in_array('Few breaks', $labels, true) || in_array('Low break time', $labels, true)) {
            $recs[] = 'Schedule regular micro-breaks and a proper lunch away from the screen.';
        }
        if (in_array('No days off', $labels, true) || in_array('Little rest', $labels, true)) {
            $recs[] = 'Plan at least one full rest day; consecutive workdays raise burnout risk.';
        }

        return $recs;
    }

    /**
     * Longest run of consecutive calendar days present in the set.
     *
     * @param array<int,string> $dayKeys  Y-m-d strings
     */
    private function longestStreak(array $dayKeys): int
    {
        if (empty($dayKeys)) {
            return 0;
        }
        sort($dayKeys);
        $longest = 1;
        $current = 1;
        for ($i = 1, $n = count($dayKeys); $i < $n; $i++) {
            $prev = strtotime($dayKeys[$i - 1]);
            $cur = strtotime($dayKeys[$i]);
            if ($cur - $prev === 86400) {
                $current++;
                $longest = max($longest, $current);
            } else {
                $current = 1;
            }
        }
        return $longest;
    }

    /**
     * @return array{id:int,name:string,email:string}|null
     */
    private function userInfo(int $organizationId, int $userId): ?array
    {
        $row = $this->db->table('organization_members m')
            ->select('u.id, u.first_name, u.last_name, u.email')
            ->join('users u', 'u.id = m.user_id')
            ->where('m.organization_id', $organizationId)
            ->where('m.user_id', $userId)
            ->get()
            ->getRowArray();

        if (!$row) {
            return null;
        }

        $name = trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? ''));
        return [
            'id'    => (int) $row['id'],
            'name'  => $name !== '' ? $name : (string) $row['email'],
            'email' => (string) $row['email'],
        ];
    }
}
