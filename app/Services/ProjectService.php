<?php

namespace App\Services;

use App\Models\ProjectModel;
use App\Models\PlanModel;
use App\Models\SubscriptionModel;

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
        $subscriptionModel = new SubscriptionModel();
        $planModel = new PlanModel();
        $subscription = $subscriptionModel->getActiveSubscription($organizationId);
        if ($subscription && !empty($subscription['plan_id'])) {
            $maxProjects = $planModel->getFeatureValue((int) $subscription['plan_id'], 'max_projects');
            if ($maxProjects !== null && $maxProjects !== '' && $maxProjects !== 'unlimited') {
                $current = $this->projectModel->where('organization_id', $organizationId)->countAllResults();
                if ($current >= (int) $maxProjects) {
                    throw new \Exception('Project limit reached for your plan. Please upgrade to create more projects.');
                }
            }
        }

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
            COUNT(DISTINCT pm.user_id) AS member_count');
        $builder->join('time_entries te', 'te.project_id = p.id AND te.ended_at IS NOT NULL', 'left');
        $builder->join('project_members pm', 'pm.project_id = p.id', 'left');
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

        // Restrict non-managers to assigned projects only
        if (!empty($filters['assigned_user_id']) && empty($filters['see_all'])) {
            $assignedUserId = (int) $filters['assigned_user_id'];
            $builder->join(
                'project_members pmu',
                'pmu.project_id = p.id AND pmu.user_id = ' . $assignedUserId,
                'inner'
            );
        }

        $page = $filters['page'] ?? 1;
        $perPage = $filters['per_page'] ?? 20;
        $offset = ($page - 1) * $perPage;

        // Count total without limit
        $countBuilder = $this->db->table('projects p');
        if (isset($filters['organization_id'])) {
            $countBuilder->where('p.organization_id', $filters['organization_id']);
        }
        if (isset($filters['is_active'])) {
            $countBuilder->where('p.is_active', $filters['is_active']);
        }
        if (isset($filters['search'])) {
            $countBuilder->groupStart()
                ->like('p.name', $filters['search'])
                ->orLike('p.client_name', $filters['search'])
                ->groupEnd();
        }
        if (!empty($filters['assigned_user_id']) && empty($filters['see_all'])) {
            $assignedUserId = (int) $filters['assigned_user_id'];
            $countBuilder->join(
                'project_members pmu',
                'pmu.project_id = p.id AND pmu.user_id = ' . $assignedUserId,
                'inner'
            );
        }
        $total = $countBuilder->countAllResults();

        $projects = $builder->orderBy('p.created_at', 'DESC')->limit($perPage, $offset)->get()->getResultArray();

        foreach ($projects as &$project) {
            $project['id'] = (int) ($project['id'] ?? 0);
            $project['organization_id'] = (int) ($project['organization_id'] ?? 0);
            if (isset($project['member_count'])) {
                $project['member_count'] = (int) $project['member_count'];
            }
        }
        unset($project);

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
