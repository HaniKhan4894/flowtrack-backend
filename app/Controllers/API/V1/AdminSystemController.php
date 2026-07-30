<?php

namespace App\Controllers\API\V1;

use App\Services\Admin\AdminSystemService;

/**
 * Platform health, settings, and maintenance actions (super-admin only).
 */
class AdminSystemController extends AdminBaseController
{
    protected AdminSystemService $service;

    public function __construct()
    {
        $this->service = new AdminSystemService();
    }

    /** GET /api/v1/admin/system/health */
    public function health()
    {
        return $this->ok($this->service->getHealth());
    }

    /** GET /api/v1/admin/system/logs?limit=40 */
    public function logs()
    {
        return $this->ok($this->service->recentErrors((int) ($this->request->getGet('limit') ?? 40)));
    }

    /** GET /api/v1/admin/system/settings */
    public function settings()
    {
        return $this->ok($this->service->platformSettings());
    }

    /** PUT /api/v1/admin/system/settings */
    public function updateSettings()
    {
        $data = $this->payload();

        return $this->attempt(
            fn () => $this->service->updatePlatformSettings($data, $this->adminId()),
            'Platform settings updated'
        );
    }

    /** POST /api/v1/admin/system/close-stale-timers */
    public function closeStaleTimers()
    {
        $hours = (int) ($this->payload()['hours'] ?? 16);

        return $this->attempt(
            fn () => $this->service->closeStaleTimers($this->adminId(), $hours),
            'Stale timers closed'
        );
    }
}
