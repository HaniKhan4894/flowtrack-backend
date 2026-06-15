<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateSprintsTable extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'unsigned' => true, 'auto_increment' => true],
            'organization_id' => ['type' => 'BIGINT', 'unsigned' => true],
            'project_id' => ['type' => 'BIGINT', 'unsigned' => true, 'null' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 120],
            'start_date' => ['type' => 'DATE'],
            'end_date' => ['type' => 'DATE'],
            'created_at' => ['type' => 'DATETIME', 'null' => false],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['organization_id', 'start_date']);
        $this->forge->addForeignKey('organization_id', 'organizations', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'SET NULL', 'CASCADE');
        $this->forge->createTable('sprints', true);
    }

    public function down()
    {
        $this->forge->dropTable('sprints', true);
    }
}
