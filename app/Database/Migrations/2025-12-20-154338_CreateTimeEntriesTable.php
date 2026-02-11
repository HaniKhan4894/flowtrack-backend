<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateTimeEntriesTable extends Migration
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
            'uuid' => [
                'type' => 'VARCHAR',
                'constraint' => 36,
                'unique' => true,
            ],
            'user_id' => [
                'type' => 'BIGINT',
                'constraint' => 20,
                'unsigned' => true,
            ],
            'organization_id' => [
                'type' => 'BIGINT',
                'constraint' => 20,
                'unsigned' => true,
            ],
            'project_id' => [
                'type' => 'BIGINT',
                'constraint' => 20,
                'unsigned' => true,
                'null' => true,
            ],
            'task_id' => [
                'type' => 'BIGINT',
                'constraint' => 20,
                'unsigned' => true,
                'null' => true,
            ],
            'description' => [
                'type' => 'TEXT',
                'null' => true,
            ],
            'started_at' => [
                'type' => 'TIMESTAMP',
                'null' => false,
            ],
            'ended_at' => [
                'type' => 'TIMESTAMP',
                'null' => true,
            ],
            'duration_seconds' => [
                'type' => 'INT',
                'default' => 0,
            ],
            'is_manual' => [
                'type' => 'BOOLEAN',
                'default' => false,
            ],
            'is_billable' => [
                'type' => 'BOOLEAN',
                'default' => true,
            ],
            'hourly_rate' => [
                'type' => 'DECIMAL',
                'constraint' => '10,2',
                'null' => true,
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
        $this->forge->addKey('user_id');
        $this->forge->addKey('organization_id');
        $this->forge->addKey('project_id');
        $this->forge->addKey('started_at');
        $this->forge->addForeignKey('user_id', 'users', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('organization_id', 'organizations', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'SET NULL', 'CASCADE');
        $this->forge->addForeignKey('task_id', 'tasks', 'id', 'SET NULL', 'CASCADE');
        $this->forge->createTable('time_entries');
    }

    public function down()
    {
        $this->forge->dropTable('time_entries');
    }
}
