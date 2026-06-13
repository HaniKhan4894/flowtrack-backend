<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreatePayrollTables extends Migration
{
    public function up()
    {
        if (!$this->db->fieldExists('currency', 'organizations')) {
            $this->forge->addColumn('organizations', [
                'currency' => [
                    'type' => 'VARCHAR',
                    'constraint' => 3,
                    'default' => 'USD',
                    'after' => 'php_timezone',
                ],
            ]);
        }

        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'unsigned' => true, 'auto_increment' => true],
            'organization_id' => ['type' => 'BIGINT', 'unsigned' => true],
            'user_id' => ['type' => 'BIGINT', 'unsigned' => true],
            'pay_type' => ['type' => 'ENUM', 'constraint' => ['hourly', 'fixed', 'custom'], 'default' => 'hourly'],
            'hourly_rate' => ['type' => 'DECIMAL', 'constraint' => '10,2', 'null' => true],
            'fixed_amount' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'null' => true],
            'currency' => ['type' => 'VARCHAR', 'constraint' => 3, 'default' => 'USD'],
            'is_active' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'notes' => ['type' => 'TEXT', 'null' => true],
            'created_by' => ['type' => 'BIGINT', 'unsigned' => true, 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['organization_id', 'user_id']);
        $this->forge->addForeignKey('organization_id', 'organizations', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('user_id', 'users', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('payroll_compensations', true);

        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'unsigned' => true, 'auto_increment' => true],
            'organization_id' => ['type' => 'BIGINT', 'unsigned' => true],
            'title' => ['type' => 'VARCHAR', 'constraint' => 255],
            'period_start' => ['type' => 'DATE'],
            'period_end' => ['type' => 'DATE'],
            'status' => ['type' => 'ENUM', 'constraint' => ['draft', 'finalized', 'paid', 'partially_paid'], 'default' => 'draft'],
            'currency' => ['type' => 'VARCHAR', 'constraint' => 3, 'default' => 'USD'],
            'total_gross' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'default' => 0],
            'total_paid' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'default' => 0],
            'created_by' => ['type' => 'BIGINT', 'unsigned' => true, 'null' => true],
            'finalized_at' => ['type' => 'DATETIME', 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('organization_id');
        $this->forge->addForeignKey('organization_id', 'organizations', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('payroll_runs', true);

        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'unsigned' => true, 'auto_increment' => true],
            'payroll_run_id' => ['type' => 'BIGINT', 'unsigned' => true],
            'organization_id' => ['type' => 'BIGINT', 'unsigned' => true],
            'user_id' => ['type' => 'BIGINT', 'unsigned' => true],
            'pay_type' => ['type' => 'ENUM', 'constraint' => ['hourly', 'fixed', 'custom'], 'default' => 'hourly'],
            'tracked_seconds' => ['type' => 'INT', 'default' => 0],
            'hourly_rate' => ['type' => 'DECIMAL', 'constraint' => '10,2', 'null' => true],
            'base_amount' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'default' => 0],
            'bonus_total' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'default' => 0],
            'deduction_total' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'default' => 0],
            'gross_amount' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'default' => 0],
            'paid_amount' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'default' => 0],
            'status' => ['type' => 'ENUM', 'constraint' => ['pending', 'partial', 'paid'], 'default' => 'pending'],
            'notes' => ['type' => 'TEXT', 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['payroll_run_id', 'user_id']);
        $this->forge->addForeignKey('payroll_run_id', 'payroll_runs', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('organization_id', 'organizations', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('user_id', 'users', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('payroll_items', true);

        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'unsigned' => true, 'auto_increment' => true],
            'payroll_item_id' => ['type' => 'BIGINT', 'unsigned' => true],
            'type' => ['type' => 'ENUM', 'constraint' => ['bonus', 'deduction']],
            'label' => ['type' => 'VARCHAR', 'constraint' => 255],
            'amount' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'default' => 0],
            'created_by' => ['type' => 'BIGINT', 'unsigned' => true, 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addForeignKey('payroll_item_id', 'payroll_items', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('payroll_adjustments', true);

        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'unsigned' => true, 'auto_increment' => true],
            'payroll_item_id' => ['type' => 'BIGINT', 'unsigned' => true],
            'organization_id' => ['type' => 'BIGINT', 'unsigned' => true],
            'amount' => ['type' => 'DECIMAL', 'constraint' => '12,2', 'default' => 0],
            'method' => ['type' => 'VARCHAR', 'constraint' => 50, 'default' => 'manual'],
            'reference' => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'status' => ['type' => 'ENUM', 'constraint' => ['recorded', 'completed'], 'default' => 'completed'],
            'paid_at' => ['type' => 'DATETIME'],
            'recorded_by' => ['type' => 'BIGINT', 'unsigned' => true, 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addForeignKey('payroll_item_id', 'payroll_items', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('organization_id', 'organizations', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('payroll_payments', true);
    }

    public function down()
    {
        $this->forge->dropTable('payroll_payments', true);
        $this->forge->dropTable('payroll_adjustments', true);
        $this->forge->dropTable('payroll_items', true);
        $this->forge->dropTable('payroll_runs', true);
        $this->forge->dropTable('payroll_compensations', true);
        if ($this->db->fieldExists('currency', 'organizations')) {
            $this->forge->dropColumn('organizations', 'currency');
        }
    }
}
