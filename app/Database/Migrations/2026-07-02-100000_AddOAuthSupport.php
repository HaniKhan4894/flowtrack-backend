<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddOAuthSupport extends Migration
{
    public function up()
    {
        // OAuth-only users have no password, so allow NULL password_hash.
        $this->forge->modifyColumn('users', [
            'password_hash' => [
                'name'       => 'password_hash',
                'type'       => 'VARCHAR',
                'constraint' => 255,
                'null'       => true,
            ],
        ]);

        // Linked social login accounts (Google, GitHub, ...)
        $this->forge->addField([
            'id' => [
                'type'           => 'BIGINT',
                'constraint'     => 20,
                'unsigned'       => true,
                'auto_increment' => true,
            ],
            'user_id' => [
                'type'       => 'BIGINT',
                'constraint' => 20,
                'unsigned'   => true,
            ],
            'provider' => [
                'type'       => 'VARCHAR',
                'constraint' => 20,
            ],
            'provider_user_id' => [
                'type'       => 'VARCHAR',
                'constraint' => 191,
            ],
            'email' => [
                'type'       => 'VARCHAR',
                'constraint' => 191,
                'null'       => true,
            ],
            'avatar_url' => [
                'type'       => 'VARCHAR',
                'constraint' => 500,
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
        $this->forge->addUniqueKey(['provider', 'provider_user_id']);
        $this->forge->addKey('user_id');
        $this->forge->addForeignKey('user_id', 'users', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('oauth_accounts');
    }

    public function down()
    {
        $this->forge->dropTable('oauth_accounts');

        $this->forge->modifyColumn('users', [
            'password_hash' => [
                'name'       => 'password_hash',
                'type'       => 'VARCHAR',
                'constraint' => 255,
                'null'       => false,
            ],
        ]);
    }
}
