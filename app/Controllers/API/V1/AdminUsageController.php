<?php

namespace App\Controllers\API\V1;

use App\Services\Admin\AdminUsageService;

/**
 * Cross-tenant usage analytics (super-admin only).
 */
class AdminUsageController extends AdminBaseController
{
    /** GET /api/v1/admin/usage?days=30 */
    public function index()
    {
        $days = (int) ($this->request->getGet('days') ?? 30);

        return $this->ok((new AdminUsageService())->getOverview($days));
    }
}
