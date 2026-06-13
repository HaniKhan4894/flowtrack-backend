<?php

namespace App\Services;

use App\Models\TeamModel;
use App\Models\TeamMemberModel;
use App\Models\OrganizationMemberModel;

class TeamService
{
    protected TeamModel $teamModel;
    protected TeamMemberModel $teamMemberModel;
    protected OrganizationMemberModel $memberModel;
    protected $db;

    public function __construct()
    {
        $this->teamModel = new TeamModel();
        $this->teamMemberModel = new TeamMemberModel();
        $this->memberModel = new OrganizationMemberModel();
        $this->db = \Config\Database::connect();
    }

    public function getTeams(int $organizationId): array
    {
        $teams = $this->teamModel
            ->where('organization_id', $organizationId)
            ->orderBy('name', 'ASC')
            ->findAll();

        return array_map(fn (array $team) => $this->enrichTeam($team), $teams);
    }

    public function getTeamById(int $organizationId, int $teamId): ?array
    {
        $team = $this->teamModel
            ->where('organization_id', $organizationId)
            ->find($teamId);

        return $team ? $this->enrichTeam($team) : null;
    }

    public function createTeam(int $organizationId, array $data): array
    {
        $name = trim((string) ($data['name'] ?? ''));
        if ($name === '') {
            throw new \Exception('Team name is required');
        }

        $leadUserId = isset($data['lead_user_id']) ? (int) $data['lead_user_id'] : null;
        if ($leadUserId) {
            $this->assertOrgMember($organizationId, $leadUserId);
        }

        $teamId = $this->teamModel->insert([
            'organization_id' => $organizationId,
            'name' => $name,
            'lead_user_id' => $leadUserId ?: null,
        ]);

        if (!$teamId) {
            throw new \Exception('Failed to create team');
        }

        $memberIds = $data['member_ids'] ?? [];
        if (is_array($memberIds) && !empty($memberIds)) {
            try {
                $this->assignMembers($organizationId, (int) $teamId, $memberIds);
            } catch (\Exception $e) {
                $this->teamMemberModel->where('team_id', $teamId)->delete();
                $this->teamModel->delete($teamId);
                throw $e;
            }
        }

        return $this->getTeamById($organizationId, (int) $teamId);
    }

    public function updateTeam(int $organizationId, int $teamId, array $data): array
    {
        $team = $this->getTeamById($organizationId, $teamId);
        if (!$team) {
            throw new \Exception('Team not found');
        }

        $update = [];
        if (array_key_exists('name', $data)) {
            $name = trim((string) $data['name']);
            if ($name === '') {
                throw new \Exception('Team name cannot be empty');
            }
            $update['name'] = $name;
        }

        if (array_key_exists('lead_user_id', $data)) {
            $leadUserId = $data['lead_user_id'] !== null && $data['lead_user_id'] !== ''
                ? (int) $data['lead_user_id']
                : null;
            if ($leadUserId) {
                $this->assertOrgMember($organizationId, $leadUserId);
            }
            $update['lead_user_id'] = $leadUserId;
        }

        if (!empty($update)) {
            $this->teamModel->update($teamId, $update);
        }

        return $this->getTeamById($organizationId, $teamId);
    }

    public function deleteTeam(int $organizationId, int $teamId): bool
    {
        $team = $this->getTeamById($organizationId, $teamId);
        if (!$team) {
            throw new \Exception('Team not found');
        }

        $this->db->transStart();

        $this->teamMemberModel->where('team_id', $teamId)->delete();
        $this->db->table('organization_members')
            ->where('organization_id', $organizationId)
            ->where('team_id', $teamId)
            ->update(['team_id' => null]);
        $this->teamModel->delete($teamId);

        $this->db->transComplete();

        return $this->db->transStatus();
    }

    /**
     * @param int[] $userIds
     */
    public function assignMembers(int $organizationId, int $teamId, array $userIds): array
    {
        $team = $this->getTeamById($organizationId, $teamId);
        if (!$team) {
            throw new \Exception('Team not found');
        }

        $userIds = array_values(array_unique(array_filter(array_map('intval', $userIds))));
        foreach ($userIds as $userId) {
            $this->assertOrgMember($organizationId, $userId);
        }

        $this->db->transStart();

        foreach ($userIds as $userId) {
            $existing = $this->teamMemberModel
                ->where('team_id', $teamId)
                ->where('user_id', $userId)
                ->first();

            if (!$existing) {
                $inserted = $this->teamMemberModel->insert([
                    'team_id' => $teamId,
                    'user_id' => $userId,
                ]);
                if (!$inserted) {
                    throw new \Exception('Failed to add user to team: ' . json_encode($this->teamMemberModel->errors()));
                }
            }

            $updated = $this->db->table('organization_members')
                ->where('organization_id', $organizationId)
                ->where('user_id', $userId)
                ->update(['team_id' => $teamId]);

            if ($updated === false) {
                throw new \Exception('Failed to update organization member team assignment');
            }
        }

        $this->db->transComplete();

        if ($this->db->transStatus() === false) {
            throw new \Exception('Failed to assign team members');
        }

        return $this->getTeamById($organizationId, $teamId);
    }

    public function removeMember(int $organizationId, int $teamId, int $userId): array
    {
        $team = $this->getTeamById($organizationId, $teamId);
        if (!$team) {
            throw new \Exception('Team not found');
        }

        $this->teamMemberModel
            ->where('team_id', $teamId)
            ->where('user_id', $userId)
            ->delete();

        $this->db->table('organization_members')
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->where('team_id', $teamId)
            ->update(['team_id' => null]);

        return $this->getTeamById($organizationId, $teamId);
    }

    public function setLead(int $organizationId, int $teamId, ?int $leadUserId): array
    {
        $team = $this->getTeamById($organizationId, $teamId);
        if (!$team) {
            throw new \Exception('Team not found');
        }

        if ($leadUserId) {
            $this->assertOrgMember($organizationId, $leadUserId);
        }

        $this->teamModel->update($teamId, [
            'lead_user_id' => $leadUserId ?: null,
        ]);

        return $this->getTeamById($organizationId, $teamId);
    }

    private function enrichTeam(array $team): array
    {
        $teamId = (int) $team['id'];
        $members = $this->teamMemberModel->builder()
            ->select('team_members.user_id, users.first_name, users.last_name, users.email')
            ->join('users', 'users.id = team_members.user_id')
            ->where('team_members.team_id', $teamId)
            ->orderBy('users.first_name', 'ASC')
            ->get()
            ->getResultArray();

        $lead = null;
        if (!empty($team['lead_user_id'])) {
            $leadRow = $this->db->table('users')
                ->select('id, first_name, last_name, email')
                ->where('id', (int) $team['lead_user_id'])
                ->get()
                ->getRowArray();
            $lead = $leadRow ?: null;
        }

        $team['members'] = $members;
        $team['member_count'] = count($members);
        $team['lead'] = $lead;

        return $team;
    }

    private function assertOrgMember(int $organizationId, int $userId): void
    {
        $member = $this->memberModel
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->first();

        if (!$member) {
            throw new \Exception('User is not a member of this organization');
        }
    }
}
