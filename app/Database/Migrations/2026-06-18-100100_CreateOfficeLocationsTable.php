<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\BaseConnection;
use CodeIgniter\Database\Migration;

class CreateOfficeLocationsTable extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'organization_id' => ['type' => 'INT', 'unsigned' => true],
            'name' => ['type' => 'VARCHAR', 'constraint' => 255],
            'public_ip' => ['type' => 'VARCHAR', 'constraint' => 45, 'null' => true],
            'router_mac' => ['type' => 'VARCHAR', 'constraint' => 32, 'null' => true],
            'location_type' => ['type' => 'VARCHAR', 'constraint' => 32, 'default' => 'office'],
            'is_auto_detected' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 0],
            'last_active_at' => ['type' => 'DATETIME', 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['organization_id', 'location_type']);
        $this->forge->addForeignKey('organization_id', 'organizations', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('office_locations', true);

        if (!$this->columnExists('time_entries', 'work_location')) {
            $this->forge->addColumn('time_entries', [
                'work_location' => ['type' => 'VARCHAR', 'constraint' => 16, 'null' => true, 'after' => 'is_manual'],
                'client_public_ip' => ['type' => 'VARCHAR', 'constraint' => 45, 'null' => true, 'after' => 'work_location'],
                'client_router_mac' => ['type' => 'VARCHAR', 'constraint' => 32, 'null' => true, 'after' => 'client_public_ip'],
            ]);
        }
    }

    public function down()
    {
        if ($this->columnExists('time_entries', 'work_location')) {
            $this->forge->dropColumn('time_entries', ['work_location', 'client_public_ip', 'client_router_mac']);
        }
        $this->forge->dropTable('office_locations', true);
    }

    private function columnExists(string $table, string $column): bool
    {
        $db = $this->db;

        return $db instanceof BaseConnection && $db->fieldExists($column, $table);
    }
}
