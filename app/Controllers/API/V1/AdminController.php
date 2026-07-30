<?php

namespace App\Controllers\API\V1;

use App\Services\Admin\AdminMetricsService;
use App\Services\AdminService;

/**
 * Platform overview endpoints (super-admin only).
 */
class AdminController extends AdminBaseController
{
    protected AdminService $adminService;
    protected AdminMetricsService $metricsService;

    public function __construct()
    {
        $this->adminService = new AdminService();
        $this->metricsService = new AdminMetricsService();
    }

    /**
     * GET /api/v1/admin/overview
     * Everything the dashboard needs in one round trip.
     */
    public function overview()
    {
        $days = (int) ($this->request->getGet('days') ?? 30);

        return $this->ok([
            'metrics' => $this->metricsService->getOverview(),
            'timeseries' => $this->metricsService->getTimeseries($days),
            'recent' => $this->metricsService->getRecentActivity(8),
        ]);
    }

    /** GET /api/v1/admin/metrics */
    public function metrics()
    {
        return $this->ok($this->metricsService->getOverview());
    }

    /** GET /api/v1/admin/timeseries?days=30 */
    public function timeseries()
    {
        return $this->ok($this->metricsService->getTimeseries((int) ($this->request->getGet('days') ?? 30)));
    }

    /** GET /api/v1/admin/organizations — legacy flat list, still used by older clients. */
    public function organizations()
    {
        return $this->ok($this->adminService->getOrganizationsOverview());
    }

    /** GET /api/v1/admin/subscriptions/stats */
    public function subscriptionStats()
    {
        return $this->ok($this->adminService->getSubscriptionStats());
    }

    /** GET /api/v1/admin/activity/overview */
    public function activityOverview()
    {
        return $this->ok($this->adminService->getActivityOverview());
    }
}
