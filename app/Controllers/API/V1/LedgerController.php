<?php

namespace App\Controllers\API\V1;

use App\Services\LedgerService;
use App\Services\PermissionService;
use CodeIgniter\RESTful\ResourceController;

/**
 * Phase 6 — Proof-of-work ledger API.
 */
class LedgerController extends ResourceController
{
    protected $format = 'json';
    protected LedgerService $ledger;
    protected PermissionService $permissions;

    public function __construct()
    {
        $this->ledger = new LedgerService();
        $this->permissions = new PermissionService();
    }

    /**
     * GET /api/v1/ledger  — summary + recent records (requires reports.view_team)
     */
    public function index()
    {
        try {
            [$orgId] = $this->requireManager();
            return $this->respond([
                'success' => true,
                'data' => [
                    'summary' => $this->ledger->summary($orgId),
                    'records' => $this->ledger->recent($orgId, 50),
                ],
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/ledger/verify  — recompute chain + data integrity
     */
    public function verify()
    {
        try {
            [$orgId] = $this->requireManager();
            return $this->respond([
                'success' => true,
                'data' => $this->ledger->verify($orgId),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    private function requireManager(): array
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
        if (!$orgId || !$userId) {
            throw new \RuntimeException('Unauthorized');
        }
        if (!$this->permissions->userHasPermission($userId, $orgId, 'reports.view_team')) {
            throw new \RuntimeException('Team report permission required');
        }
        return [$orgId, $userId];
    }
}
