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

            $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $memberService = new \App\Services\ProjectMemberService();
            // Only filter when member has explicit project assignments.
            // No assignments = normal access to all org projects.
            if ($userId > 0 && $memberService->isProjectAccessRestricted($organizationId, $userId)) {
                $filters['assigned_user_id'] = $userId;
            } else {
                $filters['see_all'] = true;
            }

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

            $actorId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if ($actorId > 0 && !empty($project['id'])) {
                $memberService = new \App\Services\ProjectMemberService();
                // Admins/managers already see all projects — only auto-assign restricted roles
                // so the creator keeps access if they later get other assignments.
                if (!$memberService->canSeeAllProjects($organizationId, $actorId)) {
                    $memberService->assignUserProjects(
                        $organizationId,
                        $actorId,
                        [(int) $project['id']],
                        $actorId
                    );
                }
            }

            return $this->respondCreated([
                'success' => true,
                'message' => 'Project created successfully',
                'data' => $project
            ]);

        } catch (\Exception $e) {
            if (str_contains($e->getMessage(), 'limit reached')) {
                return $this->respond([
                    'status' => 403,
                    'error' => 403,
                    'error_code' => 'PLAN_LIMIT_REACHED',
                    'message' => $e->getMessage(),
                    'messages' => ['error' => $e->getMessage()],
                ], 403);
            }
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

    /**
     * GET /api/v1/projects/{id}/members
     */
    public function members($id = null)
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $service = new \App\Services\ProjectMemberService();
            return $this->respond([
                'success' => true,
                'data' => $service->listMembersForProject($organizationId, (int) $id),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/projects/{id}/members
     * Body: { user_ids: number[] } — replaces project member list
     */
    public function syncMembers($id = null)
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }
            $actorId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $data = $this->request->getJSON(true) ?? [];
            $userIds = is_array($data['user_ids'] ?? null) ? $data['user_ids'] : [];

            $project = $this->projectService->getProjectById((int) $id);
            if (!$project || (int) $project['organization_id'] !== $organizationId) {
                return $this->failNotFound('Project not found');
            }

            $service = new \App\Services\ProjectMemberService();
            // Sync by iterating: get current, remove missing, add new
            $current = $service->listMembersForProject($organizationId, (int) $id);
            $currentIds = array_map(static fn ($m) => (int) $m['user_id'], $current);
            $desired = array_values(array_unique(array_filter(array_map('intval', $userIds))));

            foreach (array_diff($currentIds, $desired) as $removeId) {
                $assigned = $service->getProjectIdsForUser($organizationId, $removeId);
                $service->syncUserProjects(
                    $organizationId,
                    $removeId,
                    array_values(array_diff($assigned, [(int) $id])),
                    $actorId ?: null
                );
            }
            foreach (array_diff($desired, $currentIds) as $addId) {
                $service->assignUserProjects($organizationId, $addId, [(int) $id], $actorId ?: null);
            }

            return $this->respond([
                'success' => true,
                'message' => 'Project members updated',
                'data' => $service->listMembersForProject($organizationId, (int) $id),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
