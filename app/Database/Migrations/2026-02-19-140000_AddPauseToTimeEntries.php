<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddPauseToTimeEntries extends Migration
{
    public function up()
    {
        // Add paused_at and paused_duration_seconds to time_entries
        $fields = [
            'paused_at' => [
                'type' => 'DATETIME',
                'null' => true,
                'after' => 'ended_at',
            ],
            'paused_duration_seconds' => [
                'type' => 'INT',
                'null' => false,
                'default' => 0,
                'after' => 'paused_at',
            ],
        ];

        $this->forge->addColumn('time_entries', $fields);
    }

    public function down()
    {
        $this->forge->dropColumn('time_entries', ['paused_at', 'paused_duration_seconds']);
    }
}
