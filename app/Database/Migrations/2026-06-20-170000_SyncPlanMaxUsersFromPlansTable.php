<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class SyncPlanMaxUsersFromPlansTable extends Migration
{
    public function up()
    {
        if (!$this->db->tableExists('plans') || !$this->db->tableExists('plan_features')) {
            return;
        }

        $this->db->table('plans')->where('slug', 'enterprise')->update(['is_popular' => 0]);
        $this->db->table('plans')->where('slug', 'professional')->update(['is_popular' => 1]);

        foreach ($this->db->table('plans')->get()->getResultArray() as $plan) {
            $this->syncMaxUsersFeature((int) $plan['id'], $plan['max_users'] ?? null);
        }
    }

    private function syncMaxUsersFeature(int $planId, $maxUsers): void
    {
        if ($maxUsers === null || $maxUsers === '') {
            $value = 'unlimited';
            $display = 'Unlimited team members';
        } elseif ((int) $maxUsers === 1) {
            $value = '1';
            $display = 'Single user only';
        } else {
            $value = (string) (int) $maxUsers;
            $display = 'Up to ' . (int) $maxUsers . ' team members';
        }

        $exists = $this->db->table('plan_features')
            ->where('plan_id', $planId)
            ->where('feature_key', 'max_users')
            ->countAllResults();

        if ($exists > 0) {
            $this->db->table('plan_features')
                ->where('plan_id', $planId)
                ->where('feature_key', 'max_users')
                ->update([
                    'feature_value' => $value,
                    'display_name' => $display,
                    'is_enabled' => 1,
                    'show_on_pricing' => 1,
                ]);
        }
    }

    public function down()
    {
        // Data sync only.
    }
}
