<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\ReportService;
use App\Services\TeamScopeService;
use App\Services\PermissionService;

class ReportController extends ResourceController
{
    protected $reportService;
    protected TeamScopeService $teamScopeService;
    protected $format = 'json';

    public function __construct()
    {
        $this->reportService = new ReportService();
        $this->teamScopeService = new TeamScopeService();
    }

    /**
     * GET /api/v1/reports/time-summary?user_id=1&start_date=2024-01-01&end_date=2024-01-31
     */
    public function timeSummary()
    {
        try {
            $currentUserId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $organizationId = (int)($this->request->getGet('organization_id') ?? $this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$currentUserId || !$organizationId) {
                return $this->fail('Unauthorized', 401);
            }

            $permissionService = new PermissionService();
            $canViewTeam = $permissionService->userHasPermission($currentUserId, $organizationId, 'reports.view_team');
            $visibleUserIds = $this->teamScopeService->getVisibleUserIds($currentUserId, $organizationId);

            $filters = [
                'organization_id' => $organizationId,
                'project_id' => $this->request->getGet('project_id'),
                'start_date' => $this->request->getGet('start_date'),
                'end_date' => $this->request->getGet('end_date'),
            ];

            if (!$canViewTeam) {
                $filters['user_id'] = $currentUserId;
            } elseif ($requestedUserId = $this->request->getGet('user_id')) {
                $targetUserId = (int) $requestedUserId;
                if (!$this->teamScopeService->canViewUser($currentUserId, $organizationId, $targetUserId)) {
                    return $this->fail('Forbidden', 403);
                }
                $filters['user_id'] = $targetUserId;
            } elseif (!$this->teamScopeService->isOrgWideViewer($currentUserId, $organizationId)) {
                $filters['user_ids'] = $visibleUserIds;
            }

            $filters = array_filter($filters, fn($value) => $value !== null && $value !== '');

            $report = $this->reportService->getTimeSummary($filters);

            return $this->respond([
                'success' => true,
                'data' => $report
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/reports/project-breakdown
     */
    public function projectBreakdown()
    {
        try {
            $currentUserId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $organizationId = (int)($this->request->getGet('organization_id') ?? $this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$currentUserId || !$organizationId) {
                return $this->fail('Unauthorized', 401);
            }

            $permissionService = new PermissionService();
            $canViewTeam = $permissionService->userHasPermission($currentUserId, $organizationId, 'reports.view_team');
            $visibleUserIds = $this->teamScopeService->getVisibleUserIds($currentUserId, $organizationId);

            $filters = [
                'organization_id' => $organizationId,
                'start_date' => $this->request->getGet('start_date'),
                'end_date' => $this->request->getGet('end_date'),
            ];

            if (!$canViewTeam) {
                $filters['user_id'] = $currentUserId;
            } elseif ($requestedUserId = $this->request->getGet('user_id')) {
                $targetUserId = (int) $requestedUserId;
                if (!$this->teamScopeService->canViewUser($currentUserId, $organizationId, $targetUserId)) {
                    return $this->fail('Forbidden', 403);
                }
                $filters['user_id'] = $targetUserId;
            } elseif (!$this->teamScopeService->isOrgWideViewer($currentUserId, $organizationId)) {
                $filters['user_ids'] = $visibleUserIds;
            }

            $filters = array_filter($filters, fn($value) => $value !== null && $value !== '');

            $report = $this->reportService->getProjectBreakdown($filters);

            return $this->respond([
                'success' => true,
                'data' => $report
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/reports/user-productivity/{userId}
     */
    public function userProductivity($userId = null)
    {
        try {
            $currentUserId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            $targetUserId = (int) $userId;

            if ($targetUserId !== $currentUserId
                && !$this->teamScopeService->canViewUser($currentUserId, $organizationId, $targetUserId)) {
                return $this->fail('Forbidden', 403);
            }

            $startDate = $this->request->getGet('start_date');
            $endDate = $this->request->getGet('end_date');

            if (!$startDate || !$endDate) {
                return $this->fail('start_date and end_date are required', 400);
            }

            $report = $this->reportService->getUserProductivity($targetUserId, $startDate, $endDate);

            return $this->respond([
                'success' => true,
                'data' => $report
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/reports/team-leaderboard?organization_id=1
     */
    public function teamLeaderboard()
    {
        try {
            $currentUserId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $organizationId = (int)($this->request->getGet('organization_id') ?? $this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            $startDate = $this->request->getGet('start_date');
            $endDate = $this->request->getGet('end_date');

            if (!$organizationId || !$startDate || !$endDate) {
                return $this->fail('organization_id, start_date, and end_date are required', 400);
            }

            $visibleUserIds = $this->teamScopeService->getVisibleUserIds($currentUserId, $organizationId);
            $scopeUserIds = $this->teamScopeService->isOrgWideViewer($currentUserId, $organizationId)
                ? null
                : $visibleUserIds;

            $leaderboard = $this->reportService->getTeamLeaderboard($organizationId, $startDate, $endDate, $scopeUserIds);

            return $this->respond([
                'success' => true,
                'data' => $leaderboard
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/reports/active-sessions
     */
    public function activeSessions()
    {
        try {
            $currentUserId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $organizationId = (int)($this->request->getGet('organization_id') ?? $this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$currentUserId || !$organizationId) {
                return $this->fail('Unauthorized', 401);
            }

            $permissionService = new PermissionService();
            $canViewTeam = $permissionService->userHasPermission($currentUserId, $organizationId, 'reports.view_team');
            $visibleUserIds = $canViewTeam
                ? $this->teamScopeService->getVisibleUserIds($currentUserId, $organizationId)
                : [$currentUserId];

            $sessions = $this->reportService->getActiveSessions($organizationId, $visibleUserIds);

            return $this->respond([
                'success' => true,
                'data' => $sessions,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/reports/export
     */
    public function export()
    {
        try {
            $data = $this->request->getJSON(true);

            if (!isset($data['report_data']) || !isset($data['filename'])) {
                return $this->fail('report_data and filename are required', 400);
            }

            $format = $data['format'] ?? 'csv';
            $title = $data['title'] ?? 'Report';

            $filepath = match ($format) {
                'pdf' => $this->reportService->exportToPdf($data['report_data'], $data['filename'], $title),
                'xlsx' => $this->reportService->exportToExcel($data['report_data'], $data['filename']),
                default => $this->reportService->exportToCSV($data['report_data'], $data['filename']),
            };

            return $this->respond([
                'success' => true,
                'message' => 'Report exported successfully',
                'data' => [
                    'filepath' => $filepath,
                    'download_url' => base_url('exports/' . basename($filepath))
                ]
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/reports/summary
     */
    public function summary()
    {
        try {
            $currentUserId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$currentUserId || !$organizationId) {
                return $this->fail('Organization context required', 400);
            }

            $permissionService = new PermissionService();
            $canViewTeam = $permissionService->userHasPermission($currentUserId, $organizationId, 'reports.view_team');
            $visibleUserIds = $this->teamScopeService->getVisibleUserIds($currentUserId, $organizationId);

            if (!$canViewTeam) {
                $summary = $this->reportService->getSummary($organizationId, $currentUserId);
            } elseif ($this->teamScopeService->isOrgWideViewer($currentUserId, $organizationId)) {
                $summary = $this->reportService->getSummary($organizationId);
            } else {
                $summary = $this->reportService->getSummary($organizationId, null, $visibleUserIds);
            }

            return $this->respond([
                'success' => true,
                'data' => $summary
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/reports/hourly-timeline?date=2026-06-13&user_id=1
     */
    public function hourlyTimeline()
    {
        try {
            $currentUserId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $organizationId = (int)($this->request->getGet('organization_id') ?? $this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$currentUserId || !$organizationId) {
                return $this->fail('Unauthorized', 401);
            }

            $date = $this->request->getGet('date');
            if (!$date) {
                return $this->fail('date is required (YYYY-MM-DD)', 400);
            }

            $targetUserId = (int)($this->request->getGet('user_id') ?? $currentUserId);
            $permissionService = new PermissionService();
            $canViewTeam = $permissionService->userHasPermission($currentUserId, $organizationId, 'activity.view_team');

            if ($targetUserId !== $currentUserId && !$canViewTeam) {
                return $this->fail('Forbidden', 403);
            }

            if ($targetUserId !== $currentUserId
                && !$this->teamScopeService->canViewUser($currentUserId, $organizationId, $targetUserId)) {
                return $this->fail('Forbidden', 403);
            }

            $timeline = $this->reportService->getHourlyTimeline($organizationId, $targetUserId, $date);

            return $this->respond([
                'success' => true,
                'data' => $timeline,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function topUrls()
    {
        return $this->respondTeamReport(fn ($orgId, $start, $end) =>
            $this->reportService->getTopUrls($orgId, $start, $end, $this->request->getGet('user_id') ? (int) $this->request->getGet('user_id') : null)
        );
    }

    public function orgProductivity()
    {
        return $this->respondTeamReport(fn ($orgId, $start, $end) =>
            $this->reportService->getOrgProductivity($orgId, $start, $end)
        );
    }

    public function projectProfitability()
    {
        return $this->respondTeamReport(fn ($orgId, $start, $end) =>
            $this->reportService->getProjectProfitability($orgId, $start, $end)
        );
    }

    public function idleBreakdown()
    {
        return $this->respondTeamReport(fn ($orgId, $start, $end) =>
            $this->reportService->getIdleBreakdown($orgId, $start, $end, $this->request->getGet('user_id') ? (int) $this->request->getGet('user_id') : null)
        );
    }

    private function respondTeamReport(callable $callback)
    {
        try {
            $organizationId = (int)($this->request->getGet('organization_id') ?? $this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            $startDate = $this->request->getGet('start_date');
            $endDate = $this->request->getGet('end_date');

            if (!$organizationId || !$startDate || !$endDate) {
                return $this->fail('organization_id, start_date, and end_date are required', 400);
            }

            return $this->respond([
                'success' => true,
                'data' => $callback($organizationId, $startDate, $endDate),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
