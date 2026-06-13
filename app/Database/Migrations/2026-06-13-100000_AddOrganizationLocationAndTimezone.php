<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddOrganizationLocationAndTimezone extends Migration
{
    public function up()
    {
        $this->forge->addColumn('organizations', [
            'country_id' => [
                'type' => 'INT',
                'constraint' => 11,
                'unsigned' => true,
                'null' => true,
                'after' => 'settings',
            ],
            'state_id' => [
                'type' => 'INT',
                'constraint' => 11,
                'unsigned' => true,
                'null' => true,
                'after' => 'country_id',
            ],
            'city_id' => [
                'type' => 'INT',
                'constraint' => 11,
                'unsigned' => true,
                'null' => true,
                'after' => 'state_id',
            ],
            'timezone_id' => [
                'type' => 'INT',
                'constraint' => 11,
                'unsigned' => true,
                'null' => true,
                'after' => 'city_id',
            ],
            'php_timezone' => [
                'type' => 'VARCHAR',
                'constraint' => 64,
                'default' => 'UTC',
                'after' => 'timezone_id',
            ],
        ]);
    }

    public function down()
    {
        $this->forge->dropColumn('organizations', ['country_id', 'state_id', 'city_id', 'timezone_id', 'php_timezone']);
    }
}
