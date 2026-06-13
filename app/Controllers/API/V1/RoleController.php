<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\PermissionService;

class RoleController extends ResourceController
{
    protected $permissionService;
    protected $format = 'json';

    public function __construct()
    {
        $this->permissionService = new PermissionService();
    }

    /**
     * GET /api/v1/roles?organization_id=1
     * Get all roles for organization
     */
    public function index()
    {
        try {
            $organizationId = $this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? $this->request->getGet('organization_id');

            if (!$organizationId) {
                return $this->fail('organization_id is required', 400);
            }

            $roles = $this->permissionService->getOrganizationRoles($organizationId);

            return $this->respond([
                'success' => true,
                'data' => $roles
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/roles
     * Create custom role
     */
    public function create()
    {
        try {
            $organizationId = $this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? $this->request->getGet('organization_id');
            $data = $this->request->getJSON(true);

            if (!$organizationId) {
                return $this->fail('organization_id is required', 400);
            }

            $rules = [
                'name' => 'required|max_length[100]',
                'permission_ids' => 'permit_empty',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $role = $this->permissionService->createRole(
                $organizationId,
                $data,
                $data['permission_ids'] ?? []
            );

            return $this->respondCreated([
                'success' => true,
                'message' => 'Role created successfully',
                'data' => $role
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/roles/{id}
     */
    public function update($id = null)
    {
        try {
            $organizationId = $this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? $this->request->getGet('organization_id');
            $data = $this->request->getJSON(true);

            if (!$organizationId) {
                return $this->fail('organization_id is required', 400);
            }

            $role = $this->permissionService->updateRole((int) $id, (int) $organizationId, $data ?? []);

            return $this->respond([
                'success' => true,
                'message' => 'Role updated successfully',
                'data' => $role,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * DELETE /api/v1/roles/{id}
     */
    public function delete($id = null)
    {
        try {
            $organizationId = $this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? $this->request->getGet('organization_id');

            if (!$organizationId) {
                return $this->fail('organization_id is required', 400);
            }

            $this->permissionService->deleteRole((int) $id, (int) $organizationId);

            return $this->respondDeleted([
                'success' => true,
                'message' => 'Role deleted successfully',
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/roles/{id}/permissions
     * Update role permissions
     */
    public function updatePermissions($id = null)
    {
        try {
            $data = $this->request->getJSON(true);

            if (!isset($data['permission_ids']) || !is_array($data['permission_ids'])) {
                return $this->fail('permission_ids array is required', 400);
            }

            $updated = $this->permissionService->updateRolePermissions($id, $data['permission_ids']);

            return $this->respond([
                'success' => true,
                'message' => 'Role permissions updated successfully'
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/permissions
     * Get all permissions grouped by category
     */
    public function permissions()
    {
        try {
            $permissions = $this->permissionService->getAllPermissionsGrouped();

            return $this->respond([
                'success' => true,
                'data' => $permissions
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/users/{userId}/permissions?organization_id=1
     * Get user permissions in organization
     */
    public function userPermissions($userId = null)
    {
        try {
            $organizationId = $this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? $this->request->getGet('organization_id');

            if (!$organizationId) {
                return $this->fail('organization_id is required', 400);
            }

            $permissions = $this->permissionService->getUserPermissions($userId, $organizationId);

            return $this->respond([
                'success' => true,
                'data' => $permissions
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
