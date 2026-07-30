<?php

namespace App\Services\Admin;

use CodeIgniter\Database\BaseConnection;

/**
 * Cross-tenant audit log reader for the platform portal.
 *
 * `scope=platform` narrows to super-admin actions, which are written with a
 * `platform.` action prefix by AdminAuditTrail.
 */
class AdminAuditService
{
    protected BaseConnection $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    /**
     * @param array{scope?:string, search?:string, action?:string, entity_type?:string, organization_id?:int|string, user_id?:int|string, start_date?:string, end_date?:string, page?:int, per_page?:int} $filters
     */
    public function list(array $filters = []): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 50)));
        $offset = ($page - 1) * $perPage;

        $builder = $this->db->table('audit_logs al')
            ->select('al.*, u.email AS user_email, u.first_name, u.last_name, u.is_super_admin,
                      o.name AS organization_name', false)
            ->join('users u', 'u.id = al.user_id', 'left')
            ->join('organizations o', 'o.id = al.organization_id', 'left');

        $scope = $filters['scope'] ?? 'all';
        if ($scope === 'platform') {
            $builder->like('al.action', 'platform.', 'after');
        } elseif ($scope === 'organization') {
            $builder->notLike('al.action', 'platform.', 'after');
        }

        if (!empty($filters['search'])) {
            $search = trim((string) $filters['search']);
            $builder->groupStart()
                ->like('al.action', $search)
                ->orLike('al.entity_type', $search)
                ->orLike('u.email', $search)
                ->orLike('o.name', $search)
                ->orLike('al.changes', $search)
                ->groupEnd();
        }

        if (!empty($filters['action'])) {
            $builder->where('al.action', $filters['action']);
        }
        if (!empty($filters['entity_type'])) {
            $builder->where('al.entity_type', $filters['entity_type']);
        }
        if (!empty($filters['organization_id'])) {
            $builder->where('al.organization_id', (int) $filters['organization_id']);
        }
        if (!empty($filters['user_id'])) {
            $builder->where('al.user_id', (int) $filters['user_id']);
        }
        if (!empty($filters['start_date'])) {
            $builder->where('al.created_at >=', $filters['start_date'] . ' 00:00:00');
        }
        if (!empty($filters['end_date'])) {
            $builder->where('al.created_at <=', $filters['end_date'] . ' 23:59:59');
        }

        $total = $builder->countAllResults(false);
        $rows = $builder->orderBy('al.created_at', 'DESC')
            ->orderBy('al.id', 'DESC')
            ->limit($perPage, $offset)
            ->get()
            ->getResultArray();

        return [
            'data' => array_map(static function (array $row) {
                $changes = $row['changes'] ?? null;
                if (is_string($changes)) {
                    $decoded = json_decode($changes, true);
                    $changes = is_array($decoded) ? $decoded : $changes;
                }

                return [
                    'id' => (int) $row['id'],
                    'action' => $row['action'],
                    'is_platform_action' => str_starts_with((string) $row['action'], 'platform.'),
                    'entity_type' => $row['entity_type'],
                    'entity_id' => $row['entity_id'] !== null ? (int) $row['entity_id'] : null,
                    'organization_id' => $row['organization_id'] !== null ? (int) $row['organization_id'] : null,
                    'organization_name' => $row['organization_name'],
                    'user_id' => $row['user_id'] !== null ? (int) $row['user_id'] : null,
                    'user_email' => $row['user_email'],
                    'user_name' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')) ?: null,
                    'is_super_admin' => (bool) ($row['is_super_admin'] ?? false),
                    'changes' => $changes,
                    'ip_address' => $row['ip_address'],
                    'created_at' => $row['created_at'],
                ];
            }, $rows),
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / max($perPage, 1)),
            ],
        ];
    }

    /** Action + entity vocabularies so the UI can build filter dropdowns. */
    public function filterOptions(): array
    {
        return [
            'actions' => array_column(
                $this->db->table('audit_logs')
                    ->select('action')
                    ->groupBy('action')
                    ->orderBy('action', 'ASC')
                    ->get()
                    ->getResultArray(),
                'action'
            ),
            'entity_types' => array_values(array_filter(array_column(
                $this->db->table('audit_logs')
                    ->select('entity_type')
                    ->where('entity_type IS NOT NULL', null, false)
                    ->groupBy('entity_type')
                    ->orderBy('entity_type', 'ASC')
                    ->get()
                    ->getResultArray(),
                'entity_type'
            ))),
        ];
    }

    /**
     * Security signals: recent super-admin actions and session activity.
     */
    public function securityOverview(): array
    {
        $adminActions = (int) ($this->db->query("
            SELECT COUNT(*) AS total FROM audit_logs
            WHERE action LIKE 'platform.%' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ")->getRowArray()['total'] ?? 0);

        $impersonations = (int) ($this->db->query("
            SELECT COUNT(*) AS total FROM admin_impersonation_logs
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        ")->getRowArray()['total'] ?? 0);

        $sessions = $this->db->query("
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN revoked_at IS NULL AND expires_at > NOW() THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) AS created_24h
            FROM refresh_tokens
        ")->getRowArray() ?: [];

        $topAdmins = $this->db->query("
            SELECT u.id, u.email, COUNT(*) AS actions
            FROM audit_logs al
            JOIN users u ON u.id = al.user_id
            WHERE al.action LIKE 'platform.%' AND al.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY u.id, u.email
            ORDER BY actions DESC
            LIMIT 10
        ")->getResultArray();

        return [
            'platform_actions_7d' => $adminActions,
            'impersonations_30d' => $impersonations,
            'sessions_total' => (int) ($sessions['total'] ?? 0),
            'sessions_active' => (int) ($sessions['active'] ?? 0),
            'sessions_created_24h' => (int) ($sessions['created_24h'] ?? 0),
            'users_with_2fa' => (int) ($this->db->query("
                SELECT COUNT(*) AS total FROM users WHERE two_factor_enabled = 1 AND deleted_at IS NULL
            ")->getRowArray()['total'] ?? 0),
            'top_admins_30d' => $topAdmins,
        ];
    }
}
