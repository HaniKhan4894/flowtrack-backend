<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddInvoicePortalFields extends Migration
{
    public function up()
    {
        if (!$this->invoiceColumnExists('client_approved_at')) {
            $this->forge->addColumn('invoices', [
                'client_approved_at' => ['type' => 'DATETIME', 'null' => true, 'after' => 'paid_at'],
            ]);
        }

        if (!$this->invoiceColumnExists('amount_paid')) {
            $this->forge->addColumn('invoices', [
                'amount_paid' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'default' => 0, 'after' => 'client_approved_at'],
            ]);
        }

        $statusColumn = $this->db->query("SHOW COLUMNS FROM invoices LIKE 'status'")->getRowArray();
        $type = (string) ($statusColumn['Type'] ?? '');
        if (!str_contains($type, 'pending_approval')) {
            $this->db->query("ALTER TABLE invoices MODIFY COLUMN status ENUM('draft','sent','pending_approval','approved','partially_paid','paid','cancelled') NOT NULL DEFAULT 'draft'");
        }
    }

    public function down()
    {
        if ($this->invoiceColumnExists('amount_paid')) {
            $this->forge->dropColumn('invoices', 'amount_paid');
        }
        if ($this->invoiceColumnExists('client_approved_at')) {
            $this->forge->dropColumn('invoices', 'client_approved_at');
        }

        $this->db->query("ALTER TABLE invoices MODIFY COLUMN status ENUM('draft','sent','paid','cancelled') NOT NULL DEFAULT 'draft'");
    }

    private function invoiceColumnExists(string $column): bool
    {
        $sql = 'SHOW COLUMNS FROM invoices LIKE ' . $this->db->escape($column);

        return $this->db->query($sql)->getRowArray() !== null;
    }
}
