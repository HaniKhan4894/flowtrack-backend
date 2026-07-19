<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Seed plan feature flags used for consistent gating across AI, wellbeing,
 * proof-of-work, integrations, and ensure payroll is on PlanSeeder-aligned plans.
 */
class AddProductFeatureFlags extends Migration
{
    public function up()
    {
        $plans = $this->db->table('plans')->get()->getResultArray();
        $bySlug = [];
        foreach ($plans as $plan) {
            $bySlug[$plan['slug']] = (int) $plan['id'];
        }

        $matrix = [
            'free' => [
                ['feature_key' => 'ai_insights', 'feature_value' => 'false', 'display_name' => 'No AI insights'],
                ['feature_key' => 'wellbeing', 'feature_value' => 'false', 'display_name' => 'No wellbeing suite'],
                ['feature_key' => 'proof_of_work', 'feature_value' => 'false', 'display_name' => 'No proof-of-work ledger'],
                ['feature_key' => 'integrations', 'feature_value' => 'false', 'display_name' => 'No third-party integrations'],
                ['feature_key' => 'payroll', 'feature_value' => 'false', 'display_name' => 'No payroll'],
            ],
            'starter' => [
                ['feature_key' => 'ai_insights', 'feature_value' => 'false', 'display_name' => 'No AI insights'],
                ['feature_key' => 'wellbeing', 'feature_value' => 'false', 'display_name' => 'No wellbeing suite'],
                ['feature_key' => 'proof_of_work', 'feature_value' => 'false', 'display_name' => 'No proof-of-work ledger'],
                ['feature_key' => 'integrations', 'feature_value' => 'true', 'display_name' => 'Slack, Jira, GitHub & calendar'],
                ['feature_key' => 'payroll', 'feature_value' => 'false', 'display_name' => 'No payroll'],
            ],
            'professional' => [
                ['feature_key' => 'ai_insights', 'feature_value' => 'true', 'display_name' => 'AI insights & Ask FlowTrack'],
                ['feature_key' => 'wellbeing', 'feature_value' => 'true', 'display_name' => 'Wellbeing & burnout signals'],
                ['feature_key' => 'proof_of_work', 'feature_value' => 'true', 'display_name' => 'Proof-of-work ledger'],
                ['feature_key' => 'integrations', 'feature_value' => 'true', 'display_name' => 'Full integrations'],
                ['feature_key' => 'payroll', 'feature_value' => 'true', 'display_name' => 'Team payroll'],
            ],
            'enterprise' => [
                ['feature_key' => 'ai_insights', 'feature_value' => 'true', 'display_name' => 'AI insights & Ask FlowTrack'],
                ['feature_key' => 'wellbeing', 'feature_value' => 'true', 'display_name' => 'Wellbeing & burnout signals'],
                ['feature_key' => 'proof_of_work', 'feature_value' => 'true', 'display_name' => 'Proof-of-work ledger'],
                ['feature_key' => 'integrations', 'feature_value' => 'true', 'display_name' => 'Full integrations'],
                ['feature_key' => 'payroll', 'feature_value' => 'true', 'display_name' => 'Team payroll'],
            ],
        ];

        foreach ($matrix as $slug => $features) {
            if (!isset($bySlug[$slug])) {
                continue;
            }
            $planId = $bySlug[$slug];
            foreach ($features as $feature) {
                $exists = $this->db->table('plan_features')
                    ->where('plan_id', $planId)
                    ->where('feature_key', $feature['feature_key'])
                    ->countAllResults();
                if ($exists === 0) {
                    $this->db->table('plan_features')->insert([
                        'plan_id' => $planId,
                        'feature_key' => $feature['feature_key'],
                        'feature_value' => $feature['feature_value'],
                        'display_name' => $feature['display_name'],
                    ]);
                }
            }
        }
    }

    public function down()
    {
        $this->db->table('plan_features')
            ->whereIn('feature_key', ['ai_insights', 'wellbeing', 'proof_of_work', 'integrations'])
            ->delete();
    }
}
