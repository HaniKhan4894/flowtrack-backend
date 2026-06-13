<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class BackfillFreeSubscriptions extends Migration
{
    public function up()
    {
        $freePlan = $this->db->table('plans')->where('slug', 'free')->get()->getRowArray();
        if (!$freePlan) {
            return;
        }

        $orgs = $this->db->table('organizations')->select('id')->get()->getResultArray();
        foreach ($orgs as $org) {
            $orgId = (int) $org['id'];
            $existing = $this->db->table('organization_subscriptions')
                ->where('organization_id', $orgId)
                ->whereIn('status', ['trial', 'active'])
                ->countAllResults();

            if ($existing > 0) {
                continue;
            }

            $this->db->table('organization_subscriptions')->insert([
                'organization_id' => $orgId,
                'plan_id' => $freePlan['id'],
                'user_count' => 1,
                'amount' => 0,
                'billing_cycle' => 'monthly',
                'status' => 'active',
                'trial_ends_at' => null,
                'current_period_start' => date('Y-m-d H:i:s'),
                'current_period_end' => date('Y-m-d H:i:s', strtotime('+10 years')),
                'created_at' => date('Y-m-d H:i:s'),
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
        }
    }

    public function down()
    {
        // no-op
    }
}
