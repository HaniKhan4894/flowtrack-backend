<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Generic per-organization integrations store. One row per (organization,
 * provider). Non-sensitive config lives in `settings` (JSON); secrets (API
 * keys, tokens) are AES-encrypted in `secrets_encrypted`.
 *
 * Examples: provider = 'openai' | 'github' | 'slack' | 'jira' ...
 */
class CreateOrganizationIntegrations extends Migration
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
            'provider' => [
                'type'       => 'VARCHAR',
                'constraint' => 50,
            ],
            // How this integration authenticates: 'api_key' or 'oauth'.
            'auth_type' => [
                'type'       => 'VARCHAR',
                'constraint' => 20,
                'default'    => 'api_key',
            ],
            // Provider account/user id for OAuth integrations (non-secret).
            'external_account_id' => [
                'type'       => 'VARCHAR',
                'constraint' => 191,
                'null'       => true,
            ],
            // Non-sensitive config/metadata (model, urls, account name, scopes,
            // token expiry, display hints…). JSON.
            'settings' => [
                'type' => 'TEXT',
                'null' => true,
            ],
            // AES-256 encrypted JSON blob of sensitive values
            // (api keys, access/refresh tokens, client secrets…).
            'secrets_encrypted' => [
                'type' => 'TEXT',
                'null' => true,
            ],
            'is_enabled' => [
                'type'       => 'TINYINT',
                'constraint' => 1,
                'default'    => 1,
            ],
            'connected_by' => [
                'type'       => 'BIGINT',
                'constraint' => 20,
                'unsigned'   => true,
                'null'       => true,
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
        $this->forge->addUniqueKey(['organization_id', 'provider']);
        $this->forge->addForeignKey('organization_id', 'organizations', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('organization_integrations');
    }

    public function down()
    {
        $this->forge->dropTable('organization_integrations');
    }
}
