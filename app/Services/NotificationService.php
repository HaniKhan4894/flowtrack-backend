<?php

namespace App\Services;

use App\Models\NotificationModel;

class NotificationService
{
    protected $notificationModel;

    public function __construct()
    {
        $this->notificationModel = new NotificationModel();
    }

    /**
     * Create notification
     */
    public function create(int $userId, string $type, string $title, string $message, ?array $data = null): array
    {
        $notificationId = $this->notificationModel->insert([
            'user_id' => $userId,
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'data' => $data ? json_encode($data) : null,
        ]);

        return $this->notificationModel->find($notificationId);
    }

    /**
     * Get user notifications
     */
    public function getUserNotifications(int $userId, bool $unreadOnly = false, int $limit = 50): array
    {
        $builder = $this->notificationModel->builder();
        $builder->where('user_id', $userId);

        if ($unreadOnly) {
            $builder->where('is_read', false);
        }

        return $builder->orderBy('created_at', 'DESC')
            ->limit($limit)
            ->get()
            ->getResultArray();
    }

    /**
     * Mark notification as read
     */
    public function markAsRead(int $notificationId, int $userId): bool
    {
        return $this->notificationModel
            ->where('id', $notificationId)
            ->where('user_id', $userId)
            ->set([
                'is_read' => true,
                'read_at' => date('Y-m-d H:i:s')
            ])
            ->update();
    }

    /**
     * Mark all as read
     */
    public function markAllAsRead(int $userId): bool
    {
        return $this->notificationModel
            ->where('user_id', $userId)
            ->where('is_read', false)
            ->set([
                'is_read' => true,
                'read_at' => date('Y-m-d H:i:s')
            ])
            ->update();
    }

    /**
     * Delete notification
     */
    public function delete(int $notificationId, int $userId): bool
    {
        return $this->notificationModel
            ->where('id', $notificationId)
            ->where('user_id', $userId)
            ->delete();
    }

    /**
     * Get unread count
     */
    public function getUnreadCount(int $userId): int
    {
        return $this->notificationModel
            ->where('user_id', $userId)
            ->where('is_read', false)
            ->countAllResults();
    }

    // Helper methods for common notifications

    public function notifyTimeEntryStarted(int $userId, array $timeEntry): array
    {
        return $this->create(
            $userId,
            'info',
            'Timer Started',
            'You started tracking time for ' . ($timeEntry['project_name'] ?? 'a project'),
            ['time_entry_id' => $timeEntry['id']]
        );
    }

    public function notifyInvoiceCreated(int $userId, array $invoice): array
    {
        return $this->create(
            $userId,
            'success',
            'Invoice Created',
            'Invoice #' . $invoice['invoice_number'] . ' has been created',
            ['invoice_id' => $invoice['id']]
        );
    }

    public function notifyMemberAdded(int $userId, string $organizationName): array
    {
        return $this->create(
            $userId,
            'info',
            'Added to Organization',
            'You have been added to ' . $organizationName,
            ['organization_name' => $organizationName]
        );
    }
}
