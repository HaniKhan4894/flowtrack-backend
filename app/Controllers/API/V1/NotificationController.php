<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\NotificationService;

class NotificationController extends ResourceController
{
    protected $notificationService;
    protected $format = 'json';

    public function __construct()
    {
        $this->notificationService = new NotificationService();
    }

    /**
     * GET /api/v1/notifications?unread_only=1
     */
    public function index()
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if ($userId <= 0) {
                return $this->fail('Unauthorized', 401);
            }
            $unreadOnly = $this->request->getGet('unread_only') === '1';

            $notifications = $this->notificationService->getUserNotifications($userId, $unreadOnly);

            return $this->respond([
                'success' => true,
                'data' => $notifications
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/notifications/unread-count
     */
    public function unreadCount()
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if ($userId <= 0) {
                return $this->fail('Unauthorized', 401);
            }
            $count = $this->notificationService->getUnreadCount($userId);

            return $this->respond([
                'success' => true,
                'data' => ['count' => $count]
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/notifications/{id}/read
     */
    public function markAsRead($id = null)
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if ($userId <= 0) {
                return $this->fail('Unauthorized', 401);
            }
            $this->notificationService->markAsRead($id, $userId);

            return $this->respond([
                'success' => true,
                'message' => 'Notification marked as read'
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/notifications/read-all
     */
    public function markAllAsRead()
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if ($userId <= 0) {
                return $this->fail('Unauthorized', 401);
            }
            $this->notificationService->markAllAsRead($userId);

            return $this->respond([
                'success' => true,
                'message' => 'All notifications marked as read'
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * DELETE /api/v1/notifications/{id}
     */
    public function delete($id = null)
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if ($userId <= 0) {
                return $this->fail('Unauthorized', 401);
            }
            $this->notificationService->delete($id, $userId);

            return $this->respond([
                'success' => true,
                'message' => 'Notification deleted'
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
