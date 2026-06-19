<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class LowerPlanPricing extends Migration
{
    public function up()
    {
        if (!$this->db->tableExists('plans')) {
            return;
        }

        $updates = [
            'starter' => [
                'price_monthly' => 4.99,
                'price_yearly' => 49.00,
                'pricing_model' => 'fixed',
                'base_price' => 0.00,
                'price_per_user' => 0.00,
                'description' => 'Affordable for freelancers and small teams',
            ],
            'professional' => [
                'price_monthly' => 9.99,
                'price_yearly' => 99.00,
                'pricing_model' => 'fixed',
                'base_price' => 0.00,
                'price_per_user' => 0.00,
                'description' => 'Best value for growing teams — screenshots, reports & invoicing',
                'is_popular' => 1,
            ],
            'enterprise' => [
                'price_monthly' => 19.99,
                'price_yearly' => 199.00,
                'pricing_model' => 'fixed',
                'base_price' => 0.00,
                'price_per_user' => 0.00,
                'description' => 'Advanced features for larger teams at a fair price',
                'is_popular' => 0,
            ],
            'free' => [
                'is_popular' => 0,
            ],
        ];

        foreach ($updates as $slug => $data) {
            $this->db->table('plans')->where('slug', $slug)->update($data);
        }

        // Clear stale Stripe price IDs so dev sync picks up new amounts
        $this->db->table('plans')->update([
            'stripe_price_id_monthly' => null,
            'stripe_price_id_yearly' => null,
        ]);
    }

    public function down()
    {
        // Non-destructive pricing rollback omitted — restore from PlanSeeder if needed.
    }
}
