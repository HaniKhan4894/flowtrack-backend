<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateActivityLogsTable extends Migration
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
            'app_name' => [
                'type' => 'VARCHAR',
                'constraint' => 191,
                'null' => true,
            ],
            'window_title' => [
                'type' => 'VARCHAR',
                'constraint' => 500,
                'null' => true,
            ],
            'url' => [
                'type' => 'VARCHAR',
                'constraint' => 1000,
                'null' => true,
            ],
            'category' => [
                'type' => 'ENUM',
                'constraint' => ['productive', 'unproductive', 'neutral', 'uncategorized'],
                'default' => 'uncategorized',
            ],
            'duration_seconds' => [
                'type' => 'INT',
                'default' => 0,
            ],
            'keyboard_strokes' => [
                'type' => 'INT',
                'default' => 0,
            ],
            'mouse_clicks' => [
                'type' => 'INT',
                'default' => 0,
            ],
            'mouse_movement' => [
                'type' => 'INT',
                'default' => 0,
            ],
            'logged_at' => [
                'type' => 'TIMESTAMP',
                'null' => false,
            ],
            'created_at' => [
                'type' => 'TIMESTAMP',
                'null' => false,
            ],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey('time_entry_id');
        $this->forge->addKey('user_id');
        $this->forge->addKey('logged_at');
        $this->forge->addKey('app_name');
        $this->forge->addForeignKey('time_entry_id', 'time_entries', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('user_id', 'users', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('activity_logs');
    }

    public function down()
    {
        $this->forge->dropTable('activity_logs');
    }
}
