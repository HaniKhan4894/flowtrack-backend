<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Dedicated leave approval permission so managers can review PTO
 * without needing users.edit.
 */
class AddLeaveApprovePermission extends Migration
{
    public function up()
    {
        $permission = [
            'name' => 'Approve Leave',
            'slug' => 'leave.approve',
            'category' => 'leave',
            'description' => 'Approve or reject leave / PTO requests',
        ];

        $exists = $this->db->table('permissions')->where('slug', $permission['slug'])->countAllResults();
        if ($exists === 0) {
            $this->db->table('permissions')->insert($permission);
        }

        $perm = $this->db->table('permissions')->where('slug', 'leave.approve')->get()->getRowArray();
        if (!$perm) {
            return;
        }

        $roleSlugs = ['owner', 'admin', 'manager', 'team_lead'];
        $roles = $this->db->table('roles')->whereIn('slug', $roleSlugs)->get()->getResultArray();

        foreach ($roles as $role) {
            $linked = $this->db->table('role_permissions')
                ->where('role_id', $role['id'])
                ->where('permission_id', $perm['id'])
                ->countAllResults();
            if ($linked === 0) {
                $this->db->table('role_permissions')->insert([
                    'role_id' => $role['id'],
                    'permission_id' => $perm['id'],
                ]);
            }
        }
    }

    public function down()
    {
        $perm = $this->db->table('permissions')->where('slug', 'leave.approve')->get()->getRowArray();
        if ($perm) {
            $this->db->table('role_permissions')->where('permission_id', $perm['id'])->delete();
            $this->db->table('permissions')->where('id', $perm['id'])->delete();
        }
    }
}
