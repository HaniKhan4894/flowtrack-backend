<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateInvoicePortalTokensTable extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'unsigned' => true, 'auto_increment' => true],
            'invoice_id' => ['type' => 'BIGINT', 'unsigned' => true],
            'token' => ['type' => 'VARCHAR', 'constraint' => 64],
            'expires_at' => ['type' => 'DATETIME', 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => false],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('token');
        $this->forge->addKey('invoice_id');
        $this->forge->addForeignKey('invoice_id', 'invoices', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('invoice_portal_tokens', true);
    }

    public function down()
    {
        $this->forge->dropTable('invoice_portal_tokens', true);
    }
}
