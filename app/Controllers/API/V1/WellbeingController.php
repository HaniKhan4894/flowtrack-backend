<?php

namespace App\Controllers\API\V1;

use App\Services\PermissionService;
use App\Services\WellbeingService;
use CodeIgniter\RESTful\ResourceController;

/**
 * Phase 5 — Burnout / wellbeing dashboards.
 */
class WellbeingController extends ResourceController
{
    protected $format = 'json';
    protected WellbeingService $wellbeing;
    protected PermissionService $permissions;

    public function __construct()
    {
        $this->wellbeing = new WellbeingService();
        $this->permissions = new PermissionService();
    }

    /**
     * GET /api/v1/wellbeing/me?days=14
     */
    public function me()
    {
        try {
            [$orgId, $userId] = $this->context();
            return $this->respond([
                'success' => true,
                'data' => $this->wellbeing->forUser($orgId, $userId, $this->days()),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/wellbeing/team?days=14  (requires reports.view_team)
     */
    public function team()
    {
        try {
            [$orgId, $userId] = $this->context();
            if (!$this->permissions->userHasPermission($userId, $orgId, 'reports.view_team')) {
                return $this->failForbidden('Team report permission required');
            }
            return $this->respond([
                'success' => true,
                'data' => $this->wellbeing->forTeam($orgId, $this->days()),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    private function days(): int
    {
        $days = (int) ($this->request->getGet('days') ?? 14);
        return max(7, min(60, $days));
    }

    private function context(): array
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
        if (!$orgId || !$userId) {
            throw new \RuntimeException('Unauthorized');
        }
        return [$orgId, $userId];
    }
}
