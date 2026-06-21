<?php

namespace App\Controllers\API\V1;

use App\Services\AdvancedMonitoringService;
use App\Services\PermissionService;
use App\Services\TeamScopeService;
use CodeIgniter\RESTful\ResourceController;

class AdvancedMonitoringController extends ResourceController
{
    protected AdvancedMonitoringService $advancedMonitoringService;
    protected TeamScopeService $teamScopeService;
    protected $format = 'json';

    public function __construct()
    {
        $this->advancedMonitoringService = new AdvancedMonitoringService();
        $this->teamScopeService = new TeamScopeService();
    }

    /**
     * GET /api/v1/organizations/{id}/members/{userId}/advanced-monitoring
     */
    public function show($orgId = null, $userId = null)
    {
        try {
            [$organizationId, $targetUserId, $currentUserId] = $this->resolveContext($orgId, $userId);
            $this->assertCanManage($currentUserId, $organizationId, $targetUserId);

            return $this->respond([
                'success' => true,
                'data' => [
                    'active' => $this->advancedMonitoringService->getActiveSession($organizationId, $targetUserId),
                    'history' => $this->advancedMonitoringService->listSessions($organizationId, $targetUserId),
                    'plan_available' => $this->advancedMonitoringService->orgHasFeature($organizationId),
                ],
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/organizations/{id}/members/{userId}/advanced-monitoring
     */
    public function enable($orgId = null, $userId = null)
    {
        try {
            [$organizationId, $targetUserId, $currentUserId] = $this->resolveContext($orgId, $userId);
            $this->assertCanManage($currentUserId, $organizationId, $targetUserId);

            $data = $this->request->getJSON(true) ?? [];
            $session = $this->advancedMonitoringService->enable(
                $organizationId,
                $targetUserId,
                $currentUserId,
                $data
            );

            return $this->respond([
                'success' => true,
                'message' => 'Advanced monitoring enabled',
                'data' => $session,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/organizations/{id}/members/{userId}/advanced-monitoring/close
     */
    public function close($orgId = null, $userId = null)
    {
        try {
            [$organizationId, $targetUserId, $currentUserId] = $this->resolveContext($orgId, $userId);
            $this->assertCanManage($currentUserId, $organizationId, $targetUserId);

            $data = $this->request->getJSON(true) ?? [];
            $session = $this->advancedMonitoringService->close(
                $organizationId,
                $targetUserId,
                $data['result_summary'] ?? null,
                filter_var($data['notify_member'] ?? false, FILTER_VALIDATE_BOOLEAN)
            );

            return $this->respond([
                'success' => true,
                'message' => 'Advanced monitoring closed',
                'data' => $session,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/reports/advanced-monitoring?user_id=&start_date=&end_date=
     */
    public function report()
    {
        try {
            $currentUserId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $organizationId = (int) ($this->request->getGet('organization_id') ?? $this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            $targetUserId = (int) ($this->request->getGet('user_id') ?? 0);
            $startDate = (string) ($this->request->getGet('start_date') ?? date('Y-m-d', strtotime('-7 days')));
            $endDate = (string) ($this->request->getGet('end_date') ?? date('Y-m-d'));

            if (!$currentUserId || !$organizationId || !$targetUserId) {
                return $this->fail('user_id is required', 400);
            }

            $this->assertCanManage($currentUserId, $organizationId, $targetUserId);

            $report = $this->advancedMonitoringService->buildReport(
                $organizationId,
                $targetUserId,
                $startDate,
                $endDate
            );

            return $this->respond([
                'success' => true,
                'data' => $report,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * @return array{0:int,1:int,2:int}
     */
    private function resolveContext($orgId, $userId): array
    {
        $organizationId = (int) $orgId;
        $targetUserId = (int) $userId;
        $currentUserId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);

        if (!$currentUserId || !$organizationId || !$targetUserId) {
            throw new \Exception('Invalid request context');
        }

        return [$organizationId, $targetUserId, $currentUserId];
    }

    private function assertCanManage(int $currentUserId, int $organizationId, int $targetUserId): void
    {
        $permissionService = new PermissionService();
        if (!$permissionService->userHasPermission($currentUserId, $organizationId, 'monitoring.advanced')) {
            throw new \Exception('You do not have permission to manage advanced monitoring.');
        }

        if (!$this->teamScopeService->canViewUser($currentUserId, $organizationId, $targetUserId)) {
            throw new \Exception('You cannot manage monitoring for this member.');
        }
    }
}
