<?php

namespace App\Services;

use App\Models\OrganizationModel;
use App\Models\OrganizationMemberModel;
use App\Models\UserModel;
use App\Models\PlanModel;
use App\Models\SubscriptionModel;
use App\Services\LocationService;

class OrganizationService
{
    protected $organizationModel;
    protected $memberModel;
    protected $invitationModel;
    protected $userModel;
    protected $emailService;
    protected $locationService;
    protected $db;

    public function __construct()
    {
        $this->organizationModel = new OrganizationModel();
        $this->memberModel = new OrganizationMemberModel();
        $this->invitationModel = new \App\Models\InvitationModel();
        $this->userModel = new UserModel();
        $this->emailService = new EmailService();
        $this->locationService = new LocationService();
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
        $org = $this->organizationModel->find($id);
        if (!$org) {
            return null;
        }

        return $this->enrichOrganization($org);
    }

    private function enrichOrganization(array $org): array
    {
        if (!empty($org['country_id'])) {
            $country = $this->db->table('countries')->select('id, name')->where('id', $org['country_id'])->get()->getRowArray();
            $org['country'] = $country;
        }
        if (!empty($org['state_id'])) {
            $state = $this->db->table('states')->select('id, name')->where('id', $org['state_id'])->get()->getRowArray();
            $org['state'] = $state;
        }
        if (!empty($org['city_id'])) {
            $city = $this->db->table('cities')->select('id, name')->where('id', $org['city_id'])->get()->getRowArray();
            $org['city'] = $city;
        }
        if (!empty($org['timezone_id'])) {
            $tz = $this->locationService->getTimezoneById((int) $org['timezone_id']);
            $org['timezone'] = $tz ? [
                'id' => (int) $tz['id'],
                'timezone' => $tz['timezone'],
                'php_timezone' => $tz['php_timezone'],
                'zone_group' => $tz['zone_group'],
            ] : null;
        }

        return $org;
    }

    private function resolveTimezoneFields(array $data): array
    {
        if (!empty($data['timezone_id'])) {
            $tz = $this->locationService->getTimezoneById((int) $data['timezone_id']);
            if (!$tz) {
                throw new \Exception('Invalid timezone selected');
            }
            $data['php_timezone'] = $tz['php_timezone'];
        } elseif (empty($data['php_timezone'])) {
            $data['php_timezone'] = 'UTC';
        }

        return $data;
    }

    private function assignFreePlan(int $organizationId): void
    {
        $planModel = new PlanModel();
        $subscriptionModel = new SubscriptionModel();
        $freePlan = $planModel->getPlanBySlug('free');
        if (!$freePlan) {
            return;
        }

        $existing = $subscriptionModel->getActiveSubscription($organizationId);
        if ($existing) {
            return;
        }

        $subscriptionModel->insert([
            'organization_id' => $organizationId,
            'plan_id' => $freePlan['id'],
            'user_count' => 1,
            'amount' => 0,
            'billing_cycle' => 'monthly',
            'status' => 'active',
            'current_period_start' => date('Y-m-d H:i:s'),
            'current_period_end' => date('Y-m-d H:i:s', strtotime('+10 years')),
        ]);
    }

    private function checkUserLimit(int $organizationId): void
    {
        $subscriptionModel = new SubscriptionModel();
        $subscription = $subscriptionModel->getActiveSubscription($organizationId);
        if (!$subscription || empty($subscription['plan_id'])) {
            return;
        }

        $planModel = new PlanModel();
        $maxUsers = $planModel->getFeatureValue((int) $subscription['plan_id'], 'max_users');
        if ($maxUsers === null || $maxUsers === '' || $maxUsers === 'unlimited') {
            return;
        }

        $current = $this->memberModel->where('organization_id', $organizationId)->countAllResults();
        $pendingInvites = $this->invitationModel->where('organization_id', $organizationId)->countAllResults();

        if (($current + $pendingInvites) >= (int) $maxUsers) {
            throw new \Exception('User limit reached for your plan. Please upgrade to add more members.');
        }
    }

    public function createOrganization(int $ownerId, array $data): array
    {
        $data['owner_id'] = $ownerId;
        $data = $this->resolveTimezoneFields($data);

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

        $this->assignFreePlan((int) $orgId);

        return $this->getOrganizationById((int) $orgId);
    }

    public function updateOrganization(int $id, array $data): bool
    {
        unset($data['id'], $data['uuid'], $data['owner_id']);

        if (isset($data['timezone_id']) || isset($data['php_timezone'])) {
            $data = $this->resolveTimezoneFields($data);
        }

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
        $this->checkUserLimit($organizationId);

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
