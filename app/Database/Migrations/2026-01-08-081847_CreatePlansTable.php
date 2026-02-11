<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreatePlansTable extends Migration
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
            'name' => [
                'type' => 'VARCHAR',
                'constraint' => 100,
            ],
            'slug' => [
                'type' => 'VARCHAR',
                'constraint' => 100,
                'unique' => true,
            ],
            'description' => [
                'type' => 'TEXT',
                'null' => true,
            ],
            'price_monthly' => [
                'type' => 'DECIMAL',
                'constraint' => '10,2',
                'default' => 0.00,
            ],
            'price_yearly' => [
                'type' => 'DECIMAL',
                'constraint' => '10,2',
                'default' => 0.00,
            ],
            'trial_days' => [
                'type' => 'INT',
                'default' => 14,
                'comment' => 'Number of trial days',
            ],
            'is_active' => [
                'type' => 'BOOLEAN',
                'default' => true,
            ],
            'is_popular' => [
                'type' => 'BOOLEAN',
                'default' => false,
                'comment' => 'Show Most Popular badge',
            ],
            'sort_order' => [
                'type' => 'INT',
                'default' => 0,
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
        $this->forge->addKey('is_active');
        $this->forge->createTable('plans');

        // Seed initial plans
        $plans = [
            [
                'name' => 'Free',
                'slug' => 'free',
                'description' => 'Perfect for trying out FlowTrack',
                'price_monthly' => 0.00,
                'price_yearly' => 0.00,
                'trial_days' => 0,
                'is_active' => true,
                'is_popular' => false,
                'sort_order' => 1,
            ],
            [
                'name' => 'Starter',
                'slug' => 'starter',
                'description' => 'For small teams getting started',
                'price_monthly' => 9.99,
                'price_yearly' => 99.00,
                'trial_days' => 14,
                'is_active' => true,
                'is_popular' => false,
                'sort_order' => 2,
            ],
            [
                'name' => 'Professional',
                'slug' => 'professional',
                'description' => 'For growing teams that need more',
                'price_monthly' => 29.99,
                'price_yearly' => 299.00,
                'trial_days' => 14,
                'is_active' => true,
                'is_popular' => true,
                'sort_order' => 3,
            ],
            [
                'name' => 'Enterprise',
                'slug' => 'enterprise',
                'description' => 'For large organizations with advanced needs',
                'price_monthly' => 99.99,
                'price_yearly' => 999.00,
                'trial_days' => 30,
                'is_active' => true,
                'is_popular' => false,
                'sort_order' => 4,
            ],
        ];

        $this->db->table('plans')->insertBatch($plans);
    }

    public function down()
    {
        $this->forge->dropTable('plans');
    }
}
