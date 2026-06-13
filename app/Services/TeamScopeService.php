<?php

namespace App\Services;

class TeamScopeService
{
    protected $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    /**
     * Owner, admin, and manager can see all organization members.
     */
    public function isOrgWideViewer(int $viewerId, int $orgId): bool
    {
        $member = $this->getMembership($viewerId, $orgId);
        if (!$member) {
            return false;
        }

        return in_array($member['role'] ?? '', ['owner', 'admin', 'manager'], true);
    }

    /**
     * Resolve which user IDs the viewer may access within an organization.
     */
    public function getVisibleUserIds(int $viewerId, int $orgId): array
    {
        if ($orgId <= 0 || $viewerId <= 0) {
            return [$viewerId];
        }

        if ($this->isOrgWideViewer($viewerId, $orgId)) {
            return $this->getAllOrgUserIds($orgId);
        }

        $ledTeams = $this->db->table('teams')
            ->select('id')
            ->where('organization_id', $orgId)
            ->where('lead_user_id', $viewerId)
            ->get()
            ->getResultArray();

        if (!empty($ledTeams)) {
            $teamIds = array_map('intval', array_column($ledTeams, 'id'));
            $rows = $this->db->table('team_members')
                ->select('user_id')
                ->whereIn('team_id', $teamIds)
                ->get()
                ->getResultArray();

            $userIds = array_map('intval', array_column($rows, 'user_id'));
            $userIds[] = $viewerId;

            return array_values(array_unique($userIds));
        }

        return [$viewerId];
    }

    public function canViewUser(int $viewerId, int $orgId, int $targetUserId): bool
    {
        return in_array($targetUserId, $this->getVisibleUserIds($viewerId, $orgId), true);
    }

    public function isTeamLead(int $userId, int $orgId): bool
    {
        if ($orgId <= 0 || $userId <= 0) {
            return false;
        }

        return $this->db->table('teams')
            ->where('organization_id', $orgId)
            ->where('lead_user_id', $userId)
            ->countAllResults() > 0;
    }

    private function getMembership(int $userId, int $orgId): ?array
    {
        $row = $this->db->table('organization_members')
            ->where('organization_id', $orgId)
            ->where('user_id', $userId)
            ->get()
            ->getRowArray();

        return $row ?: null;
    }

    /**
     * @return int[]
     */
    private function getAllOrgUserIds(int $orgId): array
    {
        $rows = $this->db->table('organization_members')
            ->select('user_id')
            ->where('organization_id', $orgId)
            ->get()
            ->getResultArray();

        return array_values(array_unique(array_map('intval', array_column($rows, 'user_id'))));
    }
}
