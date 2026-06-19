<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateSmartNotificationRulesTable extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'organization_id' => ['type' => 'INT', 'unsigned' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 255],
            'rule_type' => ['type' => 'VARCHAR', 'constraint' => 64],
            'threshold' => ['type' => 'DECIMAL', 'constraint' => '8,2', 'null' => true],
            'target_scope' => ['type' => 'VARCHAR', 'constraint' => 32, 'default' => 'all_members'],
            'frequency' => ['type' => 'VARCHAR', 'constraint' => 32, 'default' => 'daily'],
            'channels' => ['type' => 'JSON', 'null' => true],
            'config' => ['type' => 'JSON', 'null' => true],
            'is_active' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'created_by' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['organization_id', 'is_active']);
        $this->forge->addForeignKey('organization_id', 'organizations', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('smart_notification_rules', true);
    }

    public function down()
    {
        $this->forge->dropTable('smart_notification_rules', true);
    }
}
