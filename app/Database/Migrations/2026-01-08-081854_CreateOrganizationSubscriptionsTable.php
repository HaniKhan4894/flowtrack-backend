<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateOrganizationSubscriptionsTable extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => [
                'type' => 'BIGINT',
                'constraint' => 20,
                'unsigned' => true,
                'auto_increment' => true,
            ],
            'organization_id' => [
                'type' => 'BIGINT',
                'constraint' => 20,
                'unsigned' => true,
            ],
            'plan_id' => [
                'type' => 'BIGINT',
                'constraint' => 20,
                'unsigned' => true,
            ],
            'billing_cycle' => [
                'type' => 'ENUM',
                'constraint' => ['monthly', 'yearly'],
                'default' => 'monthly',
            ],
            'status' => [
                'type' => 'ENUM',
                'constraint' => ['trial', 'active', 'cancelled', 'expired', 'past_due'],
                'default' => 'trial',
            ],
            'trial_ends_at' => [
                'type' => 'TIMESTAMP',
                'null' => true,
            ],
            'current_period_start' => [
                'type' => 'TIMESTAMP',
                'null' => false,
            ],
            'current_period_end' => [
                'type' => 'TIMESTAMP',
                'null' => false,
            ],
            'cancel_at_period_end' => [
                'type' => 'BOOLEAN',
                'default' => false,
            ],
            'cancelled_at' => [
                'type' => 'TIMESTAMP',
                'null' => true,
            ],
            'stripe_subscription_id' => [
                'type' => 'VARCHAR',
                'constraint' => 255,
                'null' => true,
                'comment' => 'Stripe subscription ID for payment integration',
            ],
            'stripe_customer_id' => [
                'type' => 'VARCHAR',
                'constraint' => 255,
                'null' => true,
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
        $this->forge->addKey('organization_id');
        $this->forge->addKey('status');
        $this->forge->addForeignKey('organization_id', 'organizations', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('plan_id', 'plans', 'id');
        $this->forge->createTable('organization_subscriptions');
    }

    public function down()
    {
        $this->forge->dropTable('organization_subscriptions');
    }
}
