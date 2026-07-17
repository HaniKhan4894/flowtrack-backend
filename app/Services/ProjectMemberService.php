<?php

namespace App\Services;

use App\Models\OrganizationMemberModel;
use App\Models\ProjectMemberModel;
use App\Models\ProjectModel;

class ProjectMemberService
{
    protected ProjectMemberModel $memberModel;
    protected ProjectModel $projectModel;
    protected OrganizationMemberModel $orgMemberModel;
    protected $db;

    public function __construct()
    {
        $this->memberModel = new ProjectMemberModel();
        $this->projectModel = new ProjectModel();
        $this->orgMemberModel = new OrganizationMemberModel();
        $this->db = \Config\Database::connect();
    }

    /**
     * Roles that can see / use every org project without explicit assignment.
     */
    public function canSeeAllProjects(int $organizationId, int $userId): bool
    {
        $member = $this->orgMemberModel
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->first();

        if (!$member) {
            return false;
        }

        $role = strtolower((string) ($member['role'] ?? 'member'));
        return in_array($role, ['owner', 'admin', 'manager'], true);
    }

    public function isAssigned(int $organizationId, int $userId, int $projectId): bool
    {
        if ($this->canSeeAllProjects($organizationId, $userId)) {
            return true;
        }

        return (bool) $this->memberModel
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->where('project_id', $projectId)
            ->first();
    }

    /**
     * @return int[]
     */
    public function getProjectIdsForUser(int $organizationId, int $userId): array
    {
        $rows = $this->memberModel
            ->select('project_id')
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->findAll();

        return array_values(array_map(static fn ($r) => (int) $r['project_id'], $rows));
    }

    /**
     * @return array<int, int[]> map user_id => project_ids
     */
    public function getProjectIdsByUsers(int $organizationId, array $userIds): array
    {
        $userIds = array_values(array_filter(array_map('intval', $userIds)));
        if ($userIds === []) {
            return [];
        }

        $rows = $this->memberModel
            ->select('user_id, project_id')
            ->where('organization_id', $organizationId)
            ->whereIn('user_id', $userIds)
            ->findAll();

        $map = [];
        foreach ($userIds as $uid) {
            $map[$uid] = [];
        }
        foreach ($rows as $row) {
            $uid = (int) $row['user_id'];
            $map[$uid][] = (int) $row['project_id'];
        }

        return $map;
    }

    /**
     * Replace a user's project assignments with the given list.
     *
     * @param int[] $projectIds
     * @return int[] assigned project ids
     */
    public function syncUserProjects(
        int $organizationId,
        int $userId,
        array $projectIds,
        ?int $assignedBy = null
    ): array {
        $projectIds = $this->normalizeOrgProjectIds($organizationId, $projectIds);

        $existing = $this->memberModel
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->findAll();

        $existingIds = array_map(static fn ($r) => (int) $r['project_id'], $existing);
        $toRemove = array_diff($existingIds, $projectIds);
        $toAdd = array_diff($projectIds, $existingIds);

        if ($toRemove !== []) {
            $this->memberModel
                ->where('organization_id', $organizationId)
                ->where('user_id', $userId)
                ->whereIn('project_id', $toRemove)
                ->delete();
        }

        foreach ($toAdd as $projectId) {
            $this->memberModel->insert([
                'organization_id' => $organizationId,
                'project_id'      => $projectId,
                'user_id'         => $userId,
                'assigned_by'     => $assignedBy,
            ]);
        }

        return $projectIds;
    }

    /**
     * Add projects without removing existing ones (used on invite).
     *
     * @param int[] $projectIds
     * @return int[]
     */
    public function assignUserProjects(
        int $organizationId,
        int $userId,
        array $projectIds,
        ?int $assignedBy = null
    ): array {
        $projectIds = $this->normalizeOrgProjectIds($organizationId, $projectIds);
        if ($projectIds === []) {
            return $this->getProjectIdsForUser($organizationId, $userId);
        }

        $existing = $this->getProjectIdsForUser($organizationId, $userId);
        $toAdd = array_diff($projectIds, $existing);

        foreach ($toAdd as $projectId) {
            $this->memberModel->insert([
                'organization_id' => $organizationId,
                'project_id'      => $projectId,
                'user_id'         => $userId,
                'assigned_by'     => $assignedBy,
            ]);
        }

        return $this->getProjectIdsForUser($organizationId, $userId);
    }

    /**
     * @return array{project_id:int, user_id:int, first_name:?string, last_name:?string, email:?string}[]
     */
    public function listMembersForProject(int $organizationId, int $projectId): array
    {
        $project = $this->projectModel->find($projectId);
        if (!$project || (int) $project['organization_id'] !== $organizationId) {
            throw new \InvalidArgumentException('Project not found');
        }

        return $this->db->table('project_members pm')
            ->select('pm.project_id, pm.user_id, users.first_name, users.last_name, users.email')
            ->join('users', 'users.id = pm.user_id')
            ->where('pm.organization_id', $organizationId)
            ->where('pm.project_id', $projectId)
            ->orderBy('users.first_name', 'ASC')
            ->get()
            ->getResultArray();
    }

    /**
     * @param int[] $projectIds
     * @return int[]
     */
    private function normalizeOrgProjectIds(int $organizationId, array $projectIds): array
    {
        $projectIds = array_values(array_unique(array_filter(array_map('intval', $projectIds))));
        if ($projectIds === []) {
            return [];
        }

        $valid = $this->projectModel
            ->select('id')
            ->where('organization_id', $organizationId)
            ->whereIn('id', $projectIds)
            ->findAll();

        return array_values(array_map(static fn ($r) => (int) $r['id'], $valid));
    }
}
