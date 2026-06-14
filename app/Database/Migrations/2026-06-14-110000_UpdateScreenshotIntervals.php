<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class UpdateScreenshotIntervals extends Migration
{
    public function up()
    {
        $updates = [
            2 => ['value' => '5', 'display' => 'Every 5 minutes'],
            3 => ['value' => '2', 'display' => 'Every 2 minutes'],
            4 => ['value' => '1', 'display' => 'Every 1 minute'],
        ];

        foreach ($updates as $planId => $config) {
            $this->db->table('plan_features')
                ->where('plan_id', $planId)
                ->where('feature_key', 'screenshot_interval')
                ->update([
                    'feature_value' => $config['value'],
                    'display_name' => $config['display'],
                ]);
        }
    }

    public function down()
    {
        $reverts = [
            2 => ['value' => '10', 'display' => 'Every 10 minutes'],
            3 => ['value' => '5', 'display' => 'Every 5 minutes'],
            4 => ['value' => '3', 'display' => 'Every 3 minutes'],
        ];

        foreach ($reverts as $planId => $config) {
            $this->db->table('plan_features')
                ->where('plan_id', $planId)
                ->where('feature_key', 'screenshot_interval')
                ->update([
                    'feature_value' => $config['value'],
                    'display_name' => $config['display'],
                ]);
        }
    }
}
