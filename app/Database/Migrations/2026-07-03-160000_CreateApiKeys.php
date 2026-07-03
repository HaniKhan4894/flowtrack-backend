<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Phase 10 — Public API keys.
 *
 * Lets an organization mint API keys to call FlowTrack's public API. Only a
 * salted hash of the key is stored; the plaintext is shown once at creation.
 */
class CreateApiKeys extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => [
                'type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true,
            ],
            'organization_id' => [
                'type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true,
            ],
            'name' => [
                'type' => 'VARCHAR', 'constraint' => 120,
            ],
            // Public, non-secret prefix (e.g. ft_live_ab12) to identify a key.
            'key_prefix' => [
                'type' => 'VARCHAR', 'constraint' => 24,
            ],
            // SHA-256 of the full key.
            'key_hash' => [
                'type' => 'CHAR', 'constraint' => 64,
            ],
            'scopes' => [
                'type' => 'TEXT', 'null' => true,
            ],
            'last_used_at' => [
                'type' => 'DATETIME', 'null' => true,
            ],
            'is_active' => [
                'type' => 'TINYINT', 'constraint' => 1, 'default' => 1,
            ],
            'created_by' => [
                'type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true,
            ],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey('key_hash');
        $this->forge->addKey('organization_id');
        $this->forge->addForeignKey('organization_id', 'organizations', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('api_keys');
    }

    public function down()
    {
        $this->forge->dropTable('api_keys');
    }
}
