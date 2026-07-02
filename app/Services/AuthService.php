<?php

namespace App\Services;

use App\Models\UserModel;
use App\Models\RefreshTokenModel;
use App\Models\OAuthAccountModel;
use App\Libraries\JWTHandler;
use App\Services\EmailVerificationService;
use App\Models\SubscriptionModel;
use App\Models\PlanModel;
use App\Models\OrganizationModel;
use App\Services\OrganizationSettingsService;

class AuthService
{
    protected $userModel;
    protected $refreshTokenModel;
    protected $userService;
    protected $organizationService;
    protected $jwtHandler;
    protected $db;

    public function __construct()
    {
        $this->userModel = new UserModel();
        $this->refreshTokenModel = new RefreshTokenModel();
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
    public function login(string $email, string $password, ?string $totpCode = null, ?string $deviceInfo = null, ?string $ipAddress = null): array
    {
        $user = $this->userModel->where('email', $email)->first();

        if (!$user) {
            throw new \Exception('Invalid credentials');
        }

        if (empty($user['password_hash'])) {
            throw new \Exception('This account uses social login. Please sign in with Google or GitHub, or set a password via "Forgot password".');
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

        if (!empty($user['two_factor_enabled'])) {
            if (!$totpCode) {
                throw new \Exception('Two-factor authentication code is required');
            }
            if (!$this->verifyTotpCode($user, $totpCode)) {
                throw new \Exception('Invalid two-factor authentication code');
            }
        }

        $tokens = $this->generateTokens($user, $deviceInfo, $ipAddress);

        return [
            'user' => $this->buildAuthProfile((int) $user['id']) ?? $this->sanitizeUser($user),
            'tokens' => $tokens
        ];
    }

    /**
     * Log in (or register) a user via an OAuth provider profile.
     *
     * @param array{provider_user_id:string, email:?string, email_verified:bool, first_name:string, last_name:string, avatar_url:?string} $profile
     */
    public function handleOAuthLogin(
        string $provider,
        array $profile,
        ?string $invitationToken = null,
        ?string $deviceInfo = null,
        ?string $ipAddress = null
    ): array {
        $oauthModel = new OAuthAccountModel();

        // 1) Already linked — just log in.
        $linked = $oauthModel->findByProvider($provider, $profile['provider_user_id']);
        if ($linked) {
            $user = $this->userModel->find($linked['user_id']);
            if (!$user) {
                throw new \Exception('Linked account no longer exists');
            }
            if (!$user['is_active']) {
                throw new \Exception('Account is inactive');
            }

            return [
                'user' => $this->buildAuthProfile((int) $user['id']) ?? $this->sanitizeUser($user),
                'tokens' => $this->generateTokens($user, $deviceInfo, $ipAddress),
            ];
        }

        $email = !empty($profile['email']) ? strtolower(trim($profile['email'])) : null;

        // 2) Link to an existing account with the same email.
        if ($email) {
            $existing = $this->userModel->where('email', $email)->first();
            if ($existing) {
                if (!$existing['is_active']) {
                    throw new \Exception('Account is inactive');
                }

                $oauthModel->insert([
                    'user_id'          => (int) $existing['id'],
                    'provider'         => $provider,
                    'provider_user_id' => $profile['provider_user_id'],
                    'email'            => $email,
                    'avatar_url'       => $profile['avatar_url'] ?? null,
                ]);

                $updates = [];
                if (empty($existing['email_verified_at']) && $profile['email_verified']) {
                    $updates['email_verified_at'] = date('Y-m-d H:i:s');
                }
                if (empty($existing['avatar_url']) && !empty($profile['avatar_url'])) {
                    $updates['avatar_url'] = $profile['avatar_url'];
                }
                if ($updates) {
                    $this->userModel->update($existing['id'], $updates);
                    $existing = $this->userModel->find($existing['id']);
                }

                return [
                    'user' => $this->buildAuthProfile((int) $existing['id']) ?? $this->sanitizeUser($existing),
                    'tokens' => $this->generateTokens($existing, $deviceInfo, $ipAddress),
                ];
            }
        }

        // 3) New user — needs an email address to create the account.
        if (!$email) {
            throw new \Exception('Your ' . ucfirst($provider) . ' account did not share an email address. Please sign up with email and password instead.');
        }

        $invitationToken = $invitationToken ? trim($invitationToken) : null;

        $this->db->transStart();
        try {
            $userData = [
                'email'             => $email,
                'first_name'        => $profile['first_name'] ?: 'User',
                'last_name'         => $profile['last_name'] ?: '',
                'avatar_url'        => $profile['avatar_url'] ?? null,
                'email_verified_at' => $profile['email_verified'] ? date('Y-m-d H:i:s') : null,
            ];

            $invite = null;
            if ($invitationToken) {
                $invite = $this->db->table('organization_invitations')
                    ->where('token', $invitationToken)
                    ->where('expires_at >=', date('Y-m-d H:i:s'))
                    ->get()
                    ->getRowArray();

                if (!$invite) {
                    throw new \Exception('Invitation is invalid or expired');
                }
                if (strcasecmp((string) $invite['email'], $email) !== 0) {
                    throw new \Exception('This invitation was sent to a different email address');
                }

                $userData['role'] = (string) ($invite['role'] ?? 'member');
                // Joining via an invitation implicitly verifies the email.
                $userData['email_verified_at'] = date('Y-m-d H:i:s');
                $user = $this->userService->createUser($userData);

                $this->organizationService->addMember(
                    (int) $invite['organization_id'],
                    (int) $user['id'],
                    (string) $invite['role'],
                    null
                );
                $this->db->table('organization_invitations')->where('id', $invite['id'])->delete();
            } else {
                $userData['role'] = 'owner';
                $user = $this->userService->createUser($userData);

                $orgName = trim(($userData['first_name'] ?: 'User') . "'s Team");
                $this->organizationService->createOrganization((int) $user['id'], [
                    'name' => $orgName,
                ]);
            }

            $oauthModel->insert([
                'user_id'          => (int) $user['id'],
                'provider'         => $provider,
                'provider_user_id' => $profile['provider_user_id'],
                'email'            => $email,
                'avatar_url'       => $profile['avatar_url'] ?? null,
            ]);

            if ($this->db->transStatus() === false) {
                throw new \Exception('Social sign-in failed. Please try again.');
            }

            $this->db->transComplete();
        } catch (\Exception $e) {
            $this->db->transRollback();
            throw $e;
        }

        $freshUser = $this->userModel->find($user['id']) ?? $user;

        return [
            'user' => $this->buildAuthProfile((int) $freshUser['id']) ?? $this->sanitizeUser($freshUser),
            'tokens' => $this->generateTokens($freshUser, $deviceInfo, $ipAddress),
        ];
    }

    /**
     * Refresh access token using refresh token
     */
    public function refreshToken(string $refreshToken, ?string $deviceInfo = null, ?string $ipAddress = null): array
    {
        $decoded = $this->jwtHandler->verifyToken($refreshToken);
        if (!$decoded || (($decoded->type ?? null) !== 'refresh')) {
            throw new \Exception('Invalid refresh token');
        }

        $tokenHash = hash('sha256', $refreshToken);
        $stored = $this->refreshTokenModel
            ->where('token_hash', $tokenHash)
            ->where('revoked_at', null)
            ->where('expires_at >=', date('Y-m-d H:i:s'))
            ->first();

        if (!$stored) {
            throw new \Exception('Invalid or expired refresh token');
        }

        $userData = $this->jwtHandler->getUserFromToken($refreshToken);

        if (!$userData) {
            throw new \Exception('Invalid refresh token');
        }

        $user = $this->userModel->find($userData['user_id']);

        if (!$user || !$user['is_active']) {
            throw new \Exception('User not found or inactive');
        }

        $this->refreshTokenModel->update($stored['id'], ['revoked_at' => date('Y-m-d H:i:s')]);

        $orgMember = $this->db->table('organization_members')
            ->where('user_id', $user['id'])
            ->orderBy('joined_at', 'ASC')
            ->get()
            ->getRowArray();

        $tokens = $this->generateTokens($user, $deviceInfo, $ipAddress);

        return [
            'access_token' => $tokens['access_token'],
            'refresh_token' => $tokens['refresh_token'],
            'token_type' => 'Bearer',
            'expires_in' => 900,
            'organization_id' => $orgMember ? (int)$orgMember['organization_id'] : null,
        ];
    }

    /**
     * Revoke refresh token on logout
     */
    public function logout(?string $refreshToken = null): void
    {
        if (!$refreshToken) {
            return;
        }

        $tokenHash = hash('sha256', $refreshToken);
        $this->refreshTokenModel
            ->where('token_hash', $tokenHash)
            ->where('revoked_at', null)
            ->set(['revoked_at' => date('Y-m-d H:i:s')])
            ->update();
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
     * Generate JWT tokens and persist refresh token session
     */
    private function generateTokens(array $user, ?string $deviceInfo = null, ?string $ipAddress = null): array
    {
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

        $accessToken = $this->jwtHandler->generateAccessToken($payload, 900);
        $refreshToken = $this->jwtHandler->generateRefreshToken(['user_id' => $user['id']], 2592000);

        $expiresAt = date('Y-m-d H:i:s', time() + 2592000);
        $this->refreshTokenModel->insert([
            'user_id' => (int) $user['id'],
            'token_hash' => hash('sha256', $refreshToken),
            'device_info' => $deviceInfo ? substr($deviceInfo, 0, 500) : null,
            'ip_address' => $ipAddress,
            'expires_at' => $expiresAt,
            'created_at' => date('Y-m-d H:i:s'),
        ]);

        return [
            'access_token' => $accessToken,
            'refresh_token' => $refreshToken,
            'token_type' => 'Bearer',
            'expires_in' => 900,
            'organization_id' => $orgMember ? (int)$orgMember['organization_id'] : null,
        ];
    }

    public function setupTwoFactor(int $userId): array
    {
        $user = $this->userModel->find($userId);
        if (!$user) {
            throw new \Exception('User not found');
        }

        $google2fa = new \PragmaRX\Google2FA\Google2FA();
        $secret = $google2fa->generateSecretKey();

        $this->db->table('users')->where('id', $userId)->update([
            'two_factor_secret' => $secret,
            'two_factor_enabled' => 0,
        ]);

        $appName = 'FlowTrack';
        $otpauthUrl = $google2fa->getQRCodeUrl($appName, $user['email'], $secret);

        return [
            'secret' => $secret,
            'otpauth_url' => $otpauthUrl,
        ];
    }

    public function verifyTwoFactor(int $userId, string $code): bool
    {
        $user = $this->userModel->find($userId);
        if (!$user || empty($user['two_factor_secret'])) {
            throw new \Exception('Two-factor setup not initiated');
        }

        if (!$this->verifyTotpCode($user, $code)) {
            throw new \Exception('Invalid verification code');
        }

        $this->db->table('users')->where('id', $userId)->update(['two_factor_enabled' => 1]);

        return true;
    }

    public function disableTwoFactor(int $userId, string $password, string $code): bool
    {
        $user = $this->userModel->find($userId);
        if (!$user) {
            throw new \Exception('User not found');
        }

        // Social-login users have no password; the TOTP code alone gates disabling.
        if (!empty($user['password_hash']) && !password_verify($password, $user['password_hash'])) {
            throw new \Exception('Invalid password');
        }

        if (!empty($user['two_factor_enabled']) && !$this->verifyTotpCode($user, $code)) {
            throw new \Exception('Invalid verification code');
        }

        $this->db->table('users')->where('id', $userId)->update([
            'two_factor_secret' => null,
            'two_factor_enabled' => 0,
        ]);

        return true;
    }

    public function listSessions(int $userId): array
    {
        $rows = $this->refreshTokenModel
            ->where('user_id', $userId)
            ->where('revoked_at', null)
            ->where('expires_at >=', date('Y-m-d H:i:s'))
            ->orderBy('created_at', 'DESC')
            ->findAll();

        return array_map(fn ($r) => [
            'id' => (int) $r['id'],
            'device_info' => $r['device_info'] ?? null,
            'ip_address' => $r['ip_address'] ?? null,
            'expires_at' => $r['expires_at'],
            'created_at' => $r['created_at'],
        ], $rows);
    }

    public function revokeSession(int $userId, int $sessionId): bool
    {
        $session = $this->refreshTokenModel
            ->where('id', $sessionId)
            ->where('user_id', $userId)
            ->where('revoked_at', null)
            ->first();

        if (!$session) {
            throw new \Exception('Session not found');
        }

        return (bool) $this->refreshTokenModel->update($sessionId, [
            'revoked_at' => date('Y-m-d H:i:s'),
        ]);
    }

    private function verifyTotpCode(array $user, string $code): bool
    {
        if (empty($user['two_factor_secret'])) {
            return false;
        }

        $google2fa = new \PragmaRX\Google2FA\Google2FA();

        return $google2fa->verifyKey($user['two_factor_secret'], $code);
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
        // MySQLi returns tinyints as strings ("0"/"1"); "0" is truthy in JS.
        $user['two_factor_enabled'] = !empty($user['two_factor_enabled']);

        $teamScopeService = new TeamScopeService();
        $onboardingService = new OnboardingService();
        $viewTeamSlugs = ['time.view_team', 'screenshots.view_team', 'activity.view_team', 'reports.view_team'];
        $hasViewTeamPermission = !empty(array_intersect($permissionSlugs, $viewTeamSlugs));
        $visibleUserIds = $organizationId > 0
            ? $teamScopeService->getVisibleUserIds($userId, $organizationId)
            : [$userId];

        $user['is_team_lead'] = $organizationId > 0 && $teamScopeService->isTeamLead($userId, $organizationId);
        $user['can_view_team'] = $hasViewTeamPermission && count($visibleUserIds) > 1;
        $user['onboarding'] = $organizationId > 0
            ? $onboardingService->getProgress($userId, $organizationId)
            : null;

        if ($organizationId > 0) {
            $org = (new OrganizationModel())->find($organizationId);
            if ($org) {
                $user['organization'] = [
                    'id' => (int) $org['id'],
                    'name' => $org['name'],
                    'php_timezone' => $org['php_timezone'] ?? 'UTC',
                    'currency' => $org['currency'] ?? 'USD',
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

                $settingsService = new OrganizationSettingsService();
                $effectiveTracking = $settingsService->getEffectiveTrackingConfigForMember($organizationId, $userId);
                $user['tracking_config'] = $effectiveTracking;
                $activeAdvanced = (new AdvancedMonitoringService())->getActiveSession($organizationId, $userId);
                $user['advanced_monitoring'] = $activeAdvanced ? [
                    'active' => true,
                    'session_id' => (int) $activeAdvanced['id'],
                    'started_at' => $activeAdvanced['started_at'],
                    'reason' => $activeAdvanced['reason'] ?? null,
                    'screenshot_frequency_minutes' => (int) ($activeAdvanced['screenshot_frequency_minutes'] ?? 1),
                ] : null;
                if (!empty($effectiveTracking['screenshot_enabled'])) {
                    $user['features']['screenshot_interval'] = (int) ($effectiveTracking['screenshot_frequency_minutes'] ?? $features['screenshot_interval'] ?? 0);
                } else {
                    $user['features']['screenshot_interval'] = 0;
                }
            } elseif ($organizationId > 0) {
                $settingsService = new OrganizationSettingsService();
                $user['tracking_config'] = $settingsService->getEffectiveTrackingConfigForMember($organizationId, $userId);
                $activeAdvanced = (new AdvancedMonitoringService())->getActiveSession($organizationId, $userId);
                $user['advanced_monitoring'] = $activeAdvanced ? [
                    'active' => true,
                    'session_id' => (int) $activeAdvanced['id'],
                    'started_at' => $activeAdvanced['started_at'],
                    'reason' => $activeAdvanced['reason'] ?? null,
                    'screenshot_frequency_minutes' => (int) ($activeAdvanced['screenshot_frequency_minutes'] ?? 1),
                ] : null;
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
        unset($user['password_hash'], $user['deleted_at'], $user['two_factor_secret']);

        if (array_key_exists('two_factor_enabled', $user)) {
            $user['two_factor_enabled'] = !empty($user['two_factor_enabled']);
        }

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
