<?php

namespace App\Services;

use App\Models\TaskModel;

class TaskService
{
    protected $taskModel;
    protected $db;

    public function __construct()
    {
        $this->taskModel = new TaskModel();
        $this->db = \Config\Database::connect();
    }

    public function getTaskById(int $id): ?array
    {
        return $this->taskModel->find($id);
    }

    public function createTask(int $projectId, array $data): array
    {
        $data['project_id'] = $projectId;
        
        $taskId = $this->taskModel->insert($data);

        if (!$taskId) {
            throw new \Exception('Failed to create task');
        }

        return $this->getTaskById($taskId);
    }

    public function updateTask(int $id, array $data): bool
    {
        unset($data['id'], $data['uuid'], $data['project_id']);
        return $this->taskModel->update($id, $data);
    }

    public function deleteTask(int $id): bool
    {
        return $this->taskModel->delete($id);
    }

    public function getTasks(array $filters): array
    {
        $builder = $this->taskModel->builder();

        if (isset($filters['project_id'])) {
            $builder->where('project_id', $filters['project_id']);
        }

        if (isset($filters['is_active'])) {
            $builder->where('is_active', $filters['is_active']);
        }

        if (isset($filters['search'])) {
            $builder->like('name', $filters['search']);
        }

        $page = $filters['page'] ?? 1;
        $perPage = $filters['per_page'] ?? 50;
        $offset = ($page - 1) * $perPage;

        $total = $builder->countAllResults(false);
        $tasks = $builder->orderBy('created_at', 'DESC')->limit($perPage, $offset)->get()->getResultArray();

        return [
            'data' => $tasks,
            'pagination' => [
                'current_page' => (int)$page,
                'per_page' => (int)$perPage,
                'total' => $total,
                'total_pages' => ceil($total / $perPage)
            ]
        ];
    }
}
