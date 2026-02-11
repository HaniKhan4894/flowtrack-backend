<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class UpdateOrganizationsTableForSubscriptions extends Migration
{
    public function up()
    {
        // Remove old plan column
        if ($this->db->fieldExists('plan', 'organizations')) {
            $this->forge->dropColumn('organizations', 'plan');
        }
        
        // Remove billing_email if exists (now in subscriptions)
        if ($this->db->fieldExists('billing_email', 'organizations')) {
            $this->forge->dropColumn('organizations', 'billing_email');
        }
    }

    public function down()
    {
        // Add back plan column for rollback
        $this->forge->addColumn('organizations', [
            'plan' => [
                'type' => 'ENUM',
                'constraint' => ['free', 'starter', 'professional', 'enterprise'],
                'default' => 'free',
                'after' => 'slug',
            ],
        ]);
    }
}
