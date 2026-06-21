<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateAdvancedMonitoringSessions extends Migration
{
    public function up()
    {
        if (!$this->db->tableExists('advanced_monitoring_sessions')) {
            $this->forge->addField([
                'id' => ['type' => 'BIGINT', 'unsigned' => true, 'auto_increment' => true],
                'organization_id' => ['type' => 'INT', 'unsigned' => true],
                'user_id' => ['type' => 'INT', 'unsigned' => true],
                'started_by' => ['type' => 'INT', 'unsigned' => true],
                'reason' => ['type' => 'TEXT', 'null' => true],
                'status' => ['type' => 'ENUM', 'constraint' => ['active', 'closed'], 'default' => 'active'],
                'screenshot_frequency_minutes' => ['type' => 'TINYINT', 'unsigned' => true, 'default' => 1],
                'force_screenshots' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
                'notify_member' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 0],
                'member_notified_at' => ['type' => 'DATETIME', 'null' => true],
                'result_summary' => ['type' => 'TEXT', 'null' => true],
                'started_at' => ['type' => 'DATETIME'],
                'ended_at' => ['type' => 'DATETIME', 'null' => true],
                'created_at' => ['type' => 'DATETIME', 'null' => true],
                'updated_at' => ['type' => 'DATETIME', 'null' => true],
            ]);
            $this->forge->addKey('id', true);
            $this->forge->addKey(['organization_id', 'user_id', 'status']);
            $this->forge->addForeignKey('organization_id', 'organizations', 'id', 'CASCADE', 'CASCADE');
            $this->forge->addForeignKey('user_id', 'users', 'id', 'CASCADE', 'CASCADE');
            $this->forge->addForeignKey('started_by', 'users', 'id', 'CASCADE', 'CASCADE');
            $this->forge->createTable('advanced_monitoring_sessions');
        }

        $permissions = [
            [
                'name' => 'Advanced Monitoring',
                'slug' => 'monitoring.advanced',
                'category' => 'monitoring',
                'description' => 'Enable advanced monitoring on specific team members',
            ],
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

        foreach (['owner', 'admin', 'manager'] as $roleSlug) {
            if (!isset($roleMap[$roleSlug], $permMap['monitoring.advanced'])) {
                continue;
            }
            $exists = $this->db->table('role_permissions')
                ->where('role_id', $roleMap[$roleSlug])
                ->where('permission_id', $permMap['monitoring.advanced'])
                ->countAllResults();
            if ($exists === 0) {
                $this->db->table('role_permissions')->insert([
                    'role_id' => $roleMap[$roleSlug],
                    'permission_id' => $permMap['monitoring.advanced'],
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
                ->where('feature_key', 'advanced_monitoring')
                ->countAllResults();
            if ($exists === 0) {
                $this->db->table('plan_features')->insert([
                    'plan_id' => $plan['id'],
                    'feature_key' => 'advanced_monitoring',
                    'feature_value' => 'true',
                    'display_name' => 'Advanced member monitoring',
                    'is_enabled' => 1,
                    'show_on_pricing' => 1,
                    'sort_order' => 72,
                    'created_at' => date('Y-m-d H:i:s'),
                ]);
            }
        }
    }

    public function down()
    {
        if ($this->db->tableExists('advanced_monitoring_sessions')) {
            $this->forge->dropTable('advanced_monitoring_sessions', true);
        }

        $perm = $this->db->table('permissions')->where('slug', 'monitoring.advanced')->get()->getRowArray();
        if ($perm) {
            $this->db->table('role_permissions')->where('permission_id', $perm['id'])->delete();
            $this->db->table('permissions')->where('id', $perm['id'])->delete();
        }

        $this->db->table('plan_features')->where('feature_key', 'advanced_monitoring')->delete();
    }
}
