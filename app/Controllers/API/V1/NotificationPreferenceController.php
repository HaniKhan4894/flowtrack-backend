<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\NotificationPreferenceService;

class NotificationPreferenceController extends ResourceController
{
    protected NotificationPreferenceService $preferenceService;
    protected $format = 'json';

    public function __construct()
    {
        $this->preferenceService = new NotificationPreferenceService();
    }

    /**
     * GET /api/v1/notification-preferences
     */
    public function index()
    {
        try {
            $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$userId) {
                return $this->fail('Unauthorized', 401);
            }

            return $this->respond([
                'success' => true,
                'data' => $this->preferenceService->getUserPreferences($userId),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/notification-preferences
     */
    public function update($id = null)
    {
        try {
            $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$userId) {
                return $this->fail('Unauthorized', 401);
            }

            $data = $this->request->getJSON(true);
            $preferences = $data['preferences'] ?? $data;

            if (!is_array($preferences)) {
                return $this->fail('preferences array is required', 422);
            }

            $updated = $this->preferenceService->updatePreferences($userId, $preferences);

            return $this->respond([
                'success' => true,
                'message' => 'Notification preferences updated',
                'data' => $updated,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
