<?php

namespace App\Services\Admin;

use App\Libraries\JWTHandler;
use App\Models\ImpersonationLogModel;
use App\Models\UserModel;
use App\Services\AuthService;
use CodeIgniter\Database\BaseConnection;

/**
 * Support "login as" for super admins.
 *
 * Impersonation mints a short-lived access token only — no refresh token — so
 * the session cannot be silently extended and expires on its own. Every grant
 * is recorded in `admin_impersonation_logs` plus the platform audit trail.
 */
class ImpersonationService
{
    use AdminAuditTrail;

    /** Impersonated access tokens live for 30 minutes. */
    public const TOKEN_TTL_SECONDS = 1800;

    protected BaseConnection $db;
    protected UserModel $userModel;
    protected ImpersonationLogModel $logModel;
    protected JWTHandler $jwt;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
        $this->userModel = new UserModel();
        $this->logModel = new ImpersonationLogModel();
        $this->jwt = new JWTHandler();
    }

    public function start(int $adminUserId, int $targetUserId, ?int $organizationId = null, ?string $reason = null): array
    {
        if ($adminUserId === $targetUserId) {
            throw new \RuntimeException('You are already signed in as this user');
        }

        $target = $this->userModel->find($targetUserId);
        if (!$target) {
            throw new \RuntimeException('User not found');
        }

        if (!empty($target['is_super_admin'])) {
            throw new \RuntimeException('Super-admin accounts cannot be impersonated');
        }

        if (empty($target['is_active'])) {
            throw new \RuntimeException('This account is inactive');
        }

        $membership = $this->resolveMembership($targetUserId, $organizationId);
        $resolvedOrgId = $membership ? (int) $membership['organization_id'] : null;

        $accessToken = $this->jwt->generateAccessToken([
            'user_id' => (int) $target['id'],
            'email' => $target['email'],
            'role' => $target['role'],
            'organization_id' => $resolvedOrgId,
            'impersonated_by' => $adminUserId,
        ], self::TOKEN_TTL_SECONDS);

        $expiresAt = date('Y-m-d H:i:s', time() + self::TOKEN_TTL_SECONDS);

        $this->logModel->insert([
            'admin_user_id' => $adminUserId,
            'target_user_id' => $targetUserId,
            'organization_id' => $resolvedOrgId,
            'reason' => $reason ? substr($reason, 0, 500) : null,
            'ip_address' => $this->currentIpAddress(),
            'expires_at' => $expiresAt,
            'created_at' => date('Y-m-d H:i:s'),
        ]);
        $sessionId = (int) $this->logModel->getInsertID();

        $this->recordAdminAction(
            $adminUserId,
            'user.impersonate',
            'user',
            $targetUserId,
            ['email' => $target['email'], 'reason' => $reason, 'session_id' => $sessionId],
            $resolvedOrgId
        );

        $profile = (new AuthService())->buildAuthProfile($targetUserId);

        return [
            'session_id' => $sessionId,
            'access_token' => $accessToken,
            'token_type' => 'Bearer',
            'expires_in' => self::TOKEN_TTL_SECONDS,
            'expires_at' => $expiresAt,
            'organization_id' => $resolvedOrgId,
            'user' => $profile,
        ];
    }

    public function stop(int $sessionId, int $adminUserId): array
    {
        $session = $this->logModel->find($sessionId);
        if (!$session) {
            throw new \RuntimeException('Impersonation session not found');
        }

        if ((int) $session['admin_user_id'] !== $adminUserId) {
            throw new \RuntimeException('This session belongs to another admin');
        }

        if (empty($session['ended_at'])) {
            $this->logModel->update($sessionId, ['ended_at' => date('Y-m-d H:i:s')]);
        }

        $this->recordAdminAction(
            $adminUserId,
            'user.impersonate_end',
            'user',
            (int) $session['target_user_id'],
            ['session_id' => $sessionId],
            $session['organization_id'] !== null ? (int) $session['organization_id'] : null
        );

        return ['session_id' => $sessionId, 'ended' => true];
    }

    public function history(int $limit = 50): array
    {
        $limit = max(1, min(200, $limit));

        return $this->db->table('admin_impersonation_logs ail')
            ->select('
                ail.id, ail.reason, ail.ip_address, ail.created_at, ail.ended_at, ail.expires_at,
                admin.email AS admin_email, admin.first_name AS admin_first_name, admin.last_name AS admin_last_name,
                target.id AS target_user_id, target.email AS target_email,
                target.first_name AS target_first_name, target.last_name AS target_last_name,
                o.name AS organization_name
            ', false)
            ->join('users admin', 'admin.id = ail.admin_user_id', 'left')
            ->join('users target', 'target.id = ail.target_user_id', 'left')
            ->join('organizations o', 'o.id = ail.organization_id', 'left')
            ->orderBy('ail.created_at', 'DESC')
            ->limit($limit)
            ->get()
            ->getResultArray();
    }

    private function resolveMembership(int $userId, ?int $organizationId): ?array
    {
        $builder = $this->db->table('organization_members')->where('user_id', $userId);
        if ($organizationId) {
            $builder->where('organization_id', $organizationId);
        }

        return $builder->orderBy('joined_at', 'ASC')->get()->getRowArray() ?: null;
    }
}
