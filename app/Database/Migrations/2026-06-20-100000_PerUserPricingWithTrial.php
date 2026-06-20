<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class PerUserPricingWithTrial extends Migration
{
    public function up()
    {
        if ($this->db->tableExists('plans')) {
            if (!$this->db->fieldExists('stripe_base_price_id_monthly', 'plans')) {
                $this->forge->addColumn('plans', [
                    'stripe_base_price_id_monthly' => [
                        'type' => 'VARCHAR',
                        'constraint' => 100,
                        'null' => true,
                        'after' => 'stripe_price_id_yearly',
                    ],
                    'stripe_base_price_id_yearly' => [
                        'type' => 'VARCHAR',
                        'constraint' => 100,
                        'null' => true,
                        'after' => 'stripe_base_price_id_monthly',
                    ],
                ]);
            }

            $updates = [
                'starter' => [
                    'pricing_model' => 'per_user',
                    'price_monthly' => 0.00,
                    'price_yearly' => 0.00,
                    'base_price' => 3.99,
                    'price_per_user' => 3.49,
                    'min_users' => 1,
                    'trial_days' => 14,
                    'description' => 'Affordable for freelancers and small teams — below Hubstaff & Time Doctor',
                ],
                'professional' => [
                    'pricing_model' => 'per_user',
                    'price_monthly' => 0.00,
                    'price_yearly' => 0.00,
                    'base_price' => 7.99,
                    'price_per_user' => 4.49,
                    'min_users' => 1,
                    'trial_days' => 14,
                    'is_popular' => 1,
                    'description' => 'Best value for growing teams — screenshots, reports & invoicing',
                ],
                'enterprise' => [
                    'pricing_model' => 'per_user',
                    'price_monthly' => 0.00,
                    'price_yearly' => 0.00,
                    'base_price' => 14.99,
                    'price_per_user' => 5.99,
                    'min_users' => 1,
                    'trial_days' => 14,
                    'is_popular' => 0,
                    'description' => 'Advanced features for larger teams at a fair per-seat price',
                ],
            ];

            foreach ($updates as $slug => $data) {
                $this->db->table('plans')->where('slug', $slug)->update($data);
            }

            $this->db->table('plans')->update([
                'stripe_price_id_monthly' => null,
                'stripe_price_id_yearly' => null,
                'stripe_base_price_id_monthly' => null,
                'stripe_base_price_id_yearly' => null,
            ]);
        }
    }

    public function down()
    {
        if ($this->db->tableExists('plans') && $this->db->fieldExists('stripe_base_price_id_monthly', 'plans')) {
            $this->forge->dropColumn('plans', ['stripe_base_price_id_monthly', 'stripe_base_price_id_yearly']);
        }
    }
}
