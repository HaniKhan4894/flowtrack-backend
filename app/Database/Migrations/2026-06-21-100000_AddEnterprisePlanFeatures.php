<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddEnterprisePlanFeatures extends Migration
{
    public function up()
    {
        if (!$this->db->tableExists('plan_features') || !$this->db->tableExists('plans')) {
            return;
        }

        $enterprise = $this->db->table('plans')->where('slug', 'enterprise')->get()->getRowArray();
        if (!$enterprise) {
            return;
        }

        $planId = (int) $enterprise['id'];
        $features = [
            ['feature_key' => 'invoicing', 'feature_value' => 'true', 'display_name' => 'Advanced invoicing', 'sort_order' => 70],
            ['feature_key' => 'report_export', 'feature_value' => 'all', 'display_name' => 'Export CSV, PDF, Excel', 'sort_order' => 65],
            ['feature_key' => 'team_leaderboard', 'feature_value' => 'true', 'display_name' => 'Team leaderboard', 'sort_order' => 68],
            ['feature_key' => 'custom_roles', 'feature_value' => 'true', 'display_name' => 'Custom roles & permissions', 'sort_order' => 75],
            ['feature_key' => 'api_access', 'feature_value' => 'full', 'display_name' => 'Full API access', 'sort_order' => 80],
            ['feature_key' => 'webhooks', 'feature_value' => 'true', 'display_name' => 'Webhook integrations', 'sort_order' => 85],
        ];

        foreach ($features as $feature) {
            $exists = $this->db->table('plan_features')
                ->where('plan_id', $planId)
                ->where('feature_key', $feature['feature_key'])
                ->countAllResults();

            if ($exists > 0) {
                $this->db->table('plan_features')
                    ->where('plan_id', $planId)
                    ->where('feature_key', $feature['feature_key'])
                    ->update([
                        'feature_value' => $feature['feature_value'],
                        'display_name' => $feature['display_name'],
                        'is_enabled' => 1,
                        'show_on_pricing' => 1,
                        'sort_order' => $feature['sort_order'],
                    ]);
                continue;
            }

            $this->db->table('plan_features')->insert([
                'plan_id' => $planId,
                'feature_key' => $feature['feature_key'],
                'feature_value' => $feature['feature_value'],
                'display_name' => $feature['display_name'],
                'is_enabled' => 1,
                'show_on_pricing' => 1,
                'sort_order' => $feature['sort_order'],
                'created_at' => date('Y-m-d H:i:s'),
            ]);
        }
    }

    public function down()
    {
        if (!$this->db->tableExists('plan_features') || !$this->db->tableExists('plans')) {
            return;
        }

        $enterprise = $this->db->table('plans')->where('slug', 'enterprise')->get()->getRowArray();
        if (!$enterprise) {
            return;
        }

        $this->db->table('plan_features')
            ->where('plan_id', (int) $enterprise['id'])
            ->whereIn('feature_key', ['invoicing', 'report_export', 'team_leaderboard', 'custom_roles', 'api_access', 'webhooks'])
            ->delete();
    }
}
