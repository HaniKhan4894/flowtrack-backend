<?php

namespace App\Controllers\API\V1;

use App\Services\Admin\AdminAuditService;

/**
 * Platform-wide audit trail and security signals (super-admin only).
 */
class AdminAuditController extends AdminBaseController
{
    protected AdminAuditService $service;

    public function __construct()
    {
        $this->service = new AdminAuditService();
    }

    /** GET /api/v1/admin/audit-logs */
    public function index()
    {
        $filters = $this->queryFilters([
            'scope', 'search', 'action', 'entity_type', 'organization_id', 'user_id',
            'start_date', 'end_date', 'page', 'per_page',
        ]);

        $result = $this->service->list($filters);

        return $this->respond([
            'success' => true,
            'data' => $result['data'],
            'pagination' => $result['pagination'],
        ]);
    }

    /** GET /api/v1/admin/audit-logs/options */
    public function options()
    {
        return $this->ok($this->service->filterOptions());
    }

    /** GET /api/v1/admin/security */
    public function security()
    {
        return $this->ok($this->service->securityOverview());
    }
}
