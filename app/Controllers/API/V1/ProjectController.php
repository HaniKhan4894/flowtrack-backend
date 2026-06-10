<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\ProjectService;

class ProjectController extends ResourceController
{
    protected $projectService;
    protected $format = 'json';

    public function __construct()
    {
        $this->projectService = new ProjectService();
    }

    private function requireOrganizationId()
    {
        $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if ($organizationId <= 0) {
            return $this->fail('Organization context is required', 400);
        }
        return $organizationId;
    }

    /**
     * GET /api/v1/projects?organization_id=1&is_active=1&search=api&page=1
     */
    public function index()
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $filters = [
                'organization_id' => $organizationId,
                'is_active' => $this->request->getGet('is_active'),
                'is_billable' => $this->request->getGet('is_billable'),
                'search' => $this->request->getGet('search'),
                'page' => $this->request->getGet('page') ?? 1,
                'per_page' => $this->request->getGet('per_page') ?? 20,
            ];

            $filters = array_filter($filters, fn($value) => $value !== null);

            $result = $this->projectService->getProjects($filters);

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
     * GET /api/v1/projects/{id}
     */
    public function show($id = null)
    {
        try {
            $project = $this->projectService->getProjectById($id);

            if (!$project) {
                return $this->failNotFound('Project not found');
            }

            return $this->respond([
                'success' => true,
                'data' => $project
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/projects
     */
    public function create()
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }
            
            $data = $this->request->getJSON(true);

            $rules = [
                'name' => 'required|max_length[255]',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $project = $this->projectService->createProject($organizationId, $data);

            return $this->respondCreated([
                'success' => true,
                'message' => 'Project created successfully',
                'data' => $project
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/projects/{id}
     */
    public function update($id = null)
    {
        try {
            $data = $this->request->getJSON(true);

            $updated = $this->projectService->updateProject($id, $data);

            if (!$updated) {
                return $this->fail('Failed to update project', 400);
            }

            return $this->respond([
                'success' => true,
                'message' => 'Project updated successfully',
                'data' => $this->projectService->getProjectById($id)
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * DELETE /api/v1/projects/{id}
     */
    public function delete($id = null)
    {
        try {
            $deleted = $this->projectService->deleteProject($id);

            if (!$deleted) {
                return $this->fail('Failed to delete project', 400);
            }

            return $this->respondDeleted([
                'success' => true,
                'message' => 'Project deleted successfully'
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/projects/{id}/archive
     */
    public function archive($id = null)
    {
        try {
            $archived = $this->projectService->archiveProject($id);

            if (!$archived) {
                return $this->fail('Failed to archive project', 400);
            }

            return $this->respond([
                'success' => true,
                'message' => 'Project archived successfully'
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
