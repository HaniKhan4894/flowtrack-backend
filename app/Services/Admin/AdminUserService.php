<?php

namespace App\Services\Admin;

use App\Models\UserModel;
use App\Services\PasswordResetService;
use CodeIgniter\Database\BaseConnection;

/**
 * Global (cross-tenant) user administration.
 */
class AdminUserService
{
    use AdminAuditTrail;

    protected BaseConnection $db;
    protected UserModel $userModel;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
        $this->userModel = new UserModel();
    }

    /**
     * @param array{search?:string, status?:string, organization_id?:int|string, role?:string, super_admin?:string, sort?:string, direction?:string, page?:int, per_page?:int} $filters
     */
    public function list(array $filters = []): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 25)));
        $offset = ($page - 1) * $perPage;

        $builder = $this->db->table('users u')
            ->select('
                u.id, u.uuid, u.email, u.first_name, u.last_name, u.role, u.avatar_url,
                u.timezone, u.is_active, u.is_super_admin, u.email_verified_at, u.created_at,
                (SELECT COUNT(*) FROM organization_members om WHERE om.user_id = u.id) AS organization_count,
                (SELECT MAX(rt.created_at) FROM refresh_tokens rt WHERE rt.user_id = u.id) AS last_session_at,
                (SELECT MAX(te.started_at) FROM time_entries te WHERE te.user_id = u.id) AS last_activity_at,
                (SELECT COALESCE(SUM(te.duration_seconds), 0) FROM time_entries te
                    WHERE te.user_id = u.id AND te.started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS seconds_30d
            ', false)
            ->where('u.deleted_at IS NULL', null, false);

        if (!empty($filters['search'])) {
            $search = trim((string) $filters['search']);
            $builder->groupStart()
                ->like('u.email', $search)
                ->orLike('u.first_name', $search)
                ->orLike('u.last_name', $search)
                ->groupEnd();
        }

        if (($filters['status'] ?? '') === 'active') {
            $builder->where('u.is_active', 1);
        } elseif (($filters['status'] ?? '') === 'inactive') {
            $builder->where('u.is_active', 0);
        } elseif (($filters['status'] ?? '') === 'unverified') {
            $builder->where('u.email_verified_at IS NULL', null, false);
        }

        if (!empty($filters['role'])) {
            $builder->where('u.role', $filters['role']);
        }

        if (($filters['super_admin'] ?? '') === '1') {
            $builder->where('u.is_super_admin', 1);
        }

        if (!empty($filters['organization_id'])) {
            $builder->where(
                'u.id IN (SELECT user_id FROM organization_members WHERE organization_id = ' . (int) $filters['organization_id'] . ')',
                null,
                false
            );
        }

        $sortable = [
            'created_at' => 'u.created_at',
            'email' => 'u.email',
            'last_activity' => 'last_activity_at',
            'hours' => 'seconds_30d',
        ];
        $sort = $sortable[$filters['sort'] ?? 'created_at'] ?? 'u.created_at';
        $direction = strtolower((string) ($filters['direction'] ?? 'desc')) === 'asc' ? 'ASC' : 'DESC';

        $total = $builder->countAllResults(false);
        $rows = $builder->orderBy($sort, $direction)
            ->limit($perPage, $offset)
            ->get()
            ->getResultArray();

        $userIds = array_column($rows, 'id');
        $orgsByUser = $this->organizationsForUsers($userIds);

        $data = array_map(static function (array $row) use ($orgsByUser) {
            return [
                'id' => (int) $row['id'],
                'uuid' => $row['uuid'],
                'email' => $row['email'],
                'name' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')) ?: $row['email'],
                'first_name' => $row['first_name'],
                'last_name' => $row['last_name'],
                'role' => $row['role'],
                'avatar_url' => $row['avatar_url'],
                'timezone' => $row['timezone'],
                'is_active' => (bool) $row['is_active'],
                'is_super_admin' => (bool) $row['is_super_admin'],
                'is_verified' => !empty($row['email_verified_at']),
                'email_verified_at' => $row['email_verified_at'],
                'created_at' => $row['created_at'],
                'organization_count' => (int) $row['organization_count'],
                'organizations' => $orgsByUser[(int) $row['id']] ?? [],
                'last_session_at' => $row['last_session_at'],
                'last_activity_at' => $row['last_activity_at'],
                'hours_30d' => round(((int) $row['seconds_30d']) / 3600, 1),
            ];
        }, $rows);

        return [
            'data' => $data,
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / max($perPage, 1)),
            ],
        ];
    }

    /**
     * @param list<int|string> $userIds
     * @return array<int, list<array{id:int, name:string, role:string}>>
     */
    private function organizationsForUsers(array $userIds): array
    {
        if ($userIds === []) {
            return [];
        }

        $rows = $this->db->table('organization_members om')
            ->select('om.user_id, om.role, o.id, o.name')
            ->join('organizations o', 'o.id = om.organization_id')
            ->whereIn('om.user_id', $userIds)
            ->get()
            ->getResultArray();

        $out = [];
        foreach ($rows as $row) {
            $out[(int) $row['user_id']][] = [
                'id' => (int) $row['id'],
                'name' => $row['name'],
                'role' => $row['role'],
            ];
        }

        return $out;
    }

    public function detail(int $userId): ?array
    {
        $user = $this->db->table('users')
            ->select('id, uuid, email, first_name, last_name, role, avatar_url, timezone, is_active, is_super_admin, email_verified_at, two_factor_enabled, created_at, updated_at')
            ->where('id', $userId)
            ->where('deleted_at IS NULL', null, false)
            ->get()
            ->getRowArray();

        if (!$user) {
            return null;
        }

        $memberships = $this->db->table('organization_members om')
            ->select('om.organization_id, om.role, om.joined_at, o.name AS organization_name, o.is_active AS organization_active, r.name AS role_name')
            ->join('organizations o', 'o.id = om.organization_id')
            ->join('roles r', 'r.id = om.role_id', 'left')
            ->where('om.user_id', $userId)
            ->get()
            ->getResultArray();

        $sessions = $this->db->table('refresh_tokens')
            ->select('id, device_info, ip_address, created_at, expires_at, revoked_at')
            ->where('user_id', $userId)
            ->orderBy('created_at', 'DESC')
            ->limit(10)
            ->get()
            ->getResultArray();

        $activity = $this->db->query("
            SELECT
                COUNT(*) AS total_entries,
                COALESCE(SUM(duration_seconds), 0) AS total_seconds,
                COALESCE(SUM(CASE WHEN started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN duration_seconds ELSE 0 END), 0) AS seconds_30d,
                MAX(started_at) AS last_activity_at
            FROM time_entries WHERE user_id = ?
        ", [$userId])->getRowArray() ?: [];

        $impersonations = $this->db->table('admin_impersonation_logs ail')
            ->select('ail.id, ail.reason, ail.created_at, ail.ended_at, u.email AS admin_email')
            ->join('users u', 'u.id = ail.admin_user_id', 'left')
            ->where('ail.target_user_id', $userId)
            ->orderBy('ail.created_at', 'DESC')
            ->limit(10)
            ->get()
            ->getResultArray();

        return [
            'user' => [
                'id' => (int) $user['id'],
                'uuid' => $user['uuid'],
                'email' => $user['email'],
                'name' => trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')) ?: $user['email'],
                'first_name' => $user['first_name'],
                'last_name' => $user['last_name'],
                'role' => $user['role'],
                'avatar_url' => $user['avatar_url'],
                'timezone' => $user['timezone'],
                'is_active' => (bool) $user['is_active'],
                'is_super_admin' => (bool) $user['is_super_admin'],
                'is_verified' => !empty($user['email_verified_at']),
                'two_factor_enabled' => !empty($user['two_factor_enabled']),
                'created_at' => $user['created_at'],
            ],
            'memberships' => $memberships,
            'sessions' => $sessions,
            'activity' => [
                'total_entries' => (int) ($activity['total_entries'] ?? 0),
                'total_hours' => round(((int) ($activity['total_seconds'] ?? 0)) / 3600, 1),
                'hours_30d' => round(((int) ($activity['seconds_30d'] ?? 0)) / 3600, 1),
                'last_activity_at' => $activity['last_activity_at'] ?? null,
            ],
            'impersonation_history' => $impersonations,
        ];
    }

    public function setActive(int $userId, bool $isActive, int $adminUserId): array
    {
        $user = $this->requireUser($userId);

        if (!$isActive && (int) $user['id'] === $adminUserId) {
            throw new \RuntimeException('You cannot deactivate your own account');
        }

        $this->db->table('users')->where('id', $userId)->update(['is_active' => $isActive ? 1 : 0]);

        if (!$isActive) {
            $this->revokeSessions($userId);
        }

        $this->recordAdminAction(
            $adminUserId,
            $isActive ? 'user.activate' : 'user.deactivate',
            'user',
            $userId,
            ['email' => $user['email']]
        );

        return ['id' => $userId, 'is_active' => $isActive];
    }

    public function setSuperAdmin(int $userId, bool $isSuperAdmin, int $adminUserId): array
    {
        $user = $this->requireUser($userId);

        if (!$isSuperAdmin && $userId === $adminUserId) {
            throw new \RuntimeException('You cannot remove your own super-admin access');
        }

        if (!$isSuperAdmin) {
            $remaining = $this->db->table('users')
                ->where('is_super_admin', 1)
                ->where('id !=', $userId)
                ->where('deleted_at IS NULL', null, false)
                ->countAllResults();
            if ($remaining === 0) {
                throw new \RuntimeException('At least one super admin must remain');
            }
        }

        $this->db->table('users')->where('id', $userId)->update(['is_super_admin' => $isSuperAdmin ? 1 : 0]);

        $this->recordAdminAction(
            $adminUserId,
            $isSuperAdmin ? 'user.grant_super_admin' : 'user.revoke_super_admin',
            'user',
            $userId,
            ['email' => $user['email']]
        );

        return ['id' => $userId, 'is_super_admin' => $isSuperAdmin];
    }

    public function verifyEmail(int $userId, int $adminUserId): array
    {
        $user = $this->requireUser($userId);
        $now = date('Y-m-d H:i:s');

        $this->db->table('users')->where('id', $userId)->update(['email_verified_at' => $now]);

        $this->recordAdminAction($adminUserId, 'user.verify_email', 'user', $userId, ['email' => $user['email']]);

        return ['id' => $userId, 'email_verified_at' => $now];
    }

    /**
     * Issue a password reset link the same way the public flow does.
     */
    public function sendPasswordReset(int $userId, int $adminUserId): array
    {
        $user = $this->requireUser($userId);

        $sent = (new PasswordResetService())->sendResetEmail($user['email']);

        $this->recordAdminAction($adminUserId, 'user.password_reset_sent', 'user', $userId, [
            'email' => $user['email'],
            'delivered' => $sent,
        ]);

        return ['email' => $user['email'], 'delivered' => $sent];
    }

    public function revokeSessions(int $userId, ?int $adminUserId = null): array
    {
        $now = date('Y-m-d H:i:s');
        $this->db->table('refresh_tokens')
            ->where('user_id', $userId)
            ->where('revoked_at IS NULL', null, false)
            ->update(['revoked_at' => $now]);

        $revoked = $this->db->affectedRows();

        if ($adminUserId !== null) {
            $this->recordAdminAction($adminUserId, 'user.revoke_sessions', 'user', $userId, ['revoked' => $revoked]);
        }

        return ['revoked' => $revoked];
    }

    public function delete(int $userId, int $adminUserId, ?string $reason = null): void
    {
        $user = $this->requireUser($userId);

        if ($userId === $adminUserId) {
            throw new \RuntimeException('You cannot delete your own account');
        }

        $ownedOrgs = $this->db->table('organizations')->where('owner_id', $userId)->countAllResults();
        if ($ownedOrgs > 0) {
            throw new \RuntimeException('This user owns ' . $ownedOrgs . ' organization(s). Transfer or delete them first.');
        }

        $this->userModel->delete($userId);
        $this->revokeSessions($userId);

        $this->recordAdminAction($adminUserId, 'user.delete', 'user', $userId, [
            'email' => $user['email'],
            'reason' => $reason,
        ]);
    }

    private function requireUser(int $userId): array
    {
        $user = $this->userModel->find($userId);
        if (!$user) {
            throw new \RuntimeException('User not found');
        }

        return $user;
    }
}
