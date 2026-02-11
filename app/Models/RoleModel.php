<?php

namespace App\Models;

use CodeIgniter\Model;

class RoleModel extends Model
{
    protected $table            = 'roles';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = ['organization_id', 'name', 'slug', 'is_system', 'description'];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    protected $validationRules = [
        'name' => 'required|max_length[100]',
        'slug' => 'required|max_length[100]',
    ];

    /**
     * Get permissions for a role
     */
    public function getPermissions(int $roleId): array
    {
        return $this->db->table('role_permissions')
            ->select('permissions.*')
            ->join('permissions', 'permissions.id = role_permissions.permission_id')
            ->where('role_permissions.role_id', $roleId)
            ->get()
            ->getResultArray();
    }

    /**
     * Assign permission to role
     */
    public function assignPermission(int $roleId, int $permissionId): bool
    {
        return $this->db->table('role_permissions')->insert([
            'role_id' => $roleId,
            'permission_id' => $permissionId
        ]);
    }

    /**
     * Remove permission from role
     */
    public function removePermission(int $roleId, int $permissionId): bool
    {
        return $this->db->table('role_permissions')
            ->where('role_id', $roleId)
            ->where('permission_id', $permissionId)
            ->delete();
    }
}
