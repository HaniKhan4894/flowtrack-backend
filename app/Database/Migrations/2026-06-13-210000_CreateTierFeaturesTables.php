<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateTierFeaturesTables extends Migration
{
    public function up()
    {
        // Timesheet periods
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'organization_id' => ['type' => 'INT', 'unsigned' => true],
            'user_id' => ['type' => 'INT', 'unsigned' => true],
            'week_start' => ['type' => 'DATE'],
            'status' => ['type' => 'ENUM', 'constraint' => ['draft', 'submitted', 'approved', 'rejected'], 'default' => 'draft'],
            'submitted_at' => ['type' => 'DATETIME', 'null' => true],
            'approved_by' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'approved_at' => ['type' => 'DATETIME', 'null' => true],
            'rejection_reason' => ['type' => 'TEXT', 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['organization_id', 'user_id', 'week_start'], false, true);
        $this->forge->createTable('timesheet_periods', true);

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'period_id' => ['type' => 'INT', 'unsigned' => true],
            'time_entry_id' => ['type' => 'INT', 'unsigned' => true],
            'status' => ['type' => 'ENUM', 'constraint' => ['pending', 'included', 'excluded'], 'default' => 'included'],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['period_id', 'time_entry_id'], false, true);
        $this->forge->createTable('timesheet_entries', true);

        // Notification preferences
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'user_id' => ['type' => 'INT', 'unsigned' => true],
            'event_key' => ['type' => 'VARCHAR', 'constraint' => 100],
            'email_enabled' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'in_app_enabled' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['user_id', 'event_key'], false, true);
        $this->forge->createTable('notification_preferences', true);

        // Clients
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'organization_id' => ['type' => 'INT', 'unsigned' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 255],
            'email' => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'phone' => ['type' => 'VARCHAR', 'constraint' => 50, 'null' => true],
            'default_rate' => ['type' => 'DECIMAL', 'constraint' => '10,2', 'null' => true],
            'notes' => ['type' => 'TEXT', 'null' => true],
            'is_active' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('organization_id');
        $this->forge->createTable('clients', true);

        if (!$this->db->fieldExists('client_id', 'projects')) {
            $this->forge->addColumn('projects', [
                'client_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true, 'after' => 'client_name'],
            ]);
        }
        if (!$this->db->fieldExists('client_id', 'invoices')) {
            $this->forge->addColumn('invoices', [
                'client_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true, 'after' => 'client_email'],
            ]);
        }

        // PTO / Leave
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'organization_id' => ['type' => 'INT', 'unsigned' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 100],
            'days_per_year' => ['type' => 'DECIMAL', 'constraint' => '5,1', 'default' => 0],
            'is_paid' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->createTable('leave_types', true);

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'user_id' => ['type' => 'INT', 'unsigned' => true],
            'organization_id' => ['type' => 'INT', 'unsigned' => true],
            'leave_type_id' => ['type' => 'INT', 'unsigned' => true],
            'balance_days' => ['type' => 'DECIMAL', 'constraint' => '5,1', 'default' => 0],
            'used_days' => ['type' => 'DECIMAL', 'constraint' => '5,1', 'default' => 0],
            'year' => ['type' => 'INT', 'unsigned' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['user_id', 'leave_type_id', 'year'], false, true);
        $this->forge->createTable('leave_balances', true);

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'user_id' => ['type' => 'INT', 'unsigned' => true],
            'organization_id' => ['type' => 'INT', 'unsigned' => true],
            'leave_type_id' => ['type' => 'INT', 'unsigned' => true],
            'start_date' => ['type' => 'DATE'],
            'end_date' => ['type' => 'DATE'],
            'days' => ['type' => 'DECIMAL', 'constraint' => '5,1'],
            'reason' => ['type' => 'TEXT', 'null' => true],
            'status' => ['type' => 'ENUM', 'constraint' => ['pending', 'approved', 'rejected', 'cancelled'], 'default' => 'pending'],
            'reviewed_by' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'reviewed_at' => ['type' => 'DATETIME', 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->createTable('leave_requests', true);

        // Work schedules
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'user_id' => ['type' => 'INT', 'unsigned' => true],
            'organization_id' => ['type' => 'INT', 'unsigned' => true],
            'day_of_week' => ['type' => 'TINYINT', 'unsigned' => true],
            'start_time' => ['type' => 'TIME', 'null' => true],
            'end_time' => ['type' => 'TIME', 'null' => true],
            'expected_hours' => ['type' => 'DECIMAL', 'constraint' => '4,2', 'default' => 8],
            'is_working_day' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['user_id', 'organization_id', 'day_of_week'], false, true);
        $this->forge->createTable('member_schedules', true);

        // Overtime rules
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'organization_id' => ['type' => 'INT', 'unsigned' => true],
            'daily_threshold_hours' => ['type' => 'DECIMAL', 'constraint' => '4,2', 'default' => 8],
            'weekly_threshold_hours' => ['type' => 'DECIMAL', 'constraint' => '5,2', 'default' => 40],
            'multiplier' => ['type' => 'DECIMAL', 'constraint' => '3,2', 'default' => 1.5],
            'is_active' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('organization_id');
        $this->forge->createTable('overtime_rules', true);

        // Scheduled reports
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'organization_id' => ['type' => 'INT', 'unsigned' => true],
            'report_type' => ['type' => 'VARCHAR', 'constraint' => 50],
            'cadence' => ['type' => 'ENUM', 'constraint' => ['daily', 'weekly', 'monthly'], 'default' => 'weekly'],
            'recipients' => ['type' => 'JSON', 'null' => true],
            'format' => ['type' => 'ENUM', 'constraint' => ['csv', 'pdf', 'xlsx'], 'default' => 'csv'],
            'is_active' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'last_sent_at' => ['type' => 'DATETIME', 'null' => true],
            'created_by' => ['type' => 'INT', 'unsigned' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->createTable('scheduled_reports', true);

        // Audit log
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'organization_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'user_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'action' => ['type' => 'VARCHAR', 'constraint' => 100],
            'entity_type' => ['type' => 'VARCHAR', 'constraint' => 50, 'null' => true],
            'entity_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'changes' => ['type' => 'JSON', 'null' => true],
            'ip_address' => ['type' => 'VARCHAR', 'constraint' => 45, 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['organization_id', 'created_at']);
        $this->forge->createTable('audit_logs', true);

        // Refresh tokens (sessions)
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'user_id' => ['type' => 'INT', 'unsigned' => true],
            'token_hash' => ['type' => 'VARCHAR', 'constraint' => 255],
            'device_info' => ['type' => 'VARCHAR', 'constraint' => 500, 'null' => true],
            'ip_address' => ['type' => 'VARCHAR', 'constraint' => 45, 'null' => true],
            'expires_at' => ['type' => 'DATETIME'],
            'revoked_at' => ['type' => 'DATETIME', 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('token_hash');
        $this->forge->addKey('user_id');
        $this->forge->createTable('refresh_tokens', true);

        // Payroll tax templates
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'organization_id' => ['type' => 'INT', 'unsigned' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 100],
            'type' => ['type' => 'ENUM', 'constraint' => ['percentage', 'fixed'], 'default' => 'percentage'],
            'rate' => ['type' => 'DECIMAL', 'constraint' => '8,4', 'null' => true],
            'amount' => ['type' => 'DECIMAL', 'constraint' => '10,2', 'null' => true],
            'is_active' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->createTable('payroll_tax_templates', true);

        // Teams / departments
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'organization_id' => ['type' => 'INT', 'unsigned' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 100],
            'lead_user_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('organization_id');
        $this->forge->createTable('teams', true);

        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'team_id' => ['type' => 'INT', 'unsigned' => true],
            'user_id' => ['type' => 'INT', 'unsigned' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['team_id', 'user_id'], false, true);
        $this->forge->createTable('team_members', true);

        if (!$this->db->fieldExists('team_id', 'organization_members')) {
            $this->forge->addColumn('organization_members', [
                'team_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true, 'after' => 'role_id'],
            ]);
        }
        if (!$this->db->fieldExists('onboarding_state', 'organization_members')) {
            $this->forge->addColumn('organization_members', [
                'onboarding_state' => ['type' => 'JSON', 'null' => true, 'after' => 'screenshot_disabled_to'],
                'daily_hours_target' => ['type' => 'DECIMAL', 'constraint' => '4,2', 'null' => true, 'after' => 'onboarding_state'],
            ]);
        }

        // 2FA columns on users
        if (!$this->db->fieldExists('two_factor_secret', 'users')) {
            $this->forge->addColumn('users', [
                'two_factor_secret' => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
                'two_factor_enabled' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 0],
            ]);
        }

        // Daily idle stats
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'user_id' => ['type' => 'INT', 'unsigned' => true],
            'organization_id' => ['type' => 'INT', 'unsigned' => true],
            'date' => ['type' => 'DATE'],
            'idle_seconds' => ['type' => 'INT', 'unsigned' => true, 'default' => 0],
            'active_seconds' => ['type' => 'INT', 'unsigned' => true, 'default' => 0],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['user_id', 'organization_id', 'date'], false, true);
        $this->forge->createTable('daily_idle_stats', true);

        // Stripe price IDs on plans
        if (!$this->db->fieldExists('stripe_price_id_monthly', 'plans')) {
            $this->forge->addColumn('plans', [
                'stripe_price_id_monthly' => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => true],
                'stripe_price_id_yearly' => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => true],
            ]);
        }

        // Timesheet + productivity permissions
        $permissions = [
            ['name' => 'Submit Timesheet', 'slug' => 'timesheet.submit', 'category' => 'timesheet', 'description' => 'Submit weekly timesheets'],
            ['name' => 'Approve Timesheet', 'slug' => 'timesheet.approve', 'category' => 'timesheet', 'description' => 'Approve or reject timesheets'],
            ['name' => 'Manage Productivity Rules', 'slug' => 'productivity_rules.manage', 'category' => 'productivity', 'description' => 'Create and edit productivity rules'],
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

        $assignments = [
            'owner' => ['timesheet.submit', 'timesheet.approve', 'productivity_rules.manage'],
            'admin' => ['timesheet.submit', 'timesheet.approve', 'productivity_rules.manage'],
            'manager' => ['timesheet.submit', 'timesheet.approve', 'productivity_rules.manage'],
            'team_lead' => ['timesheet.submit', 'timesheet.approve'],
            'member' => ['timesheet.submit'],
        ];

        foreach ($assignments as $roleSlug => $slugs) {
            if (!isset($roleMap[$roleSlug])) {
                continue;
            }
            foreach ($slugs as $slug) {
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

        // Seed default leave types for existing orgs
        $orgs = $this->db->table('organizations')->get()->getResultArray();
        foreach ($orgs as $org) {
            $exists = $this->db->table('leave_types')->where('organization_id', $org['id'])->countAllResults();
            if ($exists === 0) {
                $this->db->table('leave_types')->insert([
                    'organization_id' => $org['id'],
                    'name' => 'Annual Leave',
                    'days_per_year' => 20,
                    'is_paid' => 1,
                    'created_at' => date('Y-m-d H:i:s'),
                ]);
            }
        }
    }

    public function down()
    {
        $tables = [
            'daily_idle_stats', 'team_members', 'teams', 'payroll_tax_templates',
            'refresh_tokens', 'audit_logs', 'scheduled_reports', 'overtime_rules',
            'member_schedules', 'leave_requests', 'leave_balances', 'leave_types',
            'notification_preferences', 'timesheet_entries', 'timesheet_periods', 'clients',
        ];
        foreach ($tables as $table) {
            $this->forge->dropTable($table, true);
        }

        $cols = ['client_id', 'stripe_price_id_monthly', 'stripe_price_id_yearly'];
        foreach (['projects', 'invoices', 'plans'] as $tbl) {
            foreach ($cols as $col) {
                if ($this->db->fieldExists($col, $tbl)) {
                    $this->forge->dropColumn($tbl, $col);
                }
            }
        }

        if ($this->db->fieldExists('team_id', 'organization_members')) {
            $this->forge->dropColumn('organization_members', ['team_id', 'onboarding_state', 'daily_hours_target']);
        }
        if ($this->db->fieldExists('two_factor_secret', 'users')) {
            $this->forge->dropColumn('users', ['two_factor_secret', 'two_factor_enabled']);
        }

        $slugs = ['timesheet.submit', 'timesheet.approve', 'productivity_rules.manage'];
        $permIds = $this->db->table('permissions')->whereIn('slug', $slugs)->get()->getResultArray();
        foreach ($permIds as $p) {
            $this->db->table('role_permissions')->where('permission_id', $p['id'])->delete();
            $this->db->table('permissions')->where('id', $p['id'])->delete();
        }
    }
}
