<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateScreenshotsTable extends Migration
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
            'time_entry_id' => [
                'type' => 'BIGINT',
                'constraint' => 20,
                'unsigned' => true,
            ],
            'user_id' => [
                'type' => 'BIGINT',
                'constraint' => 20,
                'unsigned' => true,
            ],
            'file_path' => [
                'type' => 'VARCHAR',
                'constraint' => 500,
            ],
            'thumbnail_path' => [
                'type' => 'VARCHAR',
                'constraint' => 500,
                'null' => true,
            ],
            'is_blurred' => [
                'type' => 'BOOLEAN',
                'default' => false,
            ],
            'activity_level' => [
                'type' => 'TINYINT',
                'default' => 0,
            ],
            'captured_at' => [
                'type' => 'TIMESTAMP',
                'null' => false,
            ],
            'deleted_by_user' => [
                'type' => 'BOOLEAN',
                'default' => false,
            ],
            'created_at' => [
                'type' => 'TIMESTAMP',
                'null' => false,
            ],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey('time_entry_id');
        $this->forge->addKey('user_id');
        $this->forge->addKey('captured_at');
        $this->forge->addForeignKey('time_entry_id', 'time_entries', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('user_id', 'users', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('screenshots');
    }

    public function down()
    {
        $this->forge->dropTable('screenshots');
    }
}
