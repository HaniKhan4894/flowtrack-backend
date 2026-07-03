<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Phase 9 — Work Integrity engine.
 *
 * Stores a per-record integrity score + flags alongside each ledger entry.
 * These are metadata for display/trust only and are intentionally NOT part of
 * the hash chain, so verification of historic records stays stable.
 */
class AddIntegrityToWorkLedger extends Migration
{
    public function up()
    {
        $this->forge->addColumn('work_ledger', [
            'integrity_score' => [
                'type'       => 'DECIMAL',
                'constraint' => '5,2',
                'null'       => true,
                'after'      => 'hash',
            ],
            'integrity_flags' => [
                'type'  => 'TEXT',
                'null'  => true,
                'after' => 'integrity_score',
            ],
        ]);
    }

    public function down()
    {
        $this->forge->dropColumn('work_ledger', ['integrity_score', 'integrity_flags']);
    }
}
