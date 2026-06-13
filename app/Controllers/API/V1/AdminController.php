<?php

namespace App\Controllers\API\V1;

use App\Services\AdminService;
use CodeIgniter\RESTful\ResourceController;

class AdminController extends ResourceController
{
    protected AdminService $adminService;
    protected $format = 'json';

    public function __construct()
    {
        $this->adminService = new AdminService();
    }

    public function organizations()
    {
        return $this->respond([
            'success' => true,
            'data' => $this->adminService->getOrganizationsOverview(),
        ]);
    }

    public function subscriptionStats()
    {
        return $this->respond([
            'success' => true,
            'data' => $this->adminService->getSubscriptionStats(),
        ]);
    }

    public function activityOverview()
    {
        return $this->respond([
            'success' => true,
            'data' => $this->adminService->getActivityOverview(),
        ]);
    }

    public function organizationDetail($id = null)
    {
        $detail = $this->adminService->getOrganizationDetail((int) $id);
        if (!$detail) {
            return $this->failNotFound('Organization not found');
        }

        return $this->respond([
            'success' => true,
            'data' => $detail,
        ]);
    }
}
