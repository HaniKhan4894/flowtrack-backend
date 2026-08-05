<?php

namespace App\Services;

use App\Models\AdvancedMonitoringSessionModel;
use App\Models\PlanModel;
use App\Models\SubscriptionModel;

class AdvancedMonitoringService
{
    protected AdvancedMonitoringSessionModel $sessionModel;
    protected $db;

    public function __construct()
    {
        $this->sessionModel = new AdvancedMonitoringSessionModel();
        $this->db = \Config\Database::connect();
    }

    public function orgHasFeature(int $organizationId): bool
    {
        $subscription = (new SubscriptionModel())->getActiveSubscription($organizationId);
        if (!$subscription) {
            return false;
        }

        $value = (new PlanModel())->getFeatureValue((int) $subscription['plan_id'], 'advanced_monitoring');

        return $value === 'true';
    }

    public function getActiveSession(int $organizationId, int $userId): ?array
    {
        $row = $this->sessionModel
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->where('status', 'active')
            ->orderBy('started_at', 'DESC')
            ->first();

        return $row ?: null;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function getActiveSessionsMap(int $organizationId): array
    {
        $rows = $this->sessionModel
            ->where('organization_id', $organizationId)
            ->where('status', 'active')
            ->findAll();

        $map = [];
        foreach ($rows as $row) {
            $map[(int) $row['user_id']] = $this->normalizeSession($row);
        }

        return $map;
    }

    public function listSessions(int $organizationId, int $userId, int $limit = 10): array
    {
        $rows = $this->sessionModel
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->orderBy('started_at', 'DESC')
            ->limit($limit)
            ->findAll();

        return array_map(fn ($row) => $this->normalizeSession($row), $rows);
    }

    public function enable(int $organizationId, int $userId, int $startedBy, array $data): array
    {
        if (!$this->orgHasFeature($organizationId)) {
            throw new \Exception('Advanced monitoring is not available on your current plan. Please upgrade to Professional or Enterprise.');
        }

        $member = $this->db->table('organization_members')
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->get()
            ->getRowArray();

        if (!$member) {
            throw new \Exception('Member not found in this organization.');
        }

        $existing = $this->getActiveSession($organizationId, $userId);
        if ($existing) {
            throw new \Exception('Advanced monitoring is already active for this member.');
        }

        $caps = (new OrganizationSettingsService())->getPlanCaps($organizationId);
        $planMin = max(1, (int) ($caps['screenshot_interval_min'] ?? 1));
        $frequency = max($planMin, min(60, (int) ($data['screenshot_frequency_minutes'] ?? 1)));
        $notifyMember = filter_var($data['notify_member'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $reason = trim((string) ($data['reason'] ?? ''));

        $now = date('Y-m-d H:i:s');
        $sessionId = $this->sessionModel->insert([
            'organization_id' => $organizationId,
            'user_id' => $userId,
            'started_by' => $startedBy,
            'reason' => $reason !== '' ? $reason : null,
            'status' => 'active',
            'screenshot_frequency_minutes' => $frequency,
            'force_screenshots' => 1,
            'notify_member' => $notifyMember ? 1 : 0,
            'started_at' => $now,
        ]);

        $session = $this->sessionModel->find($sessionId);

        if ($notifyMember) {
            $starter = $this->db->table('users')->where('id', $startedBy)->get()->getRowArray();
            $starterName = trim(($starter['first_name'] ?? '') . ' ' . ($starter['last_name'] ?? ''));
            (new NotificationService())->notifyAdvancedMonitoringEnabled(
                $userId,
                $reason,
                $starterName !== '' ? $starterName : 'Your manager'
            );
            $this->sessionModel->update($sessionId, ['member_notified_at' => $now]);
            $session = $this->sessionModel->find($sessionId);
        }

        return $this->normalizeSession($session);
    }

    public function close(int $organizationId, int $userId, ?string $resultSummary = null, bool $notifyMember = false): array
    {
        $session = $this->getActiveSession($organizationId, $userId);
        if (!$session) {
            throw new \Exception('No active advanced monitoring session for this member.');
        }

        $now = date('Y-m-d H:i:s');
        $summary = trim((string) ($resultSummary ?? ''));

        $this->sessionModel->update((int) $session['id'], [
            'status' => 'closed',
            'result_summary' => $summary !== '' ? $summary : null,
            'ended_at' => $now,
        ]);

        if ($notifyMember && $summary !== '') {
            (new NotificationService())->notifyAdvancedMonitoringResult($userId, $summary);
        }

        return $this->normalizeSession($this->sessionModel->find((int) $session['id']));
    }

    public function buildReport(int $organizationId, int $userId, string $startDate, string $endDate): array
    {
        $timezoneService = new TimezoneService();
        $phpTz = $timezoneService->getOrgTimezone($organizationId);
        [$startUtc, $endUtc] = $timezoneService->dateRangeUtc($startDate, $endDate, $phpTz);

        $activityLogService = new ActivityLogService();
        $reportService = new ReportService();
        $unusualService = new UnusualActivityService();

        $productivityStats = $activityLogService->getProductivityStats($userId, $startUtc, $endUtc);
        $productiveSeconds = 0;
        $unproductiveSeconds = 0;
        $neutralSeconds = 0;
        $totalActivitySeconds = 0;

        foreach ($productivityStats as $stat) {
            $seconds = (int) ($stat['total_seconds'] ?? 0);
            $totalActivitySeconds += $seconds;
            match ($stat['category'] ?? '') {
                'productive' => $productiveSeconds += $seconds,
                'unproductive' => $unproductiveSeconds += $seconds,
                'neutral' => $neutralSeconds += $seconds,
                default => null,
            };
        }

        $productivityScore = $totalActivitySeconds > 0
            ? (int) round(($productiveSeconds / $totalActivitySeconds) * 100)
            : 0;

        $timeSummary = $reportService->getTimeSummary([
            'organization_id' => $organizationId,
            'user_id' => $userId,
            'start_date' => $startDate,
            'end_date' => $endDate,
        ]);

        $idleBreakdown = $reportService->getIdleBreakdown($organizationId, $startDate, $endDate, $userId);
        $idleSummary = $idleBreakdown['summary'] ?? [];
        $idlePercent = (float) ($idleSummary['idle_percentage'] ?? 0);

        $topApps = $activityLogService->getTopApps($userId, $startUtc, $endUtc, 10);
        $topUrls = $reportService->getTopUrls($organizationId, $startDate, $endDate, $userId, 10);
        $unusual = $unusualService->getUnusualActivity($organizationId, $userId, $startDate, $endDate);

        $screenshotStats = $this->db->table('screenshots')
            ->select('COUNT(*) as screenshot_count, AVG(activity_level) as avg_activity_level, MIN(activity_level) as min_activity_level, MAX(activity_level) as max_activity_level')
            ->where('user_id', $userId)
            ->where('deleted_by_user', 0)
            ->where('captured_at >=', $startUtc)
            ->where('captured_at <=', $endUtc)
            ->get()
            ->getRowArray();

        $recentScreenshots = $this->db->table('screenshots')
            ->select('id, captured_at, activity_level, thumbnail_path')
            ->where('user_id', $userId)
            ->where('deleted_by_user', 0)
            ->where('captured_at >=', $startUtc)
            ->where('captured_at <=', $endUtc)
            ->orderBy('captured_at', 'DESC')
            ->limit(12)
            ->get()
            ->getResultArray();

        $screenshotService = new ScreenshotService();
        $recentScreenshots = array_map(
            static fn (array $row) => $screenshotService->attachSignedUrls($row),
            $recentScreenshots
        );

        $trackedHours = (float) ($timeSummary['total_hours'] ?? 0);
        $integrityScore = $this->calculateIntegrityScore(
            $trackedHours,
            $productivityScore,
            (int) ($screenshotStats['screenshot_count'] ?? 0),
            $idlePercent
        );

        $activeSession = $this->getActiveSession($organizationId, $userId);

        return [
            'period' => [
                'start_date' => $startDate,
                'end_date' => $endDate,
            ],
            'active_session' => $activeSession,
            'summary' => [
                'total_hours' => $trackedHours,
                'productivity_score' => $productivityScore,
                'productive_hours' => round($productiveSeconds / 3600, 2),
                'unproductive_hours' => round($unproductiveSeconds / 3600, 2),
                'idle_percent' => $idlePercent,
                'idle_hours' => round(((float) ($idleSummary['idle_seconds'] ?? 0)) / 3600, 2),
                'screenshot_count' => (int) ($screenshotStats['screenshot_count'] ?? 0),
                'avg_screenshot_activity' => round((float) ($screenshotStats['avg_activity_level'] ?? 0), 1),
                'min_screenshot_activity' => (int) ($screenshotStats['min_activity_level'] ?? 0),
                'max_screenshot_activity' => (int) ($screenshotStats['max_activity_level'] ?? 0),
                'integrity_score' => $integrityScore['score'],
                'integrity_grade' => $integrityScore['grade'],
            ],
            'integrity_components' => $integrityScore['components'],
            'unusual_activity' => $unusual,
            'top_apps' => $topApps['apps'] ?? [],
            'top_urls' => $topUrls['urls'] ?? [],
            'recent_screenshots' => $recentScreenshots,
            'sessions' => $this->listSessions($organizationId, $userId, 5),
        ];
    }

    private function calculateIntegrityScore(float $trackedHours, int $productivityScore, int $screenshotCount, float $idlePercent): array
    {
        $expectedShots = max(1, $trackedHours * 1.5);
        $evidenceScore = min(100, round(($screenshotCount / $expectedShots) * 100, 1));
        $idlePenalty = min(25, round($idlePercent * 0.35, 1));

        $score = round(
            ($productivityScore * 0.45)
            + ($evidenceScore * 0.35)
            + (max(0, 100 - $idlePercent) * 0.20)
            - $idlePenalty,
            1
        );
        $score = max(0, min(100, $score));

        return [
            'score' => $score,
            'grade' => $this->gradeLabel($score),
            'components' => [
                ['label' => 'Productive work', 'score' => $productivityScore, 'weight' => 45],
                ['label' => 'Screenshot evidence', 'score' => $evidenceScore, 'weight' => 35],
                ['label' => 'Active time', 'score' => max(0, round(100 - $idlePercent, 1)), 'weight' => 20],
            ],
        ];
    }

    private function gradeLabel(float $score): string
    {
        if ($score >= 90) {
            return 'A';
        }
        if ($score >= 80) {
            return 'B';
        }
        if ($score >= 70) {
            return 'C';
        }
        if ($score >= 60) {
            return 'D';
        }

        return 'F';
    }

    private function normalizeSession(array $session): array
    {
        return [
            'id' => (int) $session['id'],
            'organization_id' => (int) $session['organization_id'],
            'user_id' => (int) $session['user_id'],
            'started_by' => (int) $session['started_by'],
            'reason' => $session['reason'] ?? null,
            'status' => $session['status'],
            'screenshot_frequency_minutes' => (int) ($session['screenshot_frequency_minutes'] ?? 1),
            'force_screenshots' => (bool) ($session['force_screenshots'] ?? true),
            'notify_member' => (bool) ($session['notify_member'] ?? false),
            'member_notified_at' => $session['member_notified_at'] ?? null,
            'result_summary' => $session['result_summary'] ?? null,
            'started_at' => $session['started_at'],
            'ended_at' => $session['ended_at'] ?? null,
        ];
    }
}
