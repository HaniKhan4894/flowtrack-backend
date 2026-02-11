<?php

namespace App\Services;

use App\Models\PermissionModel;
use App\Models\RoleModel;
use App\Models\OrganizationMemberModel;

class PermissionService
{
    protected $permissionModel;
    protected $roleModel;
    protected $memberModel;
    protected $db;

    public function __construct()
    {
        $this->permissionModel = new PermissionModel();
        $this->roleModel = new RoleModel();
        $this->memberModel = new OrganizationMemberModel();
        $this->db = \Config\Database::connect();
    }

    /**
     * Check if user has permission
     */
    public function userHasPermission(int $userId, int $organizationId, string $permissionSlug): bool
    {
        // Get user's role in organization
        $member = $this->memberModel
            ->where('user_id', $userId)
            ->where('organization_id', $organizationId)
            ->first();

        if (!$member || !$member['role_id']) {
            return false;
        }

        // Get role permissions
        $permissions = $this->roleModel->getPermissions($member['role_id']);
        
        // Check if permission exists
        foreach ($permissions as $permission) {
            if ($permission['slug'] === $permissionSlug) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get user permissions in organization
     */
    public function getUserPermissions(int $userId, int $organizationId): array
    {
        $member = $this->memberModel
            ->where('user_id', $userId)
            ->where('organization_id', $organizationId)
            ->first();

        if (!$member || !$member['role_id']) {
            return [];
        }

        return $this->roleModel->getPermissions($member['role_id']);
    }

    /**
     * Create custom role for organization
     */
    public function createRole(int $organizationId, array $data, array $permissionIds = []): array
    {
        $this->db->transStart();

        try {
            $roleData = [
                'organization_id' => $organizationId,
                'name' => $data['name'],
                'slug' => url_title($data['name'], '-', true),
                'description' => $data['description'] ?? null,
                'is_system' => false,
            ];

            $roleId = $this->roleModel->insert($roleData);

            // Assign permissions
            if (!empty($permissionIds)) {
                foreach ($permissionIds as $permissionId) {
                    $this->roleModel->assignPermission($roleId, $permissionId);
                }
            }

            $this->db->transComplete();

            return $this->roleModel->find($roleId);

        } catch (\Exception $e) {
            $this->db->transRollback();
            throw $e;
        }
    }

    /**
     * Update role permissions
     */
    public function updateRolePermissions(int $roleId, array $permissionIds): bool
    {
        // Check if system role
        $role = $this->roleModel->find($roleId);
        if ($role['is_system']) {
            throw new \Exception('Cannot modify system role permissions');
        }

        $this->db->transStart();

        try {
            // Remove all existing permissions
            $this->db->table('role_permissions')->where('role_id', $roleId)->delete();

            // Add new permissions
            foreach ($permissionIds as $permissionId) {
                $this->roleModel->assignPermission($roleId, $permissionId);
            }

            $this->db->transComplete();
            return true;

        } catch (\Exception $e) {
            $this->db->transRollback();
            throw $e;
        }
    }

    /**
     * Get all permissions grouped by category
     */
    public function getAllPermissionsGrouped(): array
    {
        $permissions = $this->permissionModel->findAll();
        
        $grouped = [];
        foreach ($permissions as $permission) {
            $category = $permission['category'];
            if (!isset($grouped[$category])) {
                $grouped[$category] = [];
            }
            $grouped[$category][] = $permission;
        }

        return $grouped;
    }

    /**
     * Get organization roles
     */
    public function getOrganizationRoles(int $organizationId): array
    {
        // Get system roles + organization custom roles
        return $this->roleModel
            ->groupStart()
                ->where('organization_id', null)
                ->orWhere('organization_id', $organizationId)
            ->groupEnd()
            ->findAll();
    }
}
