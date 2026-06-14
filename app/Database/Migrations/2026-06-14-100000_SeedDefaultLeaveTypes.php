<?php

namespace App\Database\Migrations;

use App\Services\LeaveService;
use CodeIgniter\Database\Migration;

class SeedDefaultLeaveTypes extends Migration
{
    public function up()
    {
        $leaveService = new LeaveService();
        $orgs = $this->db->table('organizations')->select('id')->get()->getResultArray();

        foreach ($orgs as $org) {
            $leaveService->seedDefaultLeaveTypes((int) $org['id']);
        }
    }

    public function down()
    {
        // Leave types may already be in use; do not auto-delete on rollback.
    }
}
