<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddPayrollPermissions extends Migration
{
    public function up()
    {
        $permissions = [
            ['name' => 'View Payroll', 'slug' => 'payroll.view', 'category' => 'payroll', 'description' => 'View payroll runs and compensation'],
            ['name' => 'Manage Payroll', 'slug' => 'payroll.manage', 'category' => 'payroll', 'description' => 'Create and edit payroll runs and compensation'],
            ['name' => 'Record Payroll Payments', 'slug' => 'payroll.pay', 'category' => 'payroll', 'description' => 'Record salary payments and transfers'],
            ['name' => 'Export Payroll', 'slug' => 'payroll.export', 'category' => 'payroll', 'description' => 'Export payroll reports'],
        ];

        foreach ($permissions as $permission) {
            $exists = $this->db->table('permissions')->where('slug', $permission['slug'])->countAllResults();
            if ($exists === 0) {
                $this->db->table('permissions')->insert($permission);
            }
        }

        $permMap = [];
        foreach ($this->db->table('permissions')->get()->getResultArray() as $p) {
            $permMap[$p['slug']] = $p['id'];
        }

        $roleMap = [];
        foreach ($this->db->table('roles')->get()->getResultArray() as $r) {
            $roleMap[$r['slug']] = $r['id'];
        }

        $ownerAdminSlugs = ['payroll.view', 'payroll.manage', 'payroll.pay', 'payroll.export'];
        foreach (['owner', 'admin'] as $roleSlug) {
            if (!isset($roleMap[$roleSlug])) {
                continue;
            }
            foreach ($ownerAdminSlugs as $slug) {
                if (!isset($permMap[$slug])) {
                    continue;
                }
                $exists = $this->db->table('role_permissions')
                    ->where('role_id', $roleMap[$roleSlug])
                    ->where('permission_id', $permMap[$slug])
                    ->countAllResults();
                if ($exists === 0) {
                    $this->db->table('role_permissions')->insert([
                        'role_id' => $roleMap[$roleSlug],
                        'permission_id' => $permMap[$slug],
                    ]);
                }
            }
        }

        if (isset($roleMap['manager'], $permMap['payroll.view'])) {
            $exists = $this->db->table('role_permissions')
                ->where('role_id', $roleMap['manager'])
                ->where('permission_id', $permMap['payroll.view'])
                ->countAllResults();
            if ($exists === 0) {
                $this->db->table('role_permissions')->insert([
                    'role_id' => $roleMap['manager'],
                    'permission_id' => $permMap['payroll.view'],
                ]);
            }
        }

        $planIds = $this->db->table('plans')
            ->whereIn('slug', ['professional', 'enterprise'])
            ->get()
            ->getResultArray();

        foreach ($planIds as $plan) {
            $exists = $this->db->table('plan_features')
                ->where('plan_id', $plan['id'])
                ->where('feature_key', 'payroll')
                ->countAllResults();
            if ($exists === 0) {
                $this->db->table('plan_features')->insert([
                    'plan_id' => $plan['id'],
                    'feature_key' => 'payroll',
                    'feature_value' => 'true',
                    'display_name' => 'Team Payroll',
                ]);
            }
        }
    }

    public function down()
    {
        $slugs = ['payroll.view', 'payroll.manage', 'payroll.pay', 'payroll.export'];
        $permIds = $this->db->table('permissions')->whereIn('slug', $slugs)->get()->getResultArray();
        foreach ($permIds as $p) {
            $this->db->table('role_permissions')->where('permission_id', $p['id'])->delete();
            $this->db->table('permissions')->where('id', $p['id'])->delete();
        }
        $this->db->table('plan_features')->where('feature_key', 'payroll')->delete();
    }
}
