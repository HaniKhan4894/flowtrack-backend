<?php

namespace App\Models;

use CodeIgniter\Model;

class PlatformAnnouncementModel extends Model
{
    protected $table            = 'platform_announcements';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'title', 'message', 'level', 'audience', 'plan_id', 'organization_id',
        'is_active', 'is_dismissible', 'send_email', 'emailed_at', 'email_recipients',
        'starts_at', 'ends_at', 'created_by',
    ];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    protected $validationRules = [
        'title' => 'required|max_length[191]',
        'message' => 'required',
    ];

    /**
     * Announcements currently live for a given org/plan, excluding ones the
     * user already dismissed.
     */
    public function activeForUser(int $userId, ?int $organizationId, ?int $planId): array
    {
        $now = date('Y-m-d H:i:s');

        $builder = $this->builder()
            ->select('platform_announcements.*')
            ->where('platform_announcements.is_active', 1)
            ->groupStart()
                ->where('platform_announcements.starts_at IS NULL')
                ->orWhere('platform_announcements.starts_at <=', $now)
            ->groupEnd()
            ->groupStart()
                ->where('platform_announcements.ends_at IS NULL')
                ->orWhere('platform_announcements.ends_at >=', $now)
            ->groupEnd()
            ->groupStart()
                ->where('platform_announcements.audience', 'all')
                ->orGroupStart()
                    ->where('platform_announcements.audience', 'plan')
                    ->where('platform_announcements.plan_id', $planId)
                ->groupEnd()
                ->orGroupStart()
                    ->where('platform_announcements.audience', 'organization')
                    ->where('platform_announcements.organization_id', $organizationId)
                ->groupEnd()
            ->groupEnd()
            ->where(
                'platform_announcements.id NOT IN (SELECT announcement_id FROM platform_announcement_dismissals WHERE user_id = ' . $userId . ')',
                null,
                false
            )
            ->orderBy('platform_announcements.created_at', 'DESC');

        return $builder->get()->getResultArray();
    }
}
