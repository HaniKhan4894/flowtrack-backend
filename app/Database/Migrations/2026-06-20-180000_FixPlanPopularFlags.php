<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class FixPlanPopularFlags extends Migration
{
    public function up()
    {
        if (!$this->db->tableExists('plans')) {
            return;
        }

        $this->db->table('plans')->update(['is_popular' => 0]);
        $this->db->table('plans')->where('slug', 'professional')->update(['is_popular' => 1]);
    }

    public function down()
    {
        // Data only.
    }
}
