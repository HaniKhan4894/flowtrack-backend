<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\ReportService;

class ReportController extends ResourceController
{
    protected $reportService;
    protected $format = 'json';

    public function __construct()
    {
        $this->reportService = new ReportService();
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

            $permissionService = new \App\Services\PermissionService();
            $canViewTeam = $permissionService->userHasPermission($currentUserId, $organizationId, 'reports.view_team');

            $filters = [
                'organization_id' => $organizationId,
                'project_id' => $this->request->getGet('project_id'),
                'start_date' => $this->request->getGet('start_date'),
                'end_date' => $this->request->getGet('end_date'),
            ];

            if (!$canViewTeam) {
                $filters['user_id'] = $currentUserId;
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

            $permissionService = new \App\Services\PermissionService();
            $canViewTeam = $permissionService->userHasPermission($currentUserId, $organizationId, 'reports.view_team');

            $filters = [
                'organization_id' => $organizationId,
                'start_date' => $this->request->getGet('start_date'),
                'end_date' => $this->request->getGet('end_date'),
            ];

            if (!$canViewTeam) {
                $filters['user_id'] = $currentUserId;
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
            $startDate = $this->request->getGet('start_date');
            $endDate = $this->request->getGet('end_date');

            if (!$startDate || !$endDate) {
                return $this->fail('start_date and end_date are required', 400);
            }

            $report = $this->reportService->getUserProductivity($userId, $startDate, $endDate);

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
            $organizationId = $this->request->getGet('organization_id') ?? (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            $startDate = $this->request->getGet('start_date');
            $endDate = $this->request->getGet('end_date');

            if (!$organizationId || !$startDate || !$endDate) {
                return $this->fail('organization_id, start_date, and end_date are required', 400);
            }

            $leaderboard = $this->reportService->getTeamLeaderboard($organizationId, $startDate, $endDate);

            return $this->respond([
                'success' => true,
                'data' => $leaderboard
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

            $filepath = $this->reportService->exportToCSV($data['report_data'], $data['filename']);

            return $this->respond([
                'success' => true,
                'message' => 'Report exported successfully',
                'data' => [
                    'filepath' => $filepath,
                    'download_url' => base_url('exports/' . $data['filename'])
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

            $permissionService = new \App\Services\PermissionService();
            $canViewTeam = $permissionService->userHasPermission($currentUserId, $organizationId, 'reports.view_team');

            $scopeUserId = $canViewTeam ? null : $currentUserId;
            $summary = $this->reportService->getSummary($organizationId, $scopeUserId);

            return $this->respond([
                'success' => true,
                'data' => $summary
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
