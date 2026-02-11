<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateProductivityRulesTable extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => [
                'type' => 'BIGINT',
                'constraint' => 20,
                'unsigned' => true,
                'auto_increment' => true,
            ],
            'organization_id' => [
                'type' => 'BIGINT',
                'constraint' => 20,
                'unsigned' => true,
            ],
            'rule_type' => [
                'type' => 'ENUM',
                'constraint' => ['app', 'url', 'keyword'],
            ],
            'pattern' => [
                'type' => 'VARCHAR',
                'constraint' => 500,
            ],
            'category' => [
                'type' => 'ENUM',
                'constraint' => ['productive', 'unproductive', 'neutral'],
            ],
            'is_active' => [
                'type' => 'BOOLEAN',
                'default' => true,
            ],
            'created_by' => [
                'type' => 'BIGINT',
                'constraint' => 20,
                'unsigned' => true,
            ],
            'created_at' => [
                'type' => 'TIMESTAMP',
                'null' => false,
            ],
            'updated_at' => [
                'type' => 'TIMESTAMP',
                'null' => false,
            ],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey('organization_id');
        $this->forge->addKey('rule_type');
        $this->forge->addForeignKey('organization_id', 'organizations', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('created_by', 'users', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('productivity_rules');
    }

    public function down()
    {
        $this->forge->dropTable('productivity_rules');
    }
}
