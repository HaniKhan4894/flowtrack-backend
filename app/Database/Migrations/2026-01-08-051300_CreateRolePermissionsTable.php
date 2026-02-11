<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateRolePermissionsTable extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'role_id' => [
                'type' => 'BIGINT',
                'constraint' => 20,
                'unsigned' => true,
            ],
            'permission_id' => [
                'type' => 'BIGINT',
                'constraint' => 20,
                'unsigned' => true,
            ],
        ]);

        $this->forge->addKey(['role_id', 'permission_id'], true);
        $this->forge->addForeignKey('role_id', 'roles', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('permission_id', 'permissions', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('role_permissions');

        // Assign permissions to system roles
        $this->assignOwnerPermissions();
        $this->assignAdminPermissions();
        $this->assignManagerPermissions();
        $this->assignMemberPermissions();
    }

    private function assignOwnerPermissions()
    {
        // Owner gets ALL permissions
        $permissions = $this->db->table('permissions')->select('id')->get()->getResultArray();
        $roleId = $this->db->table('roles')->where('slug', 'owner')->get()->getRow()->id;

        $data = array_map(function($perm) use ($roleId) {
            return ['role_id' => $roleId, 'permission_id' => $perm['id']];
        }, $permissions);

        $this->db->table('role_permissions')->insertBatch($data);
    }

    private function assignAdminPermissions()
    {
        // Admin gets most permissions except billing
        $permissions = $this->db->table('permissions')
            ->whereNotIn('slug', ['settings.billing'])
            ->get()->getResultArray();
        
        $roleId = $this->db->table('roles')->where('slug', 'admin')->get()->getRow()->id;

        $data = array_map(function($perm) use ($roleId) {
            return ['role_id' => $roleId, 'permission_id' => $perm['id']];
        }, $permissions);

        $this->db->table('role_permissions')->insertBatch($data);
    }

    private function assignManagerPermissions()
    {
        // Manager gets team-level permissions
        $permissionSlugs = [
            'users.view', 'projects.view', 'projects.create', 'projects.edit',
            'time.view_team', 'time.edit_team',
            'screenshots.view_team',
            'reports.view_team', 'reports.export',
        ];

        $permissions = $this->db->table('permissions')
            ->whereIn('slug', $permissionSlugs)
            ->get()->getResultArray();
        
        $roleId = $this->db->table('roles')->where('slug', 'manager')->get()->getRow()->id;

        $data = array_map(function($perm) use ($roleId) {
            return ['role_id' => $roleId, 'permission_id' => $perm['id']];
        }, $permissions);

        $this->db->table('role_permissions')->insertBatch($data);
    }

    private function assignMemberPermissions()
    {
        // Member gets own-level permissions only
        $permissionSlugs = [
            'projects.view',
            'time.view_own', 'time.edit_own',
            'screenshots.view_own', 'screenshots.blur',
            'reports.view_own',
        ];

        $permissions = $this->db->table('permissions')
            ->whereIn('slug', $permissionSlugs)
            ->get()->getResultArray();
        
        $roleId = $this->db->table('roles')->where('slug', 'member')->get()->getRow()->id;

        $data = array_map(function($perm) use ($roleId) {
            return ['role_id' => $roleId, 'permission_id' => $perm['id']];
        }, $permissions);

        $this->db->table('role_permissions')->insertBatch($data);
    }

    public function down()
    {
        $this->forge->dropTable('role_permissions');
    }
}
