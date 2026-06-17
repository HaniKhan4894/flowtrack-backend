<?php

namespace App\Services;

use App\Models\TimeEntryModel;

class ProofOfWorkService
{
    protected TimeEntryModel $timeEntryModel;
    protected TimezoneService $timezoneService;
    protected $db;

    public function __construct()
    {
        $this->timeEntryModel = new TimeEntryModel();
        $this->timezoneService = new TimezoneService();
        $this->db = \Config\Database::connect();
    }

    public function buildForInvoice(array $invoice, string $portalToken): array
    {
        $organizationId = (int) ($invoice['organization_id'] ?? 0);
        $entries = $this->resolveTimeEntries($invoice);
        $entryIds = array_map(fn ($e) => (int) $e['id'], $entries);

        $trackedSeconds = array_sum(array_map(fn ($e) => (int) ($e['duration_seconds'] ?? 0), $entries));
        $billedHours = $this->sumBilledHours($invoice['items'] ?? []);
        $trackedHours = round($trackedSeconds / 3600, 2);

        $period = $this->resolvePeriod($invoice, $entries, $organizationId);
        $activityStats = $this->aggregateActivity($entryIds);
        $screenshots = $this->sampleScreenshots($entryIds, $portalToken);
        $contributors = $this->summarizeContributors($entries);
        $integrity = $this->calculateIntegrityScore(
            $trackedHours,
            $billedHours,
            $activityStats,
            count($screenshots),
            $entryIds,
            $organizationId,
            $period['start_date'],
            $period['end_date']
        );

        $org = $this->db->table('organizations')->select('name')->where('id', $organizationId)->get()->getRowArray();

        return [
            'available' => $trackedSeconds > 0 || $billedHours > 0,
            'organization_name' => $org['name'] ?? 'Your team',
            'period' => $period,
            'summary' => [
                'tracked_hours' => $trackedHours,
                'billed_hours' => round($billedHours, 2),
                'time_entry_count' => count($entries),
                'screenshot_count' => (int) $this->countScreenshots($entryIds),
                'contributor_count' => count($contributors),
            ],
            'integrity' => $integrity,
            'productivity' => $activityStats['by_category'],
            'top_apps' => $activityStats['top_apps'],
            'contributors' => $contributors,
            'screenshots' => $screenshots,
            'highlights' => $this->buildHighlights($integrity, $activityStats, $trackedHours, $billedHours),
        ];
    }

    public function canAccessScreenshot(string $token, int $screenshotId): ?array
    {
        $portalService = new ClientPortalService();
        $portal = $portalService->resolveToken($token);
        if (!$portal) {
            return null;
        }

        $invoice = (new InvoiceService())->getInvoiceById((int) $portal['invoice_id']);
        if (!$invoice) {
            return null;
        }

        $entryIds = array_map(
            fn ($e) => (int) $e['id'],
            $this->resolveTimeEntries($invoice)
        );

        if (empty($entryIds)) {
            return null;
        }

        $screenshot = $this->db->table('screenshots')
            ->where('id', $screenshotId)
            ->where('deleted_by_user', 0)
            ->whereIn('time_entry_id', $entryIds)
            ->get()
            ->getRowArray();

        return $screenshot ?: null;
    }

    private function resolveTimeEntries(array $invoice): array
    {
        $organizationId = (int) ($invoice['organization_id'] ?? 0);
        $items = $invoice['items'] ?? [];
        $linkedIds = [];

        foreach ($items as $item) {
            if (!empty($item['time_entry_id'])) {
                $linkedIds[] = (int) $item['time_entry_id'];
            }
        }

        $linkedIds = array_values(array_unique(array_filter($linkedIds)));
        if (!empty($linkedIds)) {
            return $this->timeEntryModel->builder()
                ->where('organization_id', $organizationId)
                ->whereIn('id', $linkedIds)
                ->where('ended_at IS NOT NULL')
                ->orderBy('started_at', 'ASC')
                ->get()
                ->getResultArray();
        }

        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        $issueDate = (string) ($invoice['issue_date'] ?? date('Y-m-d'));
        $startDate = date('Y-m-d', strtotime($issueDate . ' -30 days'));
        $endDate = (string) ($invoice['due_date'] ?? $issueDate);
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($startDate, $endDate, $phpTz);

        $builder = $this->timeEntryModel->builder();
        $builder->where('organization_id', $organizationId)
            ->where('ended_at IS NOT NULL')
            ->where('started_at >=', $startUtc)
            ->where('started_at <=', $endUtc);

        if (!empty($invoice['project_id'])) {
            $builder->where('project_id', (int) $invoice['project_id']);
        }

        $builder->where('is_billable', 1);

        return $builder->orderBy('started_at', 'ASC')->get()->getResultArray();
    }

    private function resolvePeriod(array $invoice, array $entries, int $organizationId): array
    {
        if (!empty($entries)) {
            $starts = array_column($entries, 'started_at');
            $ends = array_filter(array_column($entries, 'ended_at'));
            $phpTz = $this->timezoneService->getOrgTimezone($organizationId);

            $startLocal = substr((string) $this->timezoneService->toOrgLocal(min($starts), $phpTz), 0, 10);
            $endLocal = substr((string) $this->timezoneService->toOrgLocal(max($ends ?: $starts), $phpTz), 0, 10);

            return [
                'start_date' => $startLocal,
                'end_date' => $endLocal,
                'label' => $startLocal === $endLocal ? $startLocal : "{$startLocal} – {$endLocal}",
            ];
        }

        $issueDate = (string) ($invoice['issue_date'] ?? date('Y-m-d'));
        $dueDate = (string) ($invoice['due_date'] ?? $issueDate);

        return [
            'start_date' => $issueDate,
            'end_date' => $dueDate,
            'label' => $issueDate === $dueDate ? $issueDate : "{$issueDate} – {$dueDate}",
        ];
    }

    private function sumBilledHours(array $items): float
    {
        $total = 0.0;
        foreach ($items as $item) {
            $total += (float) ($item['quantity'] ?? 0);
        }

        return $total;
    }

    private function aggregateActivity(array $entryIds): array
    {
        if (empty($entryIds)) {
            return [
                'by_category' => [],
                'top_apps' => [],
                'total_seconds' => 0,
                'productive_seconds' => 0,
            ];
        }

        $rows = $this->db->table('activity_logs')
            ->select('category, app_name, SUM(duration_seconds) as total_seconds')
            ->whereIn('time_entry_id', $entryIds)
            ->groupBy('category, app_name')
            ->orderBy('total_seconds', 'DESC')
            ->get()
            ->getResultArray();

        $byCategory = [];
        $appTotals = [];
        $totalSeconds = 0;
        $productiveSeconds = 0;

        foreach ($rows as $row) {
            $seconds = (int) ($row['total_seconds'] ?? 0);
            $category = (string) ($row['category'] ?? 'uncategorized');
            $appName = trim((string) ($row['app_name'] ?? 'Unknown'));

            $byCategory[$category] = ($byCategory[$category] ?? 0) + $seconds;
            $totalSeconds += $seconds;

            if ($category === 'productive') {
                $productiveSeconds += $seconds;
            }

            if (!isset($appTotals[$appName])) {
                $appTotals[$appName] = ['app_name' => $appName, 'seconds' => 0, 'category' => $category];
            }
            $appTotals[$appName]['seconds'] += $seconds;
        }

        usort($appTotals, fn ($a, $b) => $b['seconds'] <=> $a['seconds']);
        $topApps = array_slice(array_values($appTotals), 0, 8);

        $categoryBreakdown = [];
        foreach ($byCategory as $category => $seconds) {
            $categoryBreakdown[] = [
                'category' => $category,
                'seconds' => $seconds,
                'hours' => round($seconds / 3600, 2),
                'percent' => $totalSeconds > 0 ? round(($seconds / $totalSeconds) * 100, 1) : 0,
            ];
        }

        usort($categoryBreakdown, fn ($a, $b) => $b['seconds'] <=> $a['seconds']);

        return [
            'by_category' => $categoryBreakdown,
            'top_apps' => array_map(function ($app) use ($totalSeconds) {
                return [
                    'app_name' => $app['app_name'],
                    'category' => $app['category'],
                    'hours' => round($app['seconds'] / 3600, 2),
                    'percent' => $totalSeconds > 0 ? round(($app['seconds'] / $totalSeconds) * 100, 1) : 0,
                ];
            }, $topApps),
            'total_seconds' => $totalSeconds,
            'productive_seconds' => $productiveSeconds,
        ];
    }

    private function countScreenshots(array $entryIds): int
    {
        if (empty($entryIds)) {
            return 0;
        }

        return (int) $this->db->table('screenshots')
            ->whereIn('time_entry_id', $entryIds)
            ->where('deleted_by_user', 0)
            ->countAllResults();
    }

    private function sampleScreenshots(array $entryIds, string $portalToken, int $limit = 16): array
    {
        if (empty($entryIds)) {
            return [];
        }

        $rows = $this->db->table('screenshots s')
            ->select('s.id, s.captured_at, s.activity_level, s.is_blurred, s.time_entry_id')
            ->whereIn('s.time_entry_id', $entryIds)
            ->where('s.deleted_by_user', 0)
            ->orderBy('s.captured_at', 'ASC')
            ->get()
            ->getResultArray();

        if (empty($rows)) {
            return [];
        }

        $sample = $this->evenSample($rows, $limit);
        $apiBase = rtrim((string) env('app.baseURL', 'http://localhost/flowtrack-backend/public/'), '/');

        return array_map(function ($row) use ($portalToken, $apiBase) {
            return [
                'id' => (int) $row['id'],
                'captured_at' => $row['captured_at'],
                'activity_level' => (int) ($row['activity_level'] ?? 0),
                'is_blurred' => (bool) ($row['is_blurred'] ?? false),
                'thumbnail_url' => $apiBase . '/api/v1/portal/invoice/' . rawurlencode($portalToken)
                    . '/screenshots/' . (int) $row['id'] . '/thumbnail',
            ];
        }, $sample);
    }

    private function evenSample(array $rows, int $limit): array
    {
        $count = count($rows);
        if ($count <= $limit) {
            return $rows;
        }

        $step = ($count - 1) / max(1, $limit - 1);
        $sample = [];
        for ($i = 0; $i < $limit; $i++) {
            $sample[] = $rows[(int) round($i * $step)];
        }

        return $sample;
    }

    private function summarizeContributors(array $entries): array
    {
        if (empty($entries)) {
            return [];
        }

        $userIds = array_values(array_unique(array_map(fn ($e) => (int) $e['user_id'], $entries)));
        $users = $this->db->table('users')
            ->select('id, first_name, last_name')
            ->whereIn('id', $userIds)
            ->get()
            ->getResultArray();

        $userMap = [];
        foreach ($users as $user) {
            $userMap[(int) $user['id']] = $user;
        }

        $totals = [];
        foreach ($entries as $entry) {
            $userId = (int) $entry['user_id'];
            $totals[$userId] = ($totals[$userId] ?? 0) + (int) ($entry['duration_seconds'] ?? 0);
        }

        arsort($totals);
        $contributors = [];
        foreach ($totals as $userId => $seconds) {
            $user = $userMap[$userId] ?? null;
            $first = trim((string) ($user['first_name'] ?? 'Team'));
            $lastInitial = !empty($user['last_name']) ? strtoupper(substr((string) $user['last_name'], 0, 1)) . '.' : '';
            $contributors[] = [
                'display_name' => trim("{$first} {$lastInitial}"),
                'hours' => round($seconds / 3600, 2),
            ];
        }

        return $contributors;
    }

    private function calculateIntegrityScore(
        float $trackedHours,
        float $billedHours,
        array $activityStats,
        int $sampleScreenshotCount,
        array $entryIds,
        int $organizationId,
        string $startDate,
        string $endDate
    ): array {
        $activitySeconds = (int) ($activityStats['total_seconds'] ?? 0);
        $productiveSeconds = (int) ($activityStats['productive_seconds'] ?? 0);
        $trackedSeconds = (int) round($trackedHours * 3600);

        $productivityRatio = $activitySeconds > 0 ? $productiveSeconds / $activitySeconds : 0.75;
        $productivityScore = min(100, round($productivityRatio * 100, 1));

        if ($trackedHours > 0 && $billedHours > 0) {
            $alignment = min($trackedHours, $billedHours) / max($trackedHours, $billedHours);
            $billingScore = round($alignment * 100, 1);
        } elseif ($trackedHours > 0 || $billedHours > 0) {
            $billingScore = 85.0;
        } else {
            $billingScore = 0.0;
        }

        $totalScreenshots = max($sampleScreenshotCount, $this->countScreenshots($entryIds));
        $expectedShots = max(1, $trackedHours * 1.5);
        $evidenceScore = min(100, round(($totalScreenshots / $expectedShots) * 100, 1));

        $activityCoverage = $trackedSeconds > 0
            ? min(100, round(($activitySeconds / $trackedSeconds) * 100, 1))
            : 70.0;

        $idlePenalty = $this->idlePenalty($entryIds, $organizationId, $startDate, $endDate);
        $score = round(
            ($productivityScore * 0.35)
            + ($billingScore * 0.30)
            + ($evidenceScore * 0.20)
            + ($activityCoverage * 0.15)
            - $idlePenalty,
            1
        );
        $score = max(0, min(100, $score));

        return [
            'score' => $score,
            'grade' => $this->gradeLabel($score),
            'components' => [
                ['label' => 'Productive work', 'score' => $productivityScore, 'weight' => 35],
                ['label' => 'Billing alignment', 'score' => $billingScore, 'weight' => 30],
                ['label' => 'Screenshot evidence', 'score' => $evidenceScore, 'weight' => 20],
                ['label' => 'Activity coverage', 'score' => $activityCoverage, 'weight' => 15],
            ],
        ];
    }

    private function idlePenalty(array $entryIds, int $organizationId, string $startDate, string $endDate): float
    {
        if (empty($entryIds)) {
            return 0;
        }

        $userIds = $this->db->table('time_entries')
            ->select('user_id')
            ->whereIn('id', $entryIds)
            ->get()
            ->getResultArray();
        $userIds = array_values(array_unique(array_map(fn ($r) => (int) $r['user_id'], $userIds)));

        if (empty($userIds)) {
            return 0;
        }

        $stats = $this->db->table('daily_idle_stats')
            ->selectSum('idle_seconds')
            ->selectSum('active_seconds')
            ->where('organization_id', $organizationId)
            ->whereIn('user_id', $userIds)
            ->where('date >=', $startDate)
            ->where('date <=', $endDate)
            ->get()
            ->getRowArray();

        $idle = (int) ($stats['idle_seconds'] ?? 0);
        $active = (int) ($stats['active_seconds'] ?? 0);
        $total = $idle + $active;
        if ($total <= 0) {
            return 0;
        }

        $idleRatio = $idle / $total;
        if ($idleRatio <= 0.15) {
            return 0;
        }

        return min(8, round(($idleRatio - 0.15) * 30, 1));
    }

    private function gradeLabel(float $score): string
    {
        if ($score >= 90) {
            return 'Excellent';
        }
        if ($score >= 75) {
            return 'Strong';
        }
        if ($score >= 60) {
            return 'Good';
        }
        if ($score >= 40) {
            return 'Fair';
        }

        return 'Needs review';
    }

    private function buildHighlights(array $integrity, array $activityStats, float $trackedHours, float $billedHours): array
    {
        $highlights = [];

        $highlights[] = sprintf(
            'Billable Integrity Score: %s/100 (%s)',
            number_format((float) $integrity['score'], 0),
            $integrity['grade']
        );

        if ($trackedHours > 0) {
            $highlights[] = sprintf('%s verified tracked hours backed this invoice period', number_format($trackedHours, 1));
        }

        if ($billedHours > 0 && $trackedHours > 0) {
            $delta = abs($trackedHours - $billedHours);
            if ($delta <= 0.5) {
                $highlights[] = 'Billed hours closely match verified tracked time';
            }
        }

        $topApp = $activityStats['top_apps'][0]['app_name'] ?? null;
        if ($topApp) {
            $highlights[] = "Primary focus app: {$topApp}";
        }

        $productive = 0;
        foreach ($activityStats['by_category'] as $cat) {
            if ($cat['category'] === 'productive') {
                $productive = (float) $cat['percent'];
                break;
            }
        }
        if ($productive >= 60) {
            $highlights[] = sprintf('%.0f%% of logged activity classified as productive', $productive);
        }

        return array_slice($highlights, 0, 5);
    }
}
