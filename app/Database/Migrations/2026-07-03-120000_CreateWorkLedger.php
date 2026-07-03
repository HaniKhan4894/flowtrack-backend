<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Phase 6 — Verifiable, tamper-evident proof-of-work ledger.
 *
 * Append-only hash chain. Each record binds the previous record's hash with a
 * hash of the tracked-work payload, so any later edit/deletion of a time entry
 * (or reordering of the ledger itself) becomes detectable.
 */
class CreateWorkLedger extends Migration
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
            'sequence' => [
                'type'       => 'BIGINT',
                'constraint' => 20,
                'unsigned'   => true,
            ],
            'entry_type' => [
                'type'       => 'VARCHAR',
                'constraint' => 32,
                'default'    => 'time_entry',
            ],
            'action' => [
                'type'       => 'VARCHAR',
                'constraint' => 16,
                'default'    => 'record', // record | amend | delete
            ],
            'reference_id' => [
                'type'       => 'BIGINT',
                'constraint' => 20,
                'unsigned'   => true,
                'null'       => true,
            ],
            'payload_hash' => [
                'type'       => 'CHAR',
                'constraint' => 64,
            ],
            'prev_hash' => [
                'type'       => 'CHAR',
                'constraint' => 64,
            ],
            'hash' => [
                'type'       => 'CHAR',
                'constraint' => 64,
            ],
            'created_at' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey(['organization_id', 'sequence']);
        $this->forge->addKey(['organization_id', 'entry_type', 'reference_id']);
        $this->forge->createTable('work_ledger');
    }

    public function down()
    {
        $this->forge->dropTable('work_ledger');
    }
}
