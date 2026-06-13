<?php

namespace App\Services;

use App\Models\UserModel;
use App\Libraries\JWTHandler;
use App\Services\EmailVerificationService;
use App\Models\SubscriptionModel;
use App\Models\PlanModel;
use App\Models\OrganizationModel;

class AuthService
{
    protected $userModel;
    protected $userService;
    protected $organizationService;
    protected $jwtHandler;
    protected $db;

    public function __construct()
    {
        $this->userModel = new UserModel();
        $this->userService = new UserService();
        $this->organizationService = new OrganizationService();
        $this->jwtHandler = new JWTHandler();
        $this->db = \Config\Database::connect();
    }

    /**
     * Register new user
     */
    public function register(array $data): array
    {
        $invitationToken = !empty($data['invitation_token']) ? trim((string) $data['invitation_token']) : null;

        // Check if email exists (including soft-deleted accounts)
        if ($this->userModel->withDeleted()->where('email', $data['email'])->first()) {
            throw new \Exception('Email already exists');
        }

        if (!$invitationToken) {
            $pendingInvite = $this->db->table('organization_invitations')
                ->where('email', $data['email'])
                ->where('expires_at >=', date('Y-m-d H:i:s'))
                ->get()
                ->getRowArray();

            if ($pendingInvite) {
                throw new \Exception('You have a pending team invitation. Please register using the invite link sent to your email.');
            }
        }

        $this->db->transStart();

        try {

            $data['first_name'] = trim((string) ($data['first_name'] ?? ''));
            $data['last_name'] = trim((string) ($data['last_name'] ?? ''));
            unset($data['invitation_token']);

            if ($invitationToken) {
                $invite = $this->db->table('organization_invitations')
                    ->where('token', $invitationToken)
                    ->where('expires_at >=', date('Y-m-d H:i:s'))
                    ->get()
                    ->getRowArray();

                if (!$invite) {
                    throw new \Exception('Invitation is invalid or expired');
                }

                if (strcasecmp((string) $invite['email'], (string) $data['email']) !== 0) {
                    throw new \Exception('This invitation was sent to a different email address');
                }

                // Invited users join as team members — never create their own organization
                $data['role'] = (string) ($invite['role'] ?? 'member');
                $user = $this->userService->createUser($data);

                $this->organizationService->addMember(
                    (int) $invite['organization_id'],
                    (int) $user['id'],
                    (string) $invite['role'],
                    null
                );
                $this->db->table('organization_invitations')->where('id', $invite['id'])->delete();
            } else {
                // Self-signup creates an organization owner/admin account
                $data['role'] = 'owner';
                $user = $this->userService->createUser($data);

                $orgName = trim(($data['first_name'] ?: 'User') . "'s Team");
                $this->organizationService->createOrganization($user['id'], [
                    'name' => $orgName,
                ]);
            }

            if ($this->db->transStatus() === false) {
                throw new \Exception('Registration failed. Please try again.');
            }

            $this->db->transComplete();

            $freshUser = $this->userModel->find($user['id']) ?? $user;

            if ($invitationToken) {
                $this->userModel->update($user['id'], [
                    'email_verified_at' => date('Y-m-d H:i:s'),
                ]);
                $freshUser = $this->userModel->find($user['id']) ?? $freshUser;
            } else {
                $verificationService = new EmailVerificationService();
                $verificationService->sendVerificationEmail($freshUser);
            }

            // Generate tokens
            $tokens = $this->generateTokens($freshUser);

            return [
                'user' => $this->buildAuthProfile((int) $freshUser['id']) ?? $this->sanitizeUser($freshUser),
                'tokens' => $tokens
            ];
        } catch (\Exception $e) {
            $this->db->transRollback();
            throw $e;
        }
    }

    /**
     * Login user
     */
    public function login(string $email, string $password): array
    {
        $user = $this->userModel->where('email', $email)->first();

        if (!$user) {
            throw new \Exception('Invalid credentials');
        }

        if (!password_verify($password, $user['password_hash'])) {
            throw new \Exception('Invalid credentials');
        }

        if (!$user['is_active']) {
            throw new \Exception('Account is inactive');
        }

        if (empty($user['email_verified_at'])) {
            throw new \Exception('Please verify your email before signing in. Check your inbox for the verification link.');
        }

        // Generate tokens
        $tokens = $this->generateTokens($user);

        return [
            'user' => $this->buildAuthProfile((int) $user['id']) ?? $this->sanitizeUser($user),
            'tokens' => $tokens
        ];
    }

    /**
     * Refresh access token using refresh token
     */
    public function refreshToken(string $refreshToken): array
    {
        $decoded = $this->jwtHandler->verifyToken($refreshToken);
        if (!$decoded || (($decoded->type ?? null) !== 'refresh')) {
            throw new \Exception('Invalid refresh token');
        }

        $userData = $this->jwtHandler->getUserFromToken($refreshToken);

        if (!$userData) {
            throw new \Exception('Invalid refresh token');
        }

        // Get fresh user data
        $user = $this->userModel->find($userData['user_id']);

        if (!$user || !$user['is_active']) {
            throw new \Exception('User not found or inactive');
        }

        // Get user's primary organization
        $orgMember = $this->db->table('organization_members')
            ->where('user_id', $user['id'])
            ->orderBy('joined_at', 'ASC')
            ->get()
            ->getRowArray();

        // Generate new access token
        $accessToken = $this->jwtHandler->generateAccessToken([
            'user_id' => $user['id'],
            'email' => $user['email'],
            'role' => $user['role'],
            'organization_id' => $orgMember ? (int) $orgMember['organization_id'] : null
        ]);

        return [
            'access_token' => $accessToken,
            'token_type' => 'Bearer',
            'expires_in' => 900,
            'organization_id' => $orgMember ? (int)$orgMember['organization_id'] : null,
        ];
    }

    /**
     * Get user from token
     */
    public function getUserFromToken(string $token): ?array
    {
        $userData = $this->jwtHandler->getUserFromToken($token);

        if (!$userData || !isset($userData['user_id'])) {
            return null;
        }

        $user = $this->userModel->find($userData['user_id']);

        return $user ? $this->sanitizeUser($user) : null;
    }

    /**
     * Generate JWT tokens
     */
    private function generateTokens(array $user): array
    {
        // Get user's primary organization
        $orgMember = $this->db->table('organization_members')
            ->where('user_id', $user['id'])
            ->orderBy('joined_at', 'ASC')
            ->get()
            ->getRowArray();

        $payload = [
            'user_id' => $user['id'],
            'email' => $user['email'],
            'role' => $user['role'],
            'organization_id' => $orgMember ? (int) $orgMember['organization_id'] : null
        ];

        $accessToken = $this->jwtHandler->generateAccessToken($payload, 900); // 15 minutes
        $refreshToken = $this->jwtHandler->generateRefreshToken(['user_id' => $user['id']], 2592000); // 30 days

        return [
            'access_token' => $accessToken,
            'refresh_token' => $refreshToken,
            'token_type' => 'Bearer',
            'expires_in' => 900,
            'organization_id' => $orgMember ? (int)$orgMember['organization_id'] : null,
        ];
    }

    /**
     * Remove sensitive data from user object
     */
    public function buildAuthProfile(int $userId): ?array
    {
        $user = $this->userModel->find($userId);
        if (!$user) {
            return null;
        }

        $user = $this->sanitizeUser($user);
        $organizationId = (int) ($user['organization_id'] ?? 0);

        $orgMember = null;
        if ($organizationId > 0) {
            $orgMember = $this->db->table('organization_members')
                ->where('organization_id', $organizationId)
                ->where('user_id', $userId)
                ->get()
                ->getRowArray();
        }

        if (!$orgMember) {
            $orgMember = $this->db->table('organization_members')
                ->where('user_id', $userId)
                ->orderBy('joined_at', 'ASC')
                ->get()
                ->getRowArray();
            if ($orgMember) {
                $user['organization_id'] = (int) $orgMember['organization_id'];
                $organizationId = (int) $orgMember['organization_id'];
            }
        }

        $orgRole = $orgMember['role'] ?? ($user['role'] ?? 'member');
        $permissionService = new PermissionService();
        $permissions = $organizationId > 0
            ? $permissionService->getUserPermissions($userId, $organizationId)
            : [];
        $permissionSlugs = array_values(array_unique(array_column($permissions, 'slug')));

        $monitoring = null;
        if ($organizationId > 0) {
            try {
                $monitoring = (new MemberMonitoringService())->getSettings($organizationId, $userId);
            } catch (\Exception $e) {
                $monitoring = null;
            }
        }

        $user['organization_role'] = $orgRole;
        $user['is_org_admin'] = in_array($orgRole, ['owner', 'admin', 'manager'], true)
            || in_array($user['role'] ?? '', ['owner', 'admin', 'manager'], true);
        $user['permissions'] = $permissionSlugs;
        $user['monitoring'] = $monitoring;
        $user['is_super_admin'] = !empty($user['is_super_admin']);

        if ($organizationId > 0) {
            $org = (new OrganizationModel())->find($organizationId);
            if ($org) {
                $user['organization'] = [
                    'id' => (int) $org['id'],
                    'name' => $org['name'],
                    'php_timezone' => $org['php_timezone'] ?? 'UTC',
                    'country_id' => $org['country_id'] ?? null,
                    'state_id' => $org['state_id'] ?? null,
                    'city_id' => $org['city_id'] ?? null,
                    'timezone_id' => $org['timezone_id'] ?? null,
                ];

                if (!empty($org['timezone_id'])) {
                    $tz = (new LocationService())->getTimezoneById((int) $org['timezone_id']);
                    if ($tz) {
                        $user['organization']['timezone'] = [
                            'id' => (int) $tz['id'],
                            'timezone' => $tz['timezone'],
                            'php_timezone' => $tz['php_timezone'],
                        ];
                    }
                }
            }

            $subscription = (new SubscriptionModel())->getActiveSubscription($organizationId);
            if ($subscription && !empty($subscription['plan'])) {
                $plan = $subscription['plan'];
                $features = $this->resolvePlanFeatures((int) $plan['id']);
                $user['plan'] = [
                    'id' => (int) $plan['id'],
                    'name' => $plan['name'],
                    'slug' => $plan['slug'],
                ];
                $user['features'] = $features;
            }
        }

        return $user;
    }

    private function resolvePlanFeatures(int $planId): array
    {
        $rows = $this->db->table('plan_features')
            ->where('plan_id', $planId)
            ->get()
            ->getResultArray();

        $features = [];
        foreach ($rows as $row) {
            $value = $row['feature_value'];
            if ($value === 'true') {
                $features[$row['feature_key']] = true;
            } elseif ($value === 'false') {
                $features[$row['feature_key']] = false;
            } elseif (is_numeric($value)) {
                $features[$row['feature_key']] = (int) $value;
            } else {
                $features[$row['feature_key']] = $value;
            }
        }

        return $features;
    }

    private function sanitizeUser(array $user): array
    {
        unset($user['password_hash'], $user['deleted_at']);

        // Normalize organization_id for frontend context-dependent calls (team invite, etc.)
        if (!array_key_exists('organization_id', $user) || empty($user['organization_id'])) {
            $orgMember = $this->db->table('organization_members')
                ->select('organization_id')
                ->where('user_id', $user['id'])
                ->orderBy('joined_at', 'ASC')
                ->get()
                ->getRowArray();

            $user['organization_id'] = $orgMember ? (int)$orgMember['organization_id'] : null;
        }

        return $user;
    }
}
