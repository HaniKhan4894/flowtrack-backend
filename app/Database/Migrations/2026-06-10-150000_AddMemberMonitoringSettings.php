<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddMemberMonitoringSettings extends Migration
{
    public function up()
    {
        $this->forge->addColumn('organization_members', [
            'tracking_enabled' => [
                'type' => 'BOOLEAN',
                'default' => true,
                'after' => 'hourly_rate',
            ],
            'screenshots_enabled' => [
                'type' => 'BOOLEAN',
                'default' => true,
                'after' => 'tracking_enabled',
            ],
            'screenshot_disabled_until' => [
                'type' => 'DATETIME',
                'null' => true,
                'after' => 'screenshots_enabled',
            ],
            'screenshot_disabled_from' => [
                'type' => 'DATETIME',
                'null' => true,
                'after' => 'screenshot_disabled_until',
            ],
            'screenshot_disabled_to' => [
                'type' => 'DATETIME',
                'null' => true,
                'after' => 'screenshot_disabled_from',
            ],
        ]);
    }

    public function down()
    {
        $this->forge->dropColumn('organization_members', [
            'tracking_enabled',
            'screenshots_enabled',
            'screenshot_disabled_until',
            'screenshot_disabled_from',
            'screenshot_disabled_to',
        ]);
    }
}
