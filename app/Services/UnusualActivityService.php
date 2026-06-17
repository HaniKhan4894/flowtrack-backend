<?php

namespace App\Services;

class UnusualActivityService
{
    protected $db;
    protected TimezoneService $timezoneService;

    private const BASELINE_DAYS = 60;
    private const BUCKET_MINUTES = 30;
    private const MIN_BUCKET_SECONDS = 300;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
        $this->timezoneService = new TimezoneService();
    }

    public function getUnusualActivity(
        int $organizationId,
        int $targetUserId,
        string $startDate,
        string $endDate,
        array $tiersFilter = ['highly_unusual', 'unusual', 'slightly_unusual']
    ): array {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($startDate, $endDate, $phpTz);

        $baselineEndLocal = (new \DateTime($startDate, new \DateTimeZone($phpTz)))
            ->modify('-1 day')
            ->format('Y-m-d');
        $baselineStartLocal = (new \DateTime($baselineEndLocal, new \DateTimeZone($phpTz)))
            ->modify('-' . (self::BASELINE_DAYS - 1) . ' days')
            ->format('Y-m-d');
        [$baselineStartUtc, $baselineEndUtc] = $this->timezoneService->dateRangeUtc(
            $baselineStartLocal,
            $baselineEndLocal,
            $phpTz
        );

        $prevEndLocal = (new \DateTime($startDate, new \DateTimeZone($phpTz)))
            ->modify('-1 day')
            ->format('Y-m-d');
        $spanDays = max(1, (int) ((strtotime($endDate) - strtotime($startDate)) / 86400) + 1);
        $prevStartLocal = (new \DateTime($prevEndLocal, new \DateTimeZone($phpTz)))
            ->modify('-' . ($spanDays - 1) . ' days')
            ->format('Y-m-d');
        [$prevStartUtc, $prevEndUtc] = $this->timezoneService->dateRangeUtc(
            $prevStartLocal,
            $prevEndLocal,
            $phpTz
        );

        $baselineBuckets = $this->buildBuckets($organizationId, $targetUserId, $baselineStartUtc, $baselineEndUtc, $phpTz);
        $periodBuckets = $this->buildBuckets($organizationId, $targetUserId, $startUtc, $endUtc, $phpTz);
        $prevBuckets = $this->buildBuckets($organizationId, $targetUserId, $prevStartUtc, $prevEndUtc, $phpTz);

        $baselineScores = $this->eligibleScores($baselineBuckets);
        $stats = $this->computeBaselineStats($baselineScores);

        $instances = [];
        $counts = [
            'highly_unusual' => 0,
            'unusual' => 0,
            'slightly_unusual' => 0,
        ];
        $flaggedSeconds = 0;

        foreach ($periodBuckets as $bucket) {
            if ($bucket['duration_seconds'] < self::MIN_BUCKET_SECONDS) {
                continue;
            }

            $tier = $this->classifyTier($bucket['input_score'], $stats);
            if ($tier === null || !in_array($tier, $tiersFilter, true)) {
                continue;
            }

            $counts[$tier]++;
            $flaggedSeconds += $bucket['duration_seconds'];
            $instances[] = [
                'tier' => $tier,
                'start_at' => $bucket['start_at'],
                'end_at' => $bucket['end_at'],
                'duration_seconds' => $bucket['duration_seconds'],
                'duration_minutes' => round($bucket['duration_seconds'] / 60, 1),
                'input_score' => round($bucket['input_score'], 4),
                'baseline_median' => $stats['median'],
                'baseline_mean' => $stats['mean'],
                'percentile' => $this->percentileRank($baselineScores, $bucket['input_score']),
                'top_app' => $bucket['top_app'],
            ];
        }

        usort($instances, fn ($a, $b) => strcmp($b['start_at'], $a['start_at']));

        $prevFlaggedSeconds = 0;
        foreach ($prevBuckets as $bucket) {
            if ($bucket['duration_seconds'] < self::MIN_BUCKET_SECONDS) {
                continue;
            }
            if ($this->classifyTier($bucket['input_score'], $stats) !== null) {
                $prevFlaggedSeconds += $bucket['duration_seconds'];
            }
        }

        $user = $this->db->table('users')
            ->select('id, first_name, last_name, email')
            ->where('id', $targetUserId)
            ->get()
            ->getRowArray();

        return [
            'user' => [
                'id' => $targetUserId,
                'name' => trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')) ?: ($user['email'] ?? 'Member'),
            ],
            'period' => ['start' => $startDate, 'end' => $endDate],
            'baseline_period' => [
                'start' => $baselineStartLocal,
                'end' => $baselineEndLocal,
                'days' => self::BASELINE_DAYS,
                'sample_buckets' => count($baselineScores),
                'ready' => count($baselineScores) >= 10,
            ],
            'summary' => [
                'highly_unusual_count' => $counts['highly_unusual'],
                'unusual_count' => $counts['unusual'],
                'slightly_unusual_count' => $counts['slightly_unusual'],
                'total_flagged_seconds' => $flaggedSeconds,
                'total_flagged_hm' => $this->formatHm($flaggedSeconds),
            ],
            'previous_period' => [
                'start' => $prevStartLocal,
                'end' => $prevEndLocal,
                'flagged_seconds' => $prevFlaggedSeconds,
                'flagged_hm' => $this->formatHm($prevFlaggedSeconds),
            ],
            'instances' => $instances,
            'tiers_filter' => array_values($tiersFilter),
        ];
    }

    /**
     * @return array<string, array{duration_seconds:int,input_score:float,keyboard:int,clicks:int,movement:int,apps:array<string,int>}>
     */
    private function buildBuckets(
        int $organizationId,
        int $userId,
        string $startUtc,
        string $endUtc,
        string $phpTz
    ): array {
        $rows = $this->db->table('activity_logs al')
            ->select('al.logged_at, al.duration_seconds, al.keyboard_strokes, al.mouse_clicks, al.mouse_movement, al.app_name')
            ->join('time_entries te', 'te.id = al.time_entry_id')
            ->where('te.organization_id', $organizationId)
            ->where('al.user_id', $userId)
            ->where('al.logged_at >=', $startUtc)
            ->where('al.logged_at <=', $endUtc)
            ->orderBy('al.logged_at', 'ASC')
            ->get()
            ->getResultArray();

        $buckets = [];
        $tz = new \DateTimeZone($phpTz);

        foreach ($rows as $row) {
            $loggedAt = new \DateTime($row['logged_at'], new \DateTimeZone('UTC'));
            $loggedAt->setTimezone($tz);

            $minute = (int) $loggedAt->format('i');
            $bucketMinute = (int) (floor($minute / self::BUCKET_MINUTES) * self::BUCKET_MINUTES);
            $bucketStart = clone $loggedAt;
            $bucketStart->setTime((int) $loggedAt->format('H'), $bucketMinute, 0);

            $key = $bucketStart->format('Y-m-d H:i:s');
            if (!isset($buckets[$key])) {
                $bucketEnd = clone $bucketStart;
                $bucketEnd->modify('+' . self::BUCKET_MINUTES . ' minutes');
                $buckets[$key] = [
                    'start_at' => $bucketStart->format('Y-m-d H:i:s'),
                    'end_at' => $bucketEnd->format('Y-m-d H:i:s'),
                    'duration_seconds' => 0,
                    'keyboard' => 0,
                    'clicks' => 0,
                    'movement' => 0,
                    'apps' => [],
                ];
            }

            $duration = (int) ($row['duration_seconds'] ?? 0);
            if ($duration <= 0) {
                $duration = 60;
            }

            $buckets[$key]['duration_seconds'] += $duration;
            $buckets[$key]['keyboard'] += (int) ($row['keyboard_strokes'] ?? 0);
            $buckets[$key]['clicks'] += (int) ($row['mouse_clicks'] ?? 0);
            $buckets[$key]['movement'] += (int) ($row['mouse_movement'] ?? 0);

            $app = trim((string) ($row['app_name'] ?? ''));
            if ($app !== '') {
                $buckets[$key]['apps'][$app] = ($buckets[$key]['apps'][$app] ?? 0) + $duration;
            }
        }

        foreach ($buckets as &$bucket) {
            $totalInput = $bucket['keyboard'] + $bucket['clicks'] + $bucket['movement'];
            $bucket['input_score'] = $totalInput / max($bucket['duration_seconds'], 1);
            arsort($bucket['apps']);
            $bucket['top_app'] = array_key_first($bucket['apps']) ?: null;
        }
        unset($bucket);

        return $buckets;
    }

    /**
     * @param array<string, array<string, mixed>> $buckets
     * @return float[]
     */
    private function eligibleScores(array $buckets): array
    {
        $scores = [];
        foreach ($buckets as $bucket) {
            if ($bucket['duration_seconds'] >= self::MIN_BUCKET_SECONDS) {
                $scores[] = (float) $bucket['input_score'];
            }
        }

        return $scores;
    }

    /**
     * @param float[] $scores
     * @return array{mean:float,median:float,std:float,p5:float,p10:float,p20:float}
     */
    private function computeBaselineStats(array $scores): array
    {
        if ($scores === []) {
            return [
                'mean' => 0.0,
                'median' => 0.0,
                'std' => 0.0,
                'p5' => 0.0,
                'p10' => 0.0,
                'p20' => 0.0,
            ];
        }

        sort($scores);
        $count = count($scores);
        $mean = array_sum($scores) / $count;
        $variance = 0.0;
        foreach ($scores as $score) {
            $variance += ($score - $mean) ** 2;
        }
        $std = sqrt($variance / max($count, 1));

        return [
            'mean' => round($mean, 4),
            'median' => round($this->percentileValue($scores, 50), 4),
            'std' => round($std, 4),
            'p5' => round($this->percentileValue($scores, 5), 4),
            'p10' => round($this->percentileValue($scores, 10), 4),
            'p20' => round($this->percentileValue($scores, 20), 4),
        ];
    }

    private function classifyTier(float $score, array $stats): ?string
    {
        if ($stats['median'] <= 0 && $stats['mean'] <= 0) {
            return null;
        }

        if ($score <= $stats['p5']) {
            return 'highly_unusual';
        }
        if ($score <= $stats['p10']) {
            return 'unusual';
        }
        if ($score <= $stats['p20']) {
            return 'slightly_unusual';
        }

        $z = ($stats['mean'] - $score) / max($stats['std'], 0.0001);
        if ($z >= 2.5) {
            return 'highly_unusual';
        }
        if ($z >= 2.0) {
            return 'unusual';
        }
        if ($z >= 1.5) {
            return 'slightly_unusual';
        }

        return null;
    }

    /**
     * @param float[] $scores
     */
    private function percentileValue(array $scores, float $percentile): float
    {
        $count = count($scores);
        if ($count === 0) {
            return 0.0;
        }
        if ($count === 1) {
            return (float) $scores[0];
        }

        $index = ($percentile / 100) * ($count - 1);
        $lower = (int) floor($index);
        $upper = (int) ceil($index);
        if ($lower === $upper) {
            return (float) $scores[$lower];
        }

        $weight = $index - $lower;
        return ((1 - $weight) * $scores[$lower]) + ($weight * $scores[$upper]);
    }

    /**
     * @param float[] $scores
     */
    private function percentileRank(array $scores, float $value): float
    {
        if ($scores === []) {
            return 0.0;
        }

        $below = 0;
        foreach ($scores as $score) {
            if ($score < $value) {
                $below++;
            }
        }

        return round(($below / count($scores)) * 100, 1);
    }

    private function formatHm(int $seconds): string
    {
        $hours = intdiv($seconds, 3600);
        $minutes = intdiv($seconds % 3600, 60);
        return sprintf('%d:%02d', $hours, $minutes);
    }
}
