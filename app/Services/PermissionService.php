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
            if (!empty($member['role'])) {
                $role = $this->roleModel->where('slug', $member['role'])->first();
                if ($role) {
                    $this->memberModel->update($member['id'], ['role_id' => $role['id']]);
                    $member['role_id'] = $role['id'];
                }
            }

            if (empty($member['role_id'])) {
                return false;
            }
        }

        $role = $this->roleModel->find($member['role_id']);
        if ($role && in_array($role['slug'], ['owner', 'admin'], true)) {
            return true;
        }

        // Get role permissions
        $permissions = $this->roleModel->getPermissions($member['role_id']);
        
        // Check if permission exists
        foreach ($permissions as $permission) {
            if ($permission['slug'] === $permissionSlug) {
                return true;
            }
        }

        // Team-level report access includes own-level access
        if ($permissionSlug === 'reports.view_own') {
            foreach ($permissions as $permission) {
                if (in_array($permission['slug'], ['reports.view_team', 'reports.view_all'], true)) {
                    return true;
                }
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
            if (!empty($member['role'])) {
                $role = $this->roleModel->where('slug', $member['role'])->first();
                if ($role) {
                    $this->memberModel->update($member['id'], ['role_id' => $role['id']]);
                    $member['role_id'] = $role['id'];
                }
            }

            if (empty($member['role_id'])) {
                return [];
            }
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
        if ((bool) ($role['is_system'] ?? false)) {
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
        $roles = $this->roleModel
            ->groupStart()
                ->where('organization_id', null)
                ->orWhere('organization_id', $organizationId)
            ->groupEnd()
            ->findAll();

        return array_map(function (array $role) {
            $role['is_system'] = (bool) ($role['is_system'] ?? false);
            $role['permission_ids'] = array_map(
                fn (array $p) => (int) $p['id'],
                $this->roleModel->getPermissions((int) $role['id'])
            );
            return $role;
        }, $roles);
    }

    /**
     * Update custom role metadata
     */
    public function updateRole(int $roleId, int $organizationId, array $data): array
    {
        $role = $this->roleModel->find($roleId);
        if (!$role || (bool) ($role['is_system'] ?? false) || (int) ($role['organization_id'] ?? 0) !== $organizationId) {
            throw new \Exception('Role not found or cannot be modified');
        }

        $update = [];
        if (isset($data['name'])) {
            $name = trim((string) $data['name']);
            if ($name === '') {
                throw new \Exception('Role name cannot be empty');
            }
            $update['name'] = $name;
            $update['slug'] = url_title($name, '-', true);
        }
        if (array_key_exists('description', $data)) {
            $update['description'] = $data['description'];
        }

        if (!empty($update)) {
            $this->roleModel->update($roleId, $update);
        }

        return $this->roleModel->find($roleId);
    }

    /**
     * Delete custom role (reassign members to member role)
     */
    public function deleteRole(int $roleId, int $organizationId): bool
    {
        $role = $this->roleModel->find($roleId);
        if (!$role || (bool) ($role['is_system'] ?? false) || (int) ($role['organization_id'] ?? 0) !== $organizationId) {
            throw new \Exception('Role not found or cannot be deleted');
        }

        $memberRole = $this->roleModel->where('slug', 'member')->where('organization_id', null)->first();
        $fallbackRoleId = $memberRole ? (int) $memberRole['id'] : null;

        $this->db->transStart();

        if ($fallbackRoleId) {
            $this->db->table('organization_members')
                ->where('organization_id', $organizationId)
                ->where('role_id', $roleId)
                ->update(['role_id' => $fallbackRoleId, 'role' => 'member']);
        }

        $this->db->table('role_permissions')->where('role_id', $roleId)->delete();
        $this->roleModel->delete($roleId);

        $this->db->transComplete();

        return $this->db->transStatus();
    }
}
