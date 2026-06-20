<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class UpdateBillingSliderSteps extends Migration
{
    public function up()
    {
        if (!$this->db->tableExists('billing_settings')) {
            return;
        }

        $this->db->table('billing_settings')->where('id', 1)->update([
            'slider_min' => 1,
            'slider_max' => 200,
            'slider_step' => 5,
            'slider_default' => 5,
            'slider_marks' => json_encode([1, 5, 25, 50, 100, 150, 200]),
            'updated_at' => date('Y-m-d H:i:s'),
        ]);
    }

    public function down()
    {
        // Config-only.
    }
}
