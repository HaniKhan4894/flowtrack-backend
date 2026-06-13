<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\TimesheetService;
use App\Services\PermissionService;
use App\Services\TeamScopeService;

class TimesheetController extends ResourceController
{
    protected TimesheetService $timesheetService;
    protected TeamScopeService $teamScopeService;
    protected $format = 'json';

    public function __construct()
    {
        $this->timesheetService = new TimesheetService();
        $this->teamScopeService = new TeamScopeService();
    }

    private function authContext(): array|\CodeIgniter\HTTP\ResponseInterface
    {
        $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
        $organizationId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);

        if (!$userId || !$organizationId) {
            return $this->fail('Unauthorized', 401);
        }

        return ['user_id' => $userId, 'organization_id' => $organizationId];
    }

    /**
     * GET /api/v1/timesheets
     */
    public function index()
    {
        try {
            $ctx = $this->authContext();
            if (!is_array($ctx)) {
                return $ctx;
            }

            $permissionService = new PermissionService();
            $canApprove = $permissionService->userHasPermission(
                $ctx['user_id'],
                $ctx['organization_id'],
                'timesheet.approve'
            );

            $requestedUserId = $this->request->getGet('user_id');
            if (!$canApprove) {
                $targetUserId = $ctx['user_id'];
            } elseif ($requestedUserId) {
                $targetUserId = (int) $requestedUserId;
                if (!$this->teamScopeService->canViewUser($ctx['user_id'], $ctx['organization_id'], $targetUserId)) {
                    return $this->fail('Forbidden', 403);
                }
            } else {
                $targetUserId = $ctx['user_id'];
            }

            $filters = [
                'user_id' => $targetUserId,
                'status' => $this->request->getGet('status'),
                'week_start' => $this->request->getGet('week_start'),
                'page' => $this->request->getGet('page') ?? 1,
                'per_page' => $this->request->getGet('per_page') ?? 20,
            ];
            $filters = array_filter($filters, fn ($v) => $v !== null);

            $result = $this->timesheetService->getPeriods($ctx['organization_id'], $filters);

            return $this->respond([
                'success' => true,
                'data' => $result['data'],
                'pagination' => $result['pagination'],
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/timesheets/current-week
     */
    public function currentWeek()
    {
        try {
            $ctx = $this->authContext();
            if (!is_array($ctx)) {
                return $ctx;
            }

            $permissionService = new PermissionService();
            $canApprove = $permissionService->userHasPermission(
                $ctx['user_id'],
                $ctx['organization_id'],
                'timesheet.approve'
            );

            $requestedUserId = $this->request->getGet('user_id');
            if (!$canApprove) {
                $targetUserId = $ctx['user_id'];
            } elseif ($requestedUserId) {
                $targetUserId = (int) $requestedUserId;
                if (!$this->teamScopeService->canViewUser($ctx['user_id'], $ctx['organization_id'], $targetUserId)) {
                    return $this->fail('Forbidden', 403);
                }
            } else {
                $targetUserId = $ctx['user_id'];
            }

            $grid = $this->timesheetService->getCurrentWeekGrid(
                $targetUserId,
                $ctx['organization_id'],
                $this->request->getGet('week_start')
            );

            return $this->respond([
                'success' => true,
                'data' => $grid,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/timesheets/{id}/submit
     */
    public function submit($id = null)
    {
        try {
            $ctx = $this->authContext();
            if (!is_array($ctx)) {
                return $ctx;
            }

            $period = $this->timesheetService->submitPeriod(
                (int) $id,
                $ctx['user_id'],
                $ctx['organization_id']
            );

            return $this->respond([
                'success' => true,
                'message' => 'Timesheet submitted successfully',
                'data' => $period,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/timesheets/{id}/approve
     */
    public function approve($id = null)
    {
        try {
            $ctx = $this->authContext();
            if (!is_array($ctx)) {
                return $ctx;
            }

            $period = $this->timesheetService->approvePeriod(
                (int) $id,
                $ctx['user_id'],
                $ctx['organization_id']
            );

            return $this->respond([
                'success' => true,
                'message' => 'Timesheet approved successfully',
                'data' => $period,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/timesheets/{id}/reject
     */
    public function reject($id = null)
    {
        try {
            $ctx = $this->authContext();
            if (!is_array($ctx)) {
                return $ctx;
            }

            $data = $this->request->getJSON(true) ?? [];
            $reason = trim((string) ($data['reason'] ?? ''));
            if ($reason === '') {
                return $this->fail('Rejection reason is required', 400);
            }

            $period = $this->timesheetService->rejectPeriod(
                (int) $id,
                $ctx['user_id'],
                $ctx['organization_id'],
                $reason
            );

            return $this->respond([
                'success' => true,
                'message' => 'Timesheet rejected',
                'data' => $period,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
