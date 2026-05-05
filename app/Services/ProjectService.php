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
        $builder = $this->db->table('projects p');
        $builder->select('p.*, 
            COALESCE(SUM(te.duration_seconds), 0) AS total_time_seconds,
            COUNT(DISTINCT om.user_id) AS member_count');
        $builder->join('time_entries te', 'te.project_id = p.id AND te.ended_at IS NOT NULL', 'left');
        $builder->join('organization_members om', 'om.organization_id = p.organization_id', 'left');
        $builder->groupBy('p.id');

        if (isset($filters['organization_id'])) {
            $builder->where('p.organization_id', $filters['organization_id']);
        }

        if (isset($filters['is_active'])) {
            $builder->where('p.is_active', $filters['is_active']);
        }

        if (isset($filters['is_billable'])) {
            $builder->where('p.is_billable', $filters['is_billable']);
        }

        if (isset($filters['search'])) {
            $builder->groupStart()
                ->like('p.name', $filters['search'])
                ->orLike('p.client_name', $filters['search'])
                ->groupEnd();
        }

        $page = $filters['page'] ?? 1;
        $perPage = $filters['per_page'] ?? 20;
        $offset = ($page - 1) * $perPage;

        // Count total without limit
        $countBuilder = $this->db->table('projects p');
        if (isset($filters['organization_id'])) {
            $countBuilder->where('p.organization_id', $filters['organization_id']);
        }
        if (isset($filters['search'])) {
            $countBuilder->groupStart()
                ->like('p.name', $filters['search'])
                ->orLike('p.client_name', $filters['search'])
                ->groupEnd();
        }
        $total = $countBuilder->countAllResults();

        $projects = $builder->orderBy('p.created_at', 'DESC')->limit($perPage, $offset)->get()->getResultArray();

        return [
            'data' => $projects,
            'pagination' => [
                'current_page' => (int) $page,
                'per_page' => (int) $perPage,
                'total' => $total,
                'total_pages' => ceil($total / $perPage)
            ]
        ];
    }
}
