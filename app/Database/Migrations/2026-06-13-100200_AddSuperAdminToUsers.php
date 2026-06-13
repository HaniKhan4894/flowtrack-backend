<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddSuperAdminToUsers extends Migration
{
    public function up()
    {
        $this->forge->addColumn('users', [
            'is_super_admin' => [
                'type' => 'TINYINT',
                'constraint' => 1,
                'default' => 0,
                'after' => 'is_active',
            ],
        ]);
    }

    public function down()
    {
        $this->forge->dropColumn('users', 'is_super_admin');
    }
}
