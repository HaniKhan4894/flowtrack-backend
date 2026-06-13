<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\LeaveService;

class LeaveController extends ResourceController
{
    protected LeaveService $leaveService;
    protected $format = 'json';

    public function __construct()
    {
        $this->leaveService = new LeaveService();
    }

    private function requireOrganizationId()
    {
        $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if ($organizationId <= 0) {
            return $this->fail('Organization context is required', 400);
        }
        return $organizationId;
    }

    public function types()
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            return $this->respond([
                'success' => true,
                'data' => $this->leaveService->getLeaveTypes($organizationId),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function createType()
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $data = $this->request->getJSON(true);
            $type = $this->leaveService->createLeaveType($organizationId, $data);

            return $this->respondCreated(['success' => true, 'data' => $type]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function updateType($id = null)
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $data = $this->request->getJSON(true);
            $type = $this->leaveService->updateLeaveType((int) $id, $organizationId, $data);

            return $this->respond(['success' => true, 'data' => $type]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function balances()
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $userId = (int)($this->request->getGet('user_id') ?? $this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $year = $this->request->getGet('year') ? (int) $this->request->getGet('year') : null;

            return $this->respond([
                'success' => true,
                'data' => $this->leaveService->getBalances($organizationId, $userId ?: null, $year),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function requests()
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $filters = array_filter([
                'user_id' => $this->request->getGet('user_id'),
                'status' => $this->request->getGet('status'),
            ], fn ($v) => $v !== null && $v !== '');

            return $this->respond([
                'success' => true,
                'data' => $this->leaveService->getRequests($organizationId, $filters),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function requestLeave()
    {
        try {
            $organizationId = $this->requireOrganizationId();
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!is_int($organizationId) || !$userId) {
                return $this->fail('Unauthorized', 401);
            }

            $data = $this->request->getJSON(true);
            $request = $this->leaveService->requestLeave($organizationId, $userId, $data);

            return $this->respondCreated(['success' => true, 'data' => $request]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function review($id = null)
    {
        try {
            $organizationId = $this->requireOrganizationId();
            $reviewerId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!is_int($organizationId) || !$reviewerId) {
                return $this->fail('Unauthorized', 401);
            }

            $data = $this->request->getJSON(true);
            $action = $data['action'] ?? '';
            $request = $this->leaveService->reviewRequest(
                (int) $id,
                $organizationId,
                $reviewerId,
                $action,
                $data['reason'] ?? null
            );

            return $this->respond(['success' => true, 'data' => $request]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function cancel($id = null)
    {
        try {
            $organizationId = $this->requireOrganizationId();
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!is_int($organizationId) || !$userId) {
                return $this->fail('Unauthorized', 401);
            }

            $request = $this->leaveService->cancelRequest((int) $id, $organizationId, $userId);

            return $this->respond(['success' => true, 'data' => $request]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
