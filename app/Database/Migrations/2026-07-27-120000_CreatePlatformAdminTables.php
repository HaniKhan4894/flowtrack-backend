<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Platform (super-admin) portal tables.
 *
 * `platform_announcements` drives the in-app banner broadcast by the platform
 * team; `platform_settings` is a global key/value store for switches such as
 * maintenance mode; `admin_impersonation_logs` records every "login as" session
 * so support access stays auditable.
 */
class CreatePlatformAdminTables extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'title' => ['type' => 'VARCHAR', 'constraint' => 191],
            'message' => ['type' => 'TEXT'],
            'level' => ['type' => 'ENUM', 'constraint' => ['info', 'success', 'warning', 'critical'], 'default' => 'info'],
            // all = every org, plan = orgs on a plan, organization = a single org
            'audience' => ['type' => 'ENUM', 'constraint' => ['all', 'plan', 'organization'], 'default' => 'all'],
            'plan_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'organization_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'is_active' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'is_dismissible' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'send_email' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 0],
            'emailed_at' => ['type' => 'DATETIME', 'null' => true],
            'email_recipients' => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'starts_at' => ['type' => 'DATETIME', 'null' => true],
            'ends_at' => ['type' => 'DATETIME', 'null' => true],
            'created_by' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['is_active', 'starts_at']);
        $this->forge->createTable('platform_announcements', true);

        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'announcement_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'user_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey(['announcement_id', 'user_id']);
        $this->forge->createTable('platform_announcement_dismissals', true);

        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'setting_key' => ['type' => 'VARCHAR', 'constraint' => 100],
            'setting_value' => ['type' => 'TEXT', 'null' => true],
            'updated_by' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('setting_key');
        $this->forge->createTable('platform_settings', true);

        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'admin_user_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'target_user_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'organization_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'reason' => ['type' => 'VARCHAR', 'constraint' => 500, 'null' => true],
            'ip_address' => ['type' => 'VARCHAR', 'constraint' => 45, 'null' => true],
            'expires_at' => ['type' => 'DATETIME', 'null' => true],
            'ended_at' => ['type' => 'DATETIME', 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('admin_user_id');
        $this->forge->addKey('target_user_id');
        $this->forge->createTable('admin_impersonation_logs', true);
    }

    public function down()
    {
        foreach ([
            'admin_impersonation_logs',
            'platform_settings',
            'platform_announcement_dismissals',
            'platform_announcements',
        ] as $table) {
            $this->forge->dropTable($table, true);
        }
    }
}
