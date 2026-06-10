<?php

namespace App\Services;

use App\Models\OrganizationMemberModel;

class MemberMonitoringService
{
    protected OrganizationMemberModel $memberModel;

    public function __construct()
    {
        $this->memberModel = new OrganizationMemberModel();
    }

    public function getMemberRecord(int $organizationId, int $userId): ?array
    {
        return $this->memberModel
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->first();
    }

    public function getSettings(int $organizationId, int $userId): array
    {
        $member = $this->getMemberRecord($organizationId, $userId);
        if (!$member) {
            throw new \Exception('Member not found');
        }

        return $this->normalizeSettings($member);
    }

    public function updateSettings(int $organizationId, int $userId, array $data): array
    {
        $member = $this->getMemberRecord($organizationId, $userId);
        if (!$member) {
            throw new \Exception('Member not found');
        }

        $payload = [];
        if (array_key_exists('tracking_enabled', $data)) {
            $payload['tracking_enabled'] = (bool) $data['tracking_enabled'];
        }
        if (array_key_exists('screenshots_enabled', $data)) {
            $payload['screenshots_enabled'] = (bool) $data['screenshots_enabled'];
        }
        if (array_key_exists('screenshot_disabled_until', $data)) {
            $payload['screenshot_disabled_until'] = $data['screenshot_disabled_until'] ?: null;
        }
        if (array_key_exists('screenshot_disabled_from', $data)) {
            $payload['screenshot_disabled_from'] = $data['screenshot_disabled_from'] ?: null;
        }
        if (array_key_exists('screenshot_disabled_to', $data)) {
            $payload['screenshot_disabled_to'] = $data['screenshot_disabled_to'] ?: null;
        }

        if (!empty($payload)) {
            $this->memberModel->update($member['id'], $payload);
        }

        return $this->getSettings($organizationId, $userId);
    }

    public function canTrackTime(int $organizationId, int $userId): bool
    {
        $member = $this->getMemberRecord($organizationId, $userId);
        if (!$member) {
            return false;
        }

        return (bool) ($member['tracking_enabled'] ?? true);
    }

    public function canCaptureScreenshots(int $organizationId, int $userId): bool
    {
        $member = $this->getMemberRecord($organizationId, $userId);
        if (!$member) {
            return false;
        }

        if (!($member['screenshots_enabled'] ?? true)) {
            return false;
        }

        $now = time();

        if (!empty($member['screenshot_disabled_until'])) {
            if ($now < strtotime($member['screenshot_disabled_until'])) {
                return false;
            }
        }

        if (!empty($member['screenshot_disabled_from']) && !empty($member['screenshot_disabled_to'])) {
            $from = strtotime($member['screenshot_disabled_from']);
            $to = strtotime($member['screenshot_disabled_to']);
            if ($from && $to && $now >= $from && $now <= $to) {
                return false;
            }
        }

        return true;
    }

    private function normalizeSettings(array $member): array
    {
        return [
            'tracking_enabled' => (bool) ($member['tracking_enabled'] ?? true),
            'screenshots_enabled' => (bool) ($member['screenshots_enabled'] ?? true),
            'screenshot_disabled_until' => $member['screenshot_disabled_until'] ?? null,
            'screenshot_disabled_from' => $member['screenshot_disabled_from'] ?? null,
            'screenshot_disabled_to' => $member['screenshot_disabled_to'] ?? null,
            'screenshots_active' => $this->canCaptureScreenshots((int) $member['organization_id'], (int) $member['user_id']),
        ];
    }
}
