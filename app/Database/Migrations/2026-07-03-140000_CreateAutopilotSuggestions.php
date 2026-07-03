<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Phase 7 — AI Autopilot timesheets.
 *
 * Caches the AI-reconstructed draft time blocks for a user's day plus the
 * accept/reject feedback so prompts can be tuned and the same day isn't
 * regenerated blindly. One row per proposed block.
 */
class CreateAutopilotSuggestions extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => [
                'type'           => 'BIGINT',
                'constraint'     => 20,
                'unsigned'       => true,
                'auto_increment' => true,
            ],
            'organization_id' => [
                'type'       => 'BIGINT',
                'constraint' => 20,
                'unsigned'   => true,
            ],
            'user_id' => [
                'type'       => 'BIGINT',
                'constraint' => 20,
                'unsigned'   => true,
            ],
            'work_date' => [
                'type' => 'DATE',
            ],
            'project_id' => [
                'type'       => 'BIGINT',
                'constraint' => 20,
                'unsigned'   => true,
                'null'       => true,
            ],
            'description' => [
                'type' => 'VARCHAR',
                'constraint' => 500,
                'null' => true,
            ],
            'started_at' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
            'ended_at' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
            'duration_minutes' => [
                'type'       => 'INT',
                'constraint' => 11,
                'default'    => 0,
            ],
            'confidence' => [
                'type'       => 'DECIMAL',
                'constraint' => '4,3',
                'default'    => 0,
            ],
            // Compact JSON list of signals that produced this block.
            'sources' => [
                'type' => 'TEXT',
                'null' => true,
            ],
            // suggested | applied | dismissed
            'status' => [
                'type'       => 'VARCHAR',
                'constraint' => 20,
                'default'    => 'suggested',
            ],
            'applied_entry_id' => [
                'type'       => 'BIGINT',
                'constraint' => 20,
                'unsigned'   => true,
                'null'       => true,
            ],
            'created_at' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
            'updated_at' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey(['organization_id', 'user_id', 'work_date']);
        $this->forge->addForeignKey('organization_id', 'organizations', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('user_id', 'users', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('autopilot_suggestions');
    }

    public function down()
    {
        $this->forge->dropTable('autopilot_suggestions');
    }
}
