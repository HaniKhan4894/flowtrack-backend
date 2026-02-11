<?php

namespace App\Services;

use App\Models\ProjectModel;

class ProjectService
{
    protected $projectModel;
    protected $db;

    public function __construct()
    {
        $this->projectModel = new ProjectModel();
        $this->db = \Config\Database::connect();
    }

    public function getProjectById(int $id): ?array
    {
        return $this->projectModel->find($id);
    }

    public function createProject(int $organizationId, array $data): array
    {
        $data['organization_id'] = $organizationId;
        
        $projectId = $this->projectModel->insert($data);

        if (!$projectId) {
            throw new \Exception('Failed to create project');
        }

        return $this->getProjectById($projectId);
    }

    public function updateProject(int $id, array $data): bool
    {
        unset($data['id'], $data['uuid'], $data['organization_id']);
        return $this->projectModel->update($id, $data);
    }

    public function deleteProject(int $id): bool
    {
        return $this->projectModel->delete($id);
    }

    public function archiveProject(int $id): bool
    {
        return $this->projectModel->update($id, [
            'is_active' => false,
            'archived_at' => date('Y-m-d H:i:s')
        ]);
    }

    public function getProjects(array $filters): array
    {
        $builder = $this->projectModel->builder();

        if (isset($filters['organization_id'])) {
            $builder->where('organization_id', $filters['organization_id']);
        }

        if (isset($filters['is_active'])) {
            $builder->where('is_active', $filters['is_active']);
        }

        if (isset($filters['is_billable'])) {
            $builder->where('is_billable', $filters['is_billable']);
        }

        if (isset($filters['search'])) {
            $builder->groupStart()
                ->like('name', $filters['search'])
                ->orLike('client_name', $filters['search'])
                ->groupEnd();
        }

        $page = $filters['page'] ?? 1;
        $perPage = $filters['per_page'] ?? 20;
        $offset = ($page - 1) * $perPage;

        $total = $builder->countAllResults(false);
        $projects = $builder->orderBy('created_at', 'DESC')->limit($perPage, $offset)->get()->getResultArray();

        return [
            'data' => $projects,
            'pagination' => [
                'current_page' => (int)$page,
                'per_page' => (int)$perPage,
                'total' => $total,
                'total_pages' => ceil($total / $perPage)
            ]
        ];
    }
}
