<?php

namespace App\Services\Admin;

use App\Models\PlatformAnnouncementModel;
use App\Services\EmailService;
use App\Services\NotificationService;
use CodeIgniter\Database\BaseConnection;

/**
 * Platform-wide announcements: an in-app banner plus optional in-app
 * notification and email broadcast to the targeted audience.
 */
class AdminAnnouncementService
{
    use AdminAuditTrail;

    protected BaseConnection $db;
    protected PlatformAnnouncementModel $model;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
        $this->model = new PlatformAnnouncementModel();
    }

    public function list(int $limit = 100): array
    {
        $limit = max(1, min(200, $limit));

        $rows = $this->db->table('platform_announcements pa')
            ->select('pa.*, p.name AS plan_name, o.name AS organization_name,
                      u.email AS created_by_email,
                      (SELECT COUNT(*) FROM platform_announcement_dismissals d WHERE d.announcement_id = pa.id) AS dismissals', false)
            ->join('plans p', 'p.id = pa.plan_id', 'left')
            ->join('organizations o', 'o.id = pa.organization_id', 'left')
            ->join('users u', 'u.id = pa.created_by', 'left')
            ->orderBy('pa.created_at', 'DESC')
            ->limit($limit)
            ->get()
            ->getResultArray();

        return array_map(static function (array $row) {
            $row['id'] = (int) $row['id'];
            $row['is_active'] = (bool) $row['is_active'];
            $row['is_dismissible'] = (bool) $row['is_dismissible'];
            $row['send_email'] = (bool) $row['send_email'];
            $row['dismissals'] = (int) $row['dismissals'];
            $row['email_recipients'] = (int) $row['email_recipients'];

            return $row;
        }, $rows);
    }

    public function create(array $data, int $adminUserId): array
    {
        $payload = $this->sanitize($data, true);
        $payload['created_by'] = $adminUserId;

        if (!$this->model->insert($payload)) {
            throw new \RuntimeException(implode(' ', $this->model->errors()) ?: 'Could not save announcement');
        }

        $announcementId = (int) $this->model->getInsertID();
        $announcement = $this->model->find($announcementId);

        $delivery = ['notified' => 0, 'emailed' => 0];
        if (!empty($payload['is_active'])) {
            $delivery = $this->broadcast($announcement);
        }

        $this->recordAdminAction($adminUserId, 'announcement.create', 'announcement', $announcementId, [
            'title' => $payload['title'],
            'audience' => $payload['audience'],
            'delivery' => $delivery,
        ]);

        return ($this->model->find($announcementId) ?? []) + ['delivery' => $delivery];
    }

    public function update(int $announcementId, array $data, int $adminUserId): array
    {
        if (!$this->model->find($announcementId)) {
            throw new \RuntimeException('Announcement not found');
        }

        $payload = $this->sanitize($data, false);
        if ($payload === []) {
            throw new \RuntimeException('Nothing to update');
        }

        $this->model->update($announcementId, $payload);

        $this->recordAdminAction($adminUserId, 'announcement.update', 'announcement', $announcementId, $payload);

        return $this->model->find($announcementId) ?? [];
    }

    public function delete(int $announcementId, int $adminUserId): void
    {
        $announcement = $this->model->find($announcementId);
        if (!$announcement) {
            throw new \RuntimeException('Announcement not found');
        }

        $this->db->table('platform_announcement_dismissals')->where('announcement_id', $announcementId)->delete();
        $this->model->delete($announcementId);

        $this->recordAdminAction($adminUserId, 'announcement.delete', 'announcement', $announcementId, [
            'title' => $announcement['title'],
        ]);
    }

    /**
     * Resend an existing announcement to its audience.
     */
    public function resend(int $announcementId, int $adminUserId): array
    {
        $announcement = $this->model->find($announcementId);
        if (!$announcement) {
            throw new \RuntimeException('Announcement not found');
        }

        $delivery = $this->broadcast($announcement);

        $this->recordAdminAction($adminUserId, 'announcement.resend', 'announcement', $announcementId, $delivery);

        return $delivery;
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function sanitize(array $data, bool $requireCore): array
    {
        $payload = [];

        foreach (['title', 'message'] as $key) {
            if (array_key_exists($key, $data)) {
                $payload[$key] = trim((string) $data[$key]);
            }
        }

        if (array_key_exists('level', $data)) {
            $payload['level'] = in_array($data['level'], ['info', 'success', 'warning', 'critical'], true)
                ? $data['level']
                : 'info';
        }

        if (array_key_exists('audience', $data)) {
            $payload['audience'] = in_array($data['audience'], ['all', 'plan', 'organization'], true)
                ? $data['audience']
                : 'all';
        }

        $audience = $payload['audience'] ?? null;
        $payload['plan_id'] = $audience === 'plan' ? (int) ($data['plan_id'] ?? 0) ?: null : null;
        $payload['organization_id'] = $audience === 'organization' ? (int) ($data['organization_id'] ?? 0) ?: null : null;

        if ($audience === 'plan' && !$payload['plan_id']) {
            throw new \RuntimeException('Select a plan for a plan-targeted announcement');
        }
        if ($audience === 'organization' && !$payload['organization_id']) {
            throw new \RuntimeException('Select an organization for an org-targeted announcement');
        }
        if ($audience === null) {
            unset($payload['plan_id'], $payload['organization_id']);
        }

        foreach (['is_active', 'is_dismissible', 'send_email'] as $key) {
            if (array_key_exists($key, $data)) {
                $payload[$key] = !empty($data[$key]) && $data[$key] !== 'false' ? 1 : 0;
            }
        }

        foreach (['starts_at', 'ends_at'] as $key) {
            if (array_key_exists($key, $data)) {
                $payload[$key] = $data[$key] ? date('Y-m-d H:i:s', strtotime((string) $data[$key])) : null;
            }
        }

        if ($requireCore) {
            if (empty($payload['title']) || empty($payload['message'])) {
                throw new \RuntimeException('Title and message are required');
            }
            $payload['level'] ??= 'info';
            $payload['audience'] ??= 'all';
            $payload['is_active'] ??= 1;
            $payload['is_dismissible'] ??= 1;
        }

        return $payload;
    }

    /**
     * @return array{notified:int, emailed:int}
     */
    private function broadcast(?array $announcement): array
    {
        if (!$announcement) {
            return ['notified' => 0, 'emailed' => 0];
        }

        $recipients = $this->resolveRecipients($announcement);
        $notificationService = new NotificationService();
        $notified = 0;

        foreach ($recipients as $recipient) {
            $created = $notificationService->create(
                (int) $recipient['id'],
                $this->notificationType($announcement['level'] ?? 'info'),
                $announcement['title'],
                $announcement['message'],
                ['type' => 'platform_announcement', 'announcement_id' => (int) $announcement['id']]
            );
            if ($created) {
                $notified++;
            }
        }

        $emailed = 0;
        if (!empty($announcement['send_email'])) {
            $emailService = new EmailService();
            $body = '<p>' . nl2br(esc($announcement['message'])) . '</p>';
            foreach ($recipients as $recipient) {
                if ($emailService->sendSimpleEmail($recipient['email'], $announcement['title'], $body)) {
                    $emailed++;
                }
            }

            $this->model->update((int) $announcement['id'], [
                'emailed_at' => date('Y-m-d H:i:s'),
                'email_recipients' => $emailed,
            ]);
        }

        return ['notified' => $notified, 'emailed' => $emailed];
    }

    private function notificationType(string $level): string
    {
        return match ($level) {
            'success' => 'success',
            'warning' => 'warning',
            'critical' => 'error',
            default => 'info',
        };
    }

    /**
     * @return list<array{id:int, email:string}>
     */
    private function resolveRecipients(array $announcement): array
    {
        $builder = $this->db->table('users u')
            ->select('DISTINCT u.id, u.email', false)
            ->join('organization_members om', 'om.user_id = u.id')
            ->where('u.deleted_at IS NULL', null, false)
            ->where('u.is_active', 1);

        if (($announcement['audience'] ?? 'all') === 'organization' && !empty($announcement['organization_id'])) {
            $builder->where('om.organization_id', (int) $announcement['organization_id']);
        } elseif (($announcement['audience'] ?? 'all') === 'plan' && !empty($announcement['plan_id'])) {
            $builder->join(
                'organization_subscriptions os',
                "os.organization_id = om.organization_id AND os.status IN ('trial', 'active', 'past_due')"
            )->where('os.plan_id', (int) $announcement['plan_id']);
        }

        return $builder->get()->getResultArray();
    }

    /**
     * Live announcements for the signed-in user (consumed by the app banner).
     */
    public function activeForUser(int $userId, ?int $organizationId): array
    {
        $planId = null;
        if ($organizationId) {
            $row = $this->db->table('organization_subscriptions')
                ->select('plan_id')
                ->where('organization_id', $organizationId)
                ->whereIn('status', ['trial', 'active', 'past_due'])
                ->get()
                ->getRowArray();
            $planId = $row ? (int) $row['plan_id'] : null;
        }

        return array_map(static fn (array $row) => [
            'id' => (int) $row['id'],
            'title' => $row['title'],
            'message' => $row['message'],
            'level' => $row['level'],
            'is_dismissible' => (bool) $row['is_dismissible'],
            'starts_at' => $row['starts_at'],
            'ends_at' => $row['ends_at'],
        ], $this->model->activeForUser($userId, $organizationId, $planId));
    }

    public function dismissForUser(int $announcementId, int $userId): void
    {
        $exists = $this->db->table('platform_announcement_dismissals')
            ->where('announcement_id', $announcementId)
            ->where('user_id', $userId)
            ->countAllResults();

        if ($exists === 0) {
            $this->db->table('platform_announcement_dismissals')->insert([
                'announcement_id' => $announcementId,
                'user_id' => $userId,
                'created_at' => date('Y-m-d H:i:s'),
            ]);
        }
    }
}
