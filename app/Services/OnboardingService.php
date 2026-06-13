<?php

namespace App\Services;

use App\Models\OrganizationMemberModel;
use App\Models\UserModel;

class OnboardingService
{
    public const STEPS = [
        'avatar' => 'Upload your profile photo',
        'project' => 'Create or join a project',
        'timer' => 'Start your first timer',
        'activity' => 'Sync desktop activity',
    ];

    protected OrganizationMemberModel $memberModel;
    protected UserModel $userModel;
    protected $db;

    public function __construct()
    {
        $this->memberModel = new OrganizationMemberModel();
        $this->userModel = new UserModel();
        $this->db = \Config\Database::connect();
    }

    public function getProgress(int $userId, int $organizationId): array
    {
        $detected = $this->detectSteps($userId, $organizationId);
        $stored = $this->getStoredState($userId, $organizationId);

        $steps = [];
        $completedCount = 0;

        foreach (self::STEPS as $key => $label) {
            $completed = !empty($detected[$key]) || !empty($stored['completed'][$key]);
            if ($completed) {
                $completedCount++;
            }

            $steps[] = [
                'key' => $key,
                'label' => $label,
                'completed' => $completed,
            ];
        }

        $total = count(self::STEPS);
        $percent = $total > 0 ? (int) round(($completedCount / $total) * 100) : 0;

        $state = [
            'completed' => array_merge($stored['completed'] ?? [], $detected),
            'percent' => $percent,
            'updated_at' => date('Y-m-d H:i:s'),
        ];

        $this->persistState($userId, $organizationId, $state);

        return [
            'steps' => $steps,
            'completed_count' => $completedCount,
            'total_steps' => $total,
            'percent' => $percent,
            'is_complete' => $completedCount >= $total,
        ];
    }

    /**
     * Auto-detect onboarding step completion from user activity.
     *
     * @return array<string, bool>
     */
    public function detectSteps(int $userId, int $organizationId): array
    {
        $user = $this->userModel->find($userId);

        $hasAvatar = !empty($user['avatar_url']);

        $hasProject = $this->db->table('time_entries')
            ->where('user_id', $userId)
            ->where('organization_id', $organizationId)
            ->where('project_id IS NOT NULL', null, false)
            ->countAllResults() > 0
            || $this->db->table('projects')
                ->where('organization_id', $organizationId)
                ->countAllResults() > 0;

        $hasTimer = $this->db->table('time_entries')
            ->where('user_id', $userId)
            ->where('organization_id', $organizationId)
            ->countAllResults() > 0;

        $hasActivity = $this->db->table('activity_logs')
            ->join('time_entries', 'time_entries.id = activity_logs.time_entry_id')
            ->where('activity_logs.user_id', $userId)
            ->where('time_entries.organization_id', $organizationId)
            ->countAllResults() > 0;

        return [
            'avatar' => $hasAvatar,
            'project' => $hasProject,
            'timer' => $hasTimer,
            'activity' => $hasActivity,
        ];
    }

    private function getStoredState(int $userId, int $organizationId): array
    {
        $member = $this->memberModel
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->first();

        if (!$member || empty($member['onboarding_state'])) {
            return [];
        }

        $decoded = is_string($member['onboarding_state'])
            ? json_decode($member['onboarding_state'], true)
            : $member['onboarding_state'];

        return is_array($decoded) ? $decoded : [];
    }

    private function persistState(int $userId, int $organizationId, array $state): void
    {
        $this->memberModel
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->set(['onboarding_state' => json_encode($state)])
            ->update();
    }
}
