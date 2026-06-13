<?php

namespace App\Services;

use App\Models\ClientModel;
use App\Models\ProjectModel;

class ClientService
{
    protected ClientModel $clientModel;
    protected ProjectModel $projectModel;
    protected $db;

    public function __construct()
    {
        $this->clientModel = new ClientModel();
        $this->projectModel = new ProjectModel();
        $this->db = \Config\Database::connect();
    }

    public function getClients(int $organizationId, array $filters = []): array
    {
        $builder = $this->clientModel->builder()
            ->where('organization_id', $organizationId);

        if (isset($filters['is_active'])) {
            $builder->where('is_active', (int) $filters['is_active']);
        }

        if (!empty($filters['search'])) {
            $search = $filters['search'];
            $builder->groupStart()
                ->like('name', $search)
                ->orLike('email', $search)
                ->groupEnd();
        }

        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 20)));
        $offset = ($page - 1) * $perPage;

        $total = $builder->countAllResults(false);
        $rows = $builder->orderBy('name', 'ASC')->limit($perPage, $offset)->get()->getResultArray();

        return [
            'data' => array_map(fn ($r) => $this->formatClient($r), $rows),
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / max($perPage, 1)),
            ],
        ];
    }

    public function getClient(int $id, int $organizationId): ?array
    {
        $client = $this->clientModel
            ->where('id', $id)
            ->where('organization_id', $organizationId)
            ->first();

        return $client ? $this->formatClient($client, true) : null;
    }

    public function createClient(int $organizationId, array $data): array
    {
        $payload = $this->buildPayload($organizationId, $data);
        $id = $this->clientModel->insert($payload);

        if (!$id) {
            throw new \Exception('Failed to create client');
        }

        return $this->getClient((int) $id, $organizationId);
    }

    public function updateClient(int $id, int $organizationId, array $data): array
    {
        $client = $this->clientModel
            ->where('id', $id)
            ->where('organization_id', $organizationId)
            ->first();

        if (!$client) {
            throw new \Exception('Client not found');
        }

        $payload = $this->buildPayload($organizationId, $data, false);
        unset($payload['organization_id']);

        if (!$this->clientModel->update($id, $payload)) {
            throw new \Exception('Failed to update client');
        }

        return $this->getClient($id, $organizationId);
    }

    public function deleteClient(int $id, int $organizationId): bool
    {
        $client = $this->clientModel
            ->where('id', $id)
            ->where('organization_id', $organizationId)
            ->first();

        if (!$client) {
            throw new \Exception('Client not found');
        }

        $this->projectModel->builder()
            ->where('client_id', $id)
            ->update(['client_id' => null]);

        return (bool) $this->clientModel->delete($id);
    }

    public function linkProjects(int $clientId, int $organizationId, array $projectIds): array
    {
        $client = $this->clientModel
            ->where('id', $clientId)
            ->where('organization_id', $organizationId)
            ->first();

        if (!$client) {
            throw new \Exception('Client not found');
        }

        $projectIds = array_values(array_unique(array_map('intval', $projectIds)));

        if (!empty($projectIds)) {
            $this->projectModel->builder()
                ->where('organization_id', $organizationId)
                ->whereIn('id', $projectIds)
                ->update(['client_id' => $clientId]);
        }

        return $this->getClient($clientId, $organizationId);
    }

    private function buildPayload(int $organizationId, array $data, bool $includeOrg = true): array
    {
        $payload = [];

        if ($includeOrg) {
            $payload['organization_id'] = $organizationId;
        }

        if (isset($data['name'])) {
            $payload['name'] = trim((string) $data['name']);
        }
        if (array_key_exists('email', $data)) {
            $payload['email'] = $data['email'] ?: null;
        }
        if (array_key_exists('phone', $data)) {
            $payload['phone'] = $data['phone'] ?: null;
        }
        if (array_key_exists('default_rate', $data)) {
            $payload['default_rate'] = $data['default_rate'] !== null ? (float) $data['default_rate'] : null;
        }
        if (array_key_exists('notes', $data)) {
            $payload['notes'] = $data['notes'] ?: null;
        }
        if (isset($data['is_active'])) {
            $payload['is_active'] = (int) (bool) $data['is_active'];
        }

        return $payload;
    }

    private function formatClient(array $row, bool $withProjects = false): array
    {
        $formatted = [
            'id' => (int) $row['id'],
            'organization_id' => (int) $row['organization_id'],
            'name' => $row['name'],
            'email' => $row['email'] ?? null,
            'phone' => $row['phone'] ?? null,
            'default_rate' => $row['default_rate'] !== null ? (float) $row['default_rate'] : null,
            'notes' => $row['notes'] ?? null,
            'is_active' => (bool) ($row['is_active'] ?? true),
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
        ];

        if ($withProjects) {
            $projects = $this->db->table('projects')
                ->select('id, name, is_active, is_billable')
                ->where('client_id', $row['id'])
                ->where('organization_id', $row['organization_id'])
                ->orderBy('name', 'ASC')
                ->get()
                ->getResultArray();

            $formatted['projects'] = array_map(fn ($p) => [
                'id' => (int) $p['id'],
                'name' => $p['name'],
                'is_active' => (bool) $p['is_active'],
                'is_billable' => (bool) $p['is_billable'],
            ], $projects);
            $formatted['project_count'] = count($projects);
        }

        return $formatted;
    }
}
