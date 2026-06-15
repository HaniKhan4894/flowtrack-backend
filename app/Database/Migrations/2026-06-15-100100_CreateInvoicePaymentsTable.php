<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateInvoicePaymentsTable extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'unsigned' => true, 'auto_increment' => true],
            'invoice_id' => ['type' => 'BIGINT', 'unsigned' => true],
            'amount' => ['type' => 'DECIMAL', 'constraint' => '12,2'],
            'method' => ['type' => 'VARCHAR', 'constraint' => 50, 'default' => 'bank_transfer'],
            'reference' => ['type' => 'VARCHAR', 'constraint' => 191, 'null' => true],
            'note' => ['type' => 'TEXT', 'null' => true],
            'paid_at' => ['type' => 'DATETIME', 'null' => false],
            'created_at' => ['type' => 'DATETIME', 'null' => false],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('invoice_id');
        $this->forge->addForeignKey('invoice_id', 'invoices', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('invoice_payments', true);
    }

    public function down()
    {
        $this->forge->dropTable('invoice_payments', true);
    }
}
