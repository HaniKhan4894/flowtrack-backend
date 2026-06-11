<?php

namespace App\Services;

use App\Models\OrganizationModel;
use App\Models\OrganizationMemberModel;
use App\Models\UserModel;

class OrganizationService
{
    protected $organizationModel;
    protected $memberModel;
    protected $invitationModel;
    protected $userModel;
    protected $emailService;
    protected $db;

    public function __construct()
    {
        $this->organizationModel = new OrganizationModel();
        $this->memberModel = new OrganizationMemberModel();
        $this->invitationModel = new \App\Models\InvitationModel();
        $this->userModel = new UserModel();
        $this->emailService = new EmailService();
        $this->db = \Config\Database::connect();
    }

    private function notifyInvitation(
        int $organizationId,
        string $email,
        string $role,
        string $token,
        ?int $inviterUserId = null
    ): void {
        $organization = $this->organizationModel->find($organizationId);
        $organizationName = $organization['name'] ?? 'your team';

        $inviterName = null;
        if ($inviterUserId) {
            $inviter = $this->userModel->find($inviterUserId);
            if ($inviter) {
                $inviterName = trim(($inviter['first_name'] ?? '') . ' ' . ($inviter['last_name'] ?? ''));
            }
        }

        $this->emailService->sendTeamInvitationEmail(
            $email,
            $organizationName,
            $role,
            $token,
            $inviterName ?: null
        );
    }

    private function getRoleIdBySlug(string $slug): ?int
    {
        $role = $this->db->table('roles')->where('slug', $slug)->get()->getRowArray();
        return $role ? (int) $role['id'] : null;
    }

    public function getOrganizationById(int $id): ?array
    {
        return $this->organizationModel->find($id);
    }

    public function createOrganization(int $ownerId, array $data): array
    {
        $data['owner_id'] = $ownerId;

        $orgId = $this->organizationModel->insert($data);

        if (!$orgId) {
            $errors = $this->organizationModel->errors();
            $message = $errors ? implode(' ', array_values($errors)) : 'Unknown validation error';
            throw new \Exception('Failed to create organization: ' . $message);
        }

        $ownerRoleId = $this->getRoleIdBySlug('owner') ?? $this->getRoleIdBySlug('admin');
        $memberId = $this->memberModel->insert([
            'organization_id' => $orgId,
            'user_id' => $ownerId,
            'role' => 'owner',
            'role_id' => $ownerRoleId,
        ]);

        if (!$memberId) {
            $errors = $this->memberModel->errors();
            $message = $errors ? implode(' ', array_values($errors)) : 'Unknown validation error';
            throw new \Exception('Failed to add organization owner: ' . $message);
        }

        return $this->getOrganizationById($orgId);
    }

    public function updateOrganization(int $id, array $data): bool
    {
        unset($data['id'], $data['uuid'], $data['owner_id']);
        return $this->organizationModel->update($id, $data);
    }

    public function addMember(
        int $organizationId,
        ?int $userId,
        string $role = 'member',
        ?float $hourlyRate = null,
        ?string $email = null,
        ?int $inviterUserId = null
    ): array
    {
        // Case 1: Add existing user by ID or Email
        if (!$userId && $email) {
            $user = $this->userModel->where('email', $email)->first();
            if ($user) {
                $userId = $user['id'];
            }
        }

        if ($userId) {
            // Check if already member
            $existing = $this->memberModel
                ->where('organization_id', $organizationId)
                ->where('user_id', $userId)
                ->first();

            if ($existing) {
                throw new \Exception('User is already a member');
            }

            $roleId = $this->getRoleIdBySlug($role) ?? $this->getRoleIdBySlug('member');
            $memberId = $this->memberModel->insert([
                'organization_id' => $organizationId,
                'user_id' => $userId,
                'role' => $role,
                'role_id' => $roleId,
                'hourly_rate' => $hourlyRate
            ]);

            return $this->memberModel->find($memberId);
        }

        // Case 2: Invite new user by Email
        if ($email) {
            // Check if already invited
            $existingInvite = $this->invitationModel
                ->where('organization_id', $organizationId)
                ->where('email', $email)
                ->first();

            if ($existingInvite) {
                // Update expiry
                $token = bin2hex(random_bytes(32));
                $this->invitationModel->update($existingInvite['id'], [
                    'token' => $token,
                    'role' => $role,
                    'expires_at' => date('Y-m-d H:i:s', strtotime('+7 days'))
                ]);

                $this->notifyInvitation($organizationId, $email, $role, $token, $inviterUserId);

                return array_merge($existingInvite, ['token' => $token, 'status' => 're-invited']);
            }

            // Create new invitation
            $token = bin2hex(random_bytes(32));
            $invitationId = $this->invitationModel->insert([
                'organization_id' => $organizationId,
                'email' => $email,
                'role' => $role,
                'token' => $token,
                'expires_at' => date('Y-m-d H:i:s', strtotime('+7 days')),
                'created_at' => date('Y-m-d H:i:s')
            ]);

            $invitation = $this->invitationModel->find($invitationId);
            $this->notifyInvitation($organizationId, $email, $role, $token, $inviterUserId);

            return $invitation;
        }

        throw new \Exception('User ID or Email is required');
    }

    public function removeMember(int $organizationId, int $userId): bool
    {
        return $this->memberModel
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->delete();
    }

    public function getMembers(int $organizationId, array $filters = []): array
    {
        $builder = $this->memberModel->builder();
        $builder->select('organization_members.*, users.email, users.first_name, users.last_name')
            ->join('users', 'users.id = organization_members.user_id')
            ->where('organization_members.organization_id', $organizationId);

        if (isset($filters['role'])) {
            $builder->where('organization_members.role', $filters['role']);
        }

        $page = $filters['page'] ?? 1;
        $perPage = $filters['per_page'] ?? 20;
        $offset = ($page - 1) * $perPage;

        $total = $builder->countAllResults(false);
        $members = $builder->limit($perPage, $offset)->get()->getResultArray();

        return [
            'data' => $members,
            'pagination' => [
                'current_page' => (int)$page,
                'per_page' => (int)$perPage,
                'total' => $total,
                'total_pages' => ceil($total / $perPage)
            ]
        ];
    }
}
