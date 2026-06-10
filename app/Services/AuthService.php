<?php

namespace App\Services;

use App\Models\UserModel;
use App\Libraries\JWTHandler;

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
        // Check if email exists
        if ($this->userModel->where('email', $data['email'])->first()) {
            throw new \Exception('Email already exists');
        }

        $this->db->transStart();

        try {
            $invitationToken = $data['invitation_token'] ?? null;
            // Create user
            $user = $this->userService->createUser($data);

            if ($invitationToken) {
                $invite = $this->db->table('organization_invitations')
                    ->where('token', $invitationToken)
                    ->where('expires_at >=', date('Y-m-d H:i:s'))
                    ->get()
                    ->getRowArray();

                if ($invite) {
                    $this->organizationService->addMember(
                        (int)$invite['organization_id'],
                        (int)$user['id'],
                        (string)$invite['role'],
                        null
                    );
                    $this->db->table('organization_invitations')->where('id', $invite['id'])->delete();
                } else {
                    // Invalid/expired invite token should not create orphan accounts with default org
                    throw new \Exception('Invitation is invalid or expired');
                }
            } else {
                // Create default organization only for regular signups
                $this->organizationService->createOrganization($user['id'], [
                    'name' => ($data['first_name'] ?? 'User') . "'s Team",
                ]);
            }

            $this->db->transComplete();

            // Refresh user data (if needed, though createUser returns it)

            // Generate tokens
            $tokens = $this->generateTokens($user);

            return [
                'user' => $this->buildAuthProfile((int) $user['id']) ?? $this->sanitizeUser($user),
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

        $orgRole = $orgMember['role'] ?? 'member';
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
        $user['is_org_admin'] = in_array($orgRole, ['owner', 'admin'], true);
        $user['permissions'] = $permissionSlugs;
        $user['monitoring'] = $monitoring;

        return $user;
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
