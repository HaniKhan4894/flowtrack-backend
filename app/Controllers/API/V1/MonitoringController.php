<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\MemberMonitoringService;

class MonitoringController extends ResourceController
{
    protected MemberMonitoringService $monitoringService;
    protected $format = 'json';

    public function __construct()
    {
        $this->monitoringService = new MemberMonitoringService();
    }

    /**
     * GET /api/v1/monitoring/settings
     */
    public function mySettings()
    {
        try {
            $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $organizationId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$userId || !$organizationId) {
                return $this->fail('Unauthorized', 401);
            }

            $settings = $this->monitoringService->getSettings($organizationId, $userId);

            return $this->respond([
                'success' => true,
                'data' => $settings,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/monitoring/settings — update current user's monitoring preferences.
     */
    public function updateMySettings()
    {
        try {
            $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $organizationId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$userId || !$organizationId) {
                return $this->fail('Unauthorized', 401);
            }

            $payload = $this->request->getJSON(true) ?? [];
            $settings = $this->monitoringService->updateSettings($organizationId, $userId, $payload);

            return $this->respond([
                'success' => true,
                'message' => 'Monitoring settings updated',
                'data' => $settings,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
