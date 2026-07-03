<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Phase 10 — Outbound webhooks.
 *
 * `webhook_endpoints` stores subscriber URLs + a signing secret; every delivery
 * attempt is logged in `webhook_deliveries` for observability + retry.
 */
class CreateWebhooks extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'organization_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'url' => ['type' => 'VARCHAR', 'constraint' => 500],
            'secret' => ['type' => 'VARCHAR', 'constraint' => 100],
            // JSON array of subscribed events, or ["*"] for all.
            'events' => ['type' => 'TEXT', 'null' => true],
            'is_active' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'last_status' => ['type' => 'INT', 'constraint' => 11, 'null' => true],
            'last_delivered_at' => ['type' => 'DATETIME', 'null' => true],
            'created_by' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('organization_id');
        $this->forge->addForeignKey('organization_id', 'organizations', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('webhook_endpoints');

        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'organization_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'endpoint_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'event' => ['type' => 'VARCHAR', 'constraint' => 100],
            'payload' => ['type' => 'MEDIUMTEXT', 'null' => true],
            'status_code' => ['type' => 'INT', 'constraint' => 11, 'null' => true],
            'success' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 0],
            'attempts' => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'response_snippet' => ['type' => 'TEXT', 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['organization_id', 'endpoint_id']);
        $this->forge->addForeignKey('endpoint_id', 'webhook_endpoints', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('webhook_deliveries');
    }

    public function down()
    {
        $this->forge->dropTable('webhook_deliveries');
        $this->forge->dropTable('webhook_endpoints');
    }
}
