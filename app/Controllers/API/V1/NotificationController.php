<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\NotificationService;
use App\Libraries\JWTHandler;

class NotificationController extends ResourceController
{
    protected $notificationService;
    protected $format = 'json';

    public function __construct()
    {
        $this->notificationService = new NotificationService();
    }

    /**
     * GET /api/v1/notifications/stream?token=<jwt>&since=<id>
     *
     * Phase 12 — Server-Sent Events push for real-time in-app notifications.
     * EventSource can't set Authorization headers, so the JWT is passed as a
     * query param and verified here (this route is not behind the auth filter).
     * The connection streams new notifications for a bounded window, then closes
     * so the browser's EventSource transparently reconnects.
     */
    public function stream()
    {
        $token = (string) ($this->request->getGet('token') ?? '');
        $userData = $token !== '' ? (new JWTHandler())->getUserFromToken($token) : null;
        $userId = $userData ? (int) ($userData['user_id'] ?? 0) : 0;

        if ($userId <= 0) {
            return $this->failUnauthorized('Invalid or missing token');
        }

        // Disable output buffering / compression for streaming.
        while (ob_get_level() > 0) {
            ob_end_flush();
        }

        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache, no-transform');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no');

        @set_time_limit(0);
        ignore_user_abort(false);

        $lastId = (int) ($this->request->getGet('since') ?? 0);
        if ($lastId <= 0) {
            // Start from the newest existing notification to only push new ones.
            $recent = $this->notificationService->getUserNotifications($userId, false, 1);
            $lastId = $recent[0]['id'] ?? 0;
        }

        // Tell the client which id we're starting from.
        echo 'event: ready' . "\n";
        echo 'data: ' . json_encode(['last_id' => $lastId]) . "\n\n";
        @ob_flush();
        @flush();

        $deadline = time() + 25; // Bounded window; client reconnects after.
        while (time() < $deadline) {
            if (connection_aborted()) {
                break;
            }

            $fresh = $this->notificationService->getNotificationsAfter($userId, $lastId);
            foreach ($fresh as $n) {
                $lastId = max($lastId, (int) $n['id']);
                echo 'event: notification' . "\n";
                echo 'data: ' . json_encode($n) . "\n\n";
            }

            if ($fresh) {
                $count = $this->notificationService->getUnreadCount($userId);
                echo 'event: unread' . "\n";
                echo 'data: ' . json_encode(['count' => $count, 'last_id' => $lastId]) . "\n\n";
            } else {
                echo ': keep-alive' . "\n\n"; // Comment line keeps the socket warm.
            }

            @ob_flush();
            @flush();
            sleep(3);
        }

        exit;
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
