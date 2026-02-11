<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\TaskService;

class TaskController extends ResourceController
{
    protected $taskService;
    protected $format = 'json';

    public function __construct()
    {
        $this->taskService = new TaskService();
    }

    /**
     * GET /api/v1/tasks?project_id=1&is_active=1&search=bug&page=1
     */
    public function index()
    {
        try {
            $filters = [
                'project_id' => $this->request->getGet('project_id'),
                'is_active' => $this->request->getGet('is_active'),
                'search' => $this->request->getGet('search'),
                'page' => $this->request->getGet('page') ?? 1,
                'per_page' => $this->request->getGet('per_page') ?? 50,
            ];

            $filters = array_filter($filters, fn($value) => $value !== null);

            $result = $this->taskService->getTasks($filters);

            return $this->respond([
                'success' => true,
                'data' => $result['data'],
                'pagination' => $result['pagination']
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/tasks/{id}
     */
    public function show($id = null)
    {
        try {
            $task = $this->taskService->getTaskById($id);

            if (!$task) {
                return $this->failNotFound('Task not found');
            }

            return $this->respond([
                'success' => true,
                'data' => $task
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/tasks
     */
    public function create()
    {
        try {
            $data = $this->request->getJSON(true);

            $rules = [
                'project_id' => 'required|is_natural_no_zero',
                'name' => 'required|max_length[255]',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $task = $this->taskService->createTask($data['project_id'], $data);

            return $this->respondCreated([
                'success' => true,
                'message' => 'Task created successfully',
                'data' => $task
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/tasks/{id}
     */
    public function update($id = null)
    {
        try {
            $data = $this->request->getJSON(true);

            $updated = $this->taskService->updateTask($id, $data);

            if (!$updated) {
                return $this->fail('Failed to update task', 400);
            }

            return $this->respond([
                'success' => true,
                'message' => 'Task updated successfully',
                'data' => $this->taskService->getTaskById($id)
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * DELETE /api/v1/tasks/{id}
     */
    public function delete($id = null)
    {
        try {
            $deleted = $this->taskService->deleteTask($id);

            if (!$deleted) {
                return $this->fail('Failed to delete task', 400);
            }

            return $this->respondDeleted([
                'success' => true,
                'message' => 'Task deleted successfully'
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
