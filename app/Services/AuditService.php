<?php

namespace App\Services;

use App\Models\AuditLogModel;

class AuditService
{
    protected AuditLogModel $auditLogModel;
    protected $db;

    public function __construct()
    {
        $this->auditLogModel = new AuditLogModel();
        $this->db = \Config\Database::connect();
    }

    public function log(
        ?int $organizationId,
        ?int $userId,
        string $action,
        ?string $entityType = null,
        ?int $entityId = null,
        ?array $changes = null,
        ?string $ipAddress = null
    ): array {
        $payload = [
            'organization_id' => $organizationId,
            'user_id' => $userId,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'changes' => $changes ? json_encode($changes) : null,
            'ip_address' => $ipAddress,
            'created_at' => date('Y-m-d H:i:s'),
        ];

        $this->auditLogModel->insert($payload);
        $id = (int) $this->auditLogModel->getInsertID();

        return $this->getLog($id, $organizationId);
    }

    public function getLogs(int $organizationId, array $filters = []): array
    {
        $builder = $this->auditLogModel->builder()
            ->select('audit_logs.*, users.first_name, users.last_name, users.email')
            ->join('users', 'users.id = audit_logs.user_id', 'left')
            ->where('audit_logs.organization_id', $organizationId);

        if (!empty($filters['user_id'])) {
            $builder->where('audit_logs.user_id', (int) $filters['user_id']);
        }
        if (!empty($filters['action'])) {
            $builder->where('audit_logs.action', $filters['action']);
        }
        if (!empty($filters['entity_type'])) {
            $builder->where('audit_logs.entity_type', $filters['entity_type']);
        }
        if (!empty($filters['start_date'])) {
            $builder->where('audit_logs.created_at >=', $filters['start_date'] . ' 00:00:00');
        }
        if (!empty($filters['end_date'])) {
            $builder->where('audit_logs.created_at <=', $filters['end_date'] . ' 23:59:59');
        }

        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 50)));
        $offset = ($page - 1) * $perPage;

        $total = $builder->countAllResults(false);
        $rows = $builder->orderBy('audit_logs.created_at', 'DESC')
            ->limit($perPage, $offset)
            ->get()
            ->getResultArray();

        return [
            'data' => array_map(fn ($r) => $this->formatLog($r), $rows),
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / max($perPage, 1)),
            ],
        ];
    }

    public function getLog(int $id, ?int $organizationId = null): array
    {
        $builder = $this->auditLogModel->builder()
            ->select('audit_logs.*, users.first_name, users.last_name, users.email')
            ->join('users', 'users.id = audit_logs.user_id', 'left')
            ->where('audit_logs.id', $id);

        if ($organizationId) {
            $builder->where('audit_logs.organization_id', $organizationId);
        }

        $row = $builder->get()->getRowArray();

        if (!$row) {
            throw new \Exception('Audit log not found');
        }

        return $this->formatLog($row);
    }

    private function formatLog(array $row): array
    {
        $changes = $row['changes'] ?? null;
        if (is_string($changes)) {
            $changes = json_decode($changes, true);
        }

        return [
            'id' => (int) $row['id'],
            'organization_id' => $row['organization_id'] !== null ? (int) $row['organization_id'] : null,
            'user_id' => $row['user_id'] !== null ? (int) $row['user_id'] : null,
            'user_name' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')) ?: null,
            'user_email' => $row['email'] ?? null,
            'action' => $row['action'],
            'entity_type' => $row['entity_type'] ?? null,
            'entity_id' => $row['entity_id'] !== null ? (int) $row['entity_id'] : null,
            'changes' => $changes,
            'ip_address' => $row['ip_address'] ?? null,
            'created_at' => $row['created_at'] ?? null,
        ];
    }
}
