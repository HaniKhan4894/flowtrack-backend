<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddTimeManualEntryPermission extends Migration
{
    public function up()
    {
        $slug = 'time.manual_entry';
        $exists = $this->db->table('permissions')->where('slug', $slug)->countAllResults();
        if ($exists === 0) {
            $this->db->table('permissions')->insert([
                'name' => 'Manual Time Entry',
                'slug' => $slug,
                'category' => 'time',
                'description' => 'Add, edit, and delete manual time log entries',
            ]);
        }

        $perm = $this->db->table('permissions')->where('slug', $slug)->get()->getRowArray();
        if (!$perm) {
            return;
        }

        $permId = (int) $perm['id'];
        $roleSlugs = ['owner', 'admin', 'manager', 'team_lead'];

        foreach ($roleSlugs as $roleSlug) {
            $role = $this->db->table('roles')->where('slug', $roleSlug)->get()->getRowArray();
            if (!$role) {
                continue;
            }

            $linked = $this->db->table('role_permissions')
                ->where('role_id', (int) $role['id'])
                ->where('permission_id', $permId)
                ->countAllResults();

            if ($linked === 0) {
                $this->db->table('role_permissions')->insert([
                    'role_id' => (int) $role['id'],
                    'permission_id' => $permId,
                ]);
            }
        }
    }

    public function down()
    {
        $perm = $this->db->table('permissions')->where('slug', 'time.manual_entry')->get()->getRowArray();
        if ($perm) {
            $this->db->table('role_permissions')->where('permission_id', (int) $perm['id'])->delete();
            $this->db->table('permissions')->where('id', (int) $perm['id'])->delete();
        }
    }
}
