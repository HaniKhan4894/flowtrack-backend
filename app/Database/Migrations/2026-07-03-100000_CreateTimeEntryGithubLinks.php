<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Links GitHub commits / pull requests to time entries so tracked time can be
 * tied to concrete development artifacts (proof-of-work, dev reporting).
 */
class CreateTimeEntryGithubLinks extends Migration
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
            'time_entry_id' => [
                'type'       => 'BIGINT',
                'constraint' => 20,
                'unsigned'   => true,
            ],
            'user_id' => [
                'type'       => 'BIGINT',
                'constraint' => 20,
                'unsigned'   => true,
            ],
            'type' => [
                'type'       => 'VARCHAR',
                'constraint' => 20,
                'default'    => 'commit', // 'commit' | 'pull_request'
            ],
            'repo' => [
                'type'       => 'VARCHAR',
                'constraint' => 191,
                'null'       => true,
            ],
            'external_id' => [
                'type'       => 'VARCHAR',
                'constraint' => 191, // commit sha or PR number
                'null'       => true,
            ],
            'title' => [
                'type' => 'VARCHAR',
                'constraint' => 500,
                'null' => true,
            ],
            'url' => [
                'type' => 'VARCHAR',
                'constraint' => 500,
                'null' => true,
            ],
            'authored_at' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
            'created_at' => [
                'type' => 'TIMESTAMP',
                'null' => true,
            ],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey(['time_entry_id', 'type', 'external_id']);
        $this->forge->addKey('organization_id');
        $this->forge->addKey('user_id');
        $this->forge->addForeignKey('time_entry_id', 'time_entries', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('time_entry_github_links');
    }

    public function down()
    {
        $this->forge->dropTable('time_entry_github_links');
    }
}
