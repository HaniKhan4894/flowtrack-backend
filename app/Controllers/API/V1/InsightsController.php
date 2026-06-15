<?php

namespace App\Controllers\API\V1;

use App\Services\InsightsService;
use App\Services\PermissionService;
use App\Services\TeamScopeService;
use CodeIgniter\RESTful\ResourceController;

class InsightsController extends ResourceController
{
    protected InsightsService $insightsService;
    protected PermissionService $permissionService;
    protected TeamScopeService $teamScopeService;
    protected $format = 'json';

    public function __construct()
    {
        $this->insightsService = new InsightsService();
        $this->permissionService = new PermissionService();
        $this->teamScopeService = new TeamScopeService();
    }

    public function weeklySummary()
    {
        try {
            [$orgId, $userId] = $this->requireContext();
            if ($response = $this->requireTeamReports($orgId, $userId)) {
                return $response;
            }

            $summary = $this->insightsService->getWeeklyManagerSummary($orgId, $userId);
            return $this->respond(['success' => true, 'data' => $summary]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function benchmarks()
    {
        try {
            [$orgId, $userId] = $this->requireContext();
            if ($response = $this->requireTeamReports($orgId, $userId)) {
                return $response;
            }

            $start = $this->request->getGet('start_date') ?? $this->request->getGet('start') ?? date('Y-m-d', strtotime('-30 days'));
            $end = $this->request->getGet('end_date') ?? $this->request->getGet('end') ?? date('Y-m-d');
            $data = $this->insightsService->getBenchmarks($orgId, $start, $end);
            return $this->respond(['success' => true, 'data' => $data]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function workPatterns()
    {
        try {
            [$orgId, $userId] = $this->requireContext();
            $targetUserId = $this->resolveTargetUserId($orgId, $userId);
            if ($targetUserId instanceof \CodeIgniter\HTTP\ResponseInterface) {
                return $targetUserId;
            }

            $days = (int) ($this->request->getGet('days') ?? 14);
            $data = $this->insightsService->getWorkPatterns($orgId, $targetUserId, max(7, min(30, $days)));
            return $this->respond(['success' => true, 'data' => $data]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function coach()
    {
        try {
            [$orgId, $userId] = $this->requireContext();
            $targetUserId = $this->resolveTargetUserId($orgId, $userId);
            if ($targetUserId instanceof \CodeIgniter\HTTP\ResponseInterface) {
                return $targetUserId;
            }

            $data = $this->insightsService->getCoachSuggestions($orgId, $targetUserId);
            return $this->respond(['success' => true, 'data' => $data]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function deliveryRisks()
    {
        try {
            [$orgId, $userId] = $this->requireContext();
            if ($response = $this->requireTeamReports($orgId, $userId)) {
                return $response;
            }

            $data = $this->insightsService->getDeliveryRisks($orgId);
            return $this->respond(['success' => true, 'data' => $data]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function sprints()
    {
        try {
            [$orgId, $userId] = $this->requireContext();
            if ($response = $this->requireTeamReports($orgId, $userId)) {
                return $response;
            }

            return $this->respond(['success' => true, 'data' => $this->insightsService->listSprints($orgId)]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function createSprint()
    {
        try {
            [$orgId, $userId] = $this->requireContext();
            if ($response = $this->requireTeamReports($orgId, $userId)) {
                return $response;
            }

            $body = $this->request->getJSON(true) ?? [];
            if (empty($body['start_date']) || empty($body['end_date'])) {
                return $this->respond(['success' => false, 'error' => 'start_date and end_date are required'], 400);
            }

            $sprint = $this->insightsService->createSprint($orgId, $body);
            return $this->respond(['success' => true, 'data' => $sprint], 201);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    protected function requireContext(): array
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);

        if (!$orgId || !$userId) {
            throw new \RuntimeException('Unauthorized');
        }

        return [$orgId, $userId];
    }

    protected function requireTeamReports(int $orgId, int $userId)
    {
        if ($this->permissionService->userHasPermission($userId, $orgId, 'reports.view_team')) {
            return null;
        }

        return $this->failForbidden('Team report permission required');
    }

    protected function resolveTargetUserId(int $orgId, int $userId)
    {
        $requestedUserId = $this->request->getGet('user_id');
        if (!$requestedUserId) {
            return $userId;
        }

        $targetUserId = (int) $requestedUserId;
        if (!$this->teamScopeService->canViewUser($userId, $orgId, $targetUserId)) {
            return $this->failForbidden('Cannot view insights for this user');
        }

        return $targetUserId;
    }
}
