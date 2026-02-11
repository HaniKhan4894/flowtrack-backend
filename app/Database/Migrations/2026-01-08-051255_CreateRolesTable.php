<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateRolesTable extends Migration
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
                'null' => true,
                'comment' => 'NULL for system roles, organization_id for custom roles',
            ],
            'name' => [
                'type' => 'VARCHAR',
                'constraint' => 100,
            ],
            'slug' => [
                'type' => 'VARCHAR',
                'constraint' => 100,
            ],
            'is_system' => [
                'type' => 'BOOLEAN',
                'default' => false,
                'comment' => 'System roles cannot be deleted',
            ],
            'description' => [
                'type' => 'TEXT',
                'null' => true,
            ],
            'created_at' => [
                'type' => 'TIMESTAMP',
                'null' => true,
            ],
            'updated_at' => [
                'type' => 'TIMESTAMP',
                'null' => true,
            ],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey('organization_id');
        $this->forge->addKey('slug');
        $this->forge->createTable('roles');

        // Insert system roles
        $roles = [
            [
                'organization_id' => null,
                'name' => 'Owner',
                'slug' => 'owner',
                'is_system' => true,
                'description' => 'Organization owner with full access',
            ],
            [
                'organization_id' => null,
                'name' => 'Admin',
                'slug' => 'admin',
                'is_system' => true,
                'description' => 'Administrator with most permissions',
            ],
            [
                'organization_id' => null,
                'name' => 'Manager',
                'slug' => 'manager',
                'is_system' => true,
                'description' => 'Team manager with team-level permissions',
            ],
            [
                'organization_id' => null,
                'name' => 'Member',
                'slug' => 'member',
                'is_system' => true,
                'description' => 'Regular team member',
            ],
        ];

        $this->db->table('roles')->insertBatch($roles);
    }

    public function down()
    {
        $this->forge->dropTable('roles');
    }
}
