<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class ProfessionalPlanDescriptions extends Migration
{
    public function up()
    {
        if (!$this->db->tableExists('plans')) {
            return;
        }

        $descriptions = [
            'free' => 'Try FlowTrack at no cost — timer, projects & desktop app',
            'starter' => 'Screenshot monitoring & activity tracking for small teams',
            'professional' => 'Invoicing, custom roles & advanced reports for growing teams',
            'enterprise' => 'SSO, white-label & unlimited scale for larger organizations',
        ];

        foreach ($descriptions as $slug => $description) {
            $this->db->table('plans')->where('slug', $slug)->update([
                'description' => $description,
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
        }
    }

    public function down()
    {
        // Descriptive copy only.
    }
}
