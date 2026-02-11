<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddPerUserPricingToPlans extends Migration
{
    public function up()
    {
        // Add per-user pricing columns
        $this->forge->addColumn('plans', [
            'pricing_model' => [
                'type' => 'ENUM',
                'constraint' => ['fixed', 'per_user'],
                'default' => 'fixed',
                'after' => 'slug',
            ],
            'base_price' => [
                'type' => 'DECIMAL',
                'constraint' => '10,2',
                'default' => 0.00,
                'comment' => 'Base price for per-user pricing',
                'after' => 'price_yearly',
            ],
            'price_per_user' => [
                'type' => 'DECIMAL',
                'constraint' => '10,2',
                'default' => 0.00,
                'comment' => 'Cost per user for per-user pricing',
                'after' => 'base_price',
            ],
            'min_users' => [
                'type' => 'INT',
                'default' => 1,
                'comment' => 'Minimum users required for per-user pricing',
                'after' => 'price_per_user',
            ],
        ]);

        // Add user_count and amount to subscriptions
        $this->forge->addColumn('organization_subscriptions', [
            'user_count' => [
                'type' => 'INT',
                'default' => 1,
                'comment' => 'Number of users for per-user pricing',
                'after' => 'plan_id',
            ],
            'amount' => [
                'type' => 'DECIMAL',
                'constraint' => '10,2',
                'default' => 0.00,
                'comment' => 'Calculated subscription amount',
                'after' => 'user_count',
            ],
        ]);

        // Update existing plans
        // Free and Starter remain fixed
        $this->db->table('plans')->where('id', 1)->update(['pricing_model' => 'fixed']);
        $this->db->table('plans')->where('id', 2)->update(['pricing_model' => 'fixed']);

        // Professional becomes per-user: $10 base + $5/user (min 3 users)
        $this->db->table('plans')->where('id', 3)->update([
            'pricing_model' => 'per_user',
            'base_price' => 10.00,
            'price_per_user' => 5.00,
            'min_users' => 3,
        ]);

        // Enterprise becomes per-user: $50 base + $8/user (min 10 users)
        $this->db->table('plans')->where('id', 4)->update([
            'pricing_model' => 'per_user',
            'base_price' => 50.00,
            'price_per_user' => 8.00,
            'min_users' => 10,
        ]);
    }

    public function down()
    {
        $this->forge->dropColumn('plans', ['pricing_model', 'base_price', 'price_per_user', 'min_users']);
        $this->forge->dropColumn('organization_subscriptions', ['user_count', 'amount']);
    }
}
