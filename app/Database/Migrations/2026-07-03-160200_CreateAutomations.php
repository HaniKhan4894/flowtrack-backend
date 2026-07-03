<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Phase 10 — Automations engine (if trigger → then action).
 *
 * A no-code rule: when a trigger event fires and optional conditions match,
 * run one or more actions (Slack post, webhook, in-app notify, …).
 */
class CreateAutomations extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'organization_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 150],
            'trigger_event' => ['type' => 'VARCHAR', 'constraint' => 80],
            // JSON: [{field, op, value}]
            'conditions' => ['type' => 'TEXT', 'null' => true],
            // JSON: [{type, config}]
            'actions' => ['type' => 'TEXT', 'null' => true],
            'is_active' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'run_count' => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'last_run_at' => ['type' => 'DATETIME', 'null' => true],
            'created_by' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['organization_id', 'trigger_event']);
        $this->forge->addForeignKey('organization_id', 'organizations', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('automations');
    }

    public function down()
    {
        $this->forge->dropTable('automations');
    }
}
