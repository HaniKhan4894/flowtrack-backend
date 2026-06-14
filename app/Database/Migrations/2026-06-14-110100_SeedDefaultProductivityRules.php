<?php

namespace App\Database\Migrations;

use App\Services\ProductivityRuleService;
use CodeIgniter\Database\Migration;

class SeedDefaultProductivityRules extends Migration
{
    public function up()
    {
        $service = new ProductivityRuleService();
        $orgs = $this->db->table('organizations')->select('id, owner_id')->get()->getResultArray();

        foreach ($orgs as $org) {
            $service->seedDefaultRules((int) $org['id'], (int) ($org['owner_id'] ?? 0));
        }
    }

    public function down()
    {
        // Default rules are safe to keep; no destructive rollback.
    }
}
