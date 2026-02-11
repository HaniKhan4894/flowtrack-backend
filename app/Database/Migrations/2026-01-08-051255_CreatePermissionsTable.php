<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreatePermissionsTable extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => [
                'type' => 'BIGINT',
                'constraint' => 20,
                'unsigned' => true,
                'auto_increment' => true,
            ],
            'name' => [
                'type' => 'VARCHAR',
                'constraint' => 100,
            ],
            'slug' => [
                'type' => 'VARCHAR',
                'constraint' => 100,
                'unique' => true,
            ],
            'category' => [
                'type' => 'VARCHAR',
                'constraint' => 50,
                'comment' => 'users, projects, time, reports, settings, etc.',
            ],
            'description' => [
                'type' => 'TEXT',
                'null' => true,
            ],
            'created_at' => [
                'type' => 'TIMESTAMP',
                'null' => true,
            ],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey('category');
        $this->forge->createTable('permissions');

        // Insert default permissions
        $permissions = [
            // Users
            ['name' => 'View Users', 'slug' => 'users.view', 'category' => 'users', 'description' => 'View user list'],
            ['name' => 'Create Users', 'slug' => 'users.create', 'category' => 'users', 'description' => 'Create new users'],
            ['name' => 'Edit Users', 'slug' => 'users.edit', 'category' => 'users', 'description' => 'Edit user details'],
            ['name' => 'Delete Users', 'slug' => 'users.delete', 'category' => 'users', 'description' => 'Delete users'],
            
            // Projects
            ['name' => 'View Projects', 'slug' => 'projects.view', 'category' => 'projects', 'description' => 'View projects'],
            ['name' => 'Create Projects', 'slug' => 'projects.create', 'category' => 'projects', 'description' => 'Create new projects'],
            ['name' => 'Edit Projects', 'slug' => 'projects.edit', 'category' => 'projects', 'description' => 'Edit project details'],
            ['name' => 'Delete Projects', 'slug' => 'projects.delete', 'category' => 'projects', 'description' => 'Delete projects'],
            ['name' => 'Archive Projects', 'slug' => 'projects.archive', 'category' => 'projects', 'description' => 'Archive projects'],
            
            // Time Tracking
            ['name' => 'View Own Time', 'slug' => 'time.view_own', 'category' => 'time', 'description' => 'View own time entries'],
            ['name' => 'View Team Time', 'slug' => 'time.view_team', 'category' => 'time', 'description' => 'View team time entries'],
            ['name' => 'View All Time', 'slug' => 'time.view_all', 'category' => 'time', 'description' => 'View all time entries'],
            ['name' => 'Edit Own Time', 'slug' => 'time.edit_own', 'category' => 'time', 'description' => 'Edit own time entries'],
            ['name' => 'Edit Team Time', 'slug' => 'time.edit_team', 'category' => 'time', 'description' => 'Edit team time entries'],
            ['name' => 'Delete Time', 'slug' => 'time.delete', 'category' => 'time', 'description' => 'Delete time entries'],
            
            // Screenshots
            ['name' => 'View Own Screenshots', 'slug' => 'screenshots.view_own', 'category' => 'screenshots', 'description' => 'View own screenshots'],
            ['name' => 'View Team Screenshots', 'slug' => 'screenshots.view_team', 'category' => 'screenshots', 'description' => 'View team screenshots'],
            ['name' => 'Blur Screenshots', 'slug' => 'screenshots.blur', 'category' => 'screenshots', 'description' => 'Blur screenshots'],
            ['name' => 'Delete Screenshots', 'slug' => 'screenshots.delete', 'category' => 'screenshots', 'description' => 'Delete screenshots'],
            
            // Reports
            ['name' => 'View Own Reports', 'slug' => 'reports.view_own', 'category' => 'reports', 'description' => 'View own reports'],
            ['name' => 'View Team Reports', 'slug' => 'reports.view_team', 'category' => 'reports', 'description' => 'View team reports'],
            ['name' => 'View All Reports', 'slug' => 'reports.view_all', 'category' => 'reports', 'description' => 'View all reports'],
            ['name' => 'Export Reports', 'slug' => 'reports.export', 'category' => 'reports', 'description' => 'Export reports'],
            
            // Invoices
            ['name' => 'View Invoices', 'slug' => 'invoices.view', 'category' => 'invoices', 'description' => 'View invoices'],
            ['name' => 'Create Invoices', 'slug' => 'invoices.create', 'category' => 'invoices', 'description' => 'Create invoices'],
            ['name' => 'Edit Invoices', 'slug' => 'invoices.edit', 'category' => 'invoices', 'description' => 'Edit invoices'],
            ['name' => 'Send Invoices', 'slug' => 'invoices.send', 'category' => 'invoices', 'description' => 'Send invoices to clients'],
            
            // Settings
            ['name' => 'View Settings', 'slug' => 'settings.view', 'category' => 'settings', 'description' => 'View organization settings'],
            ['name' => 'Edit Settings', 'slug' => 'settings.edit', 'category' => 'settings', 'description' => 'Edit organization settings'],
            ['name' => 'Manage Billing', 'slug' => 'settings.billing', 'category' => 'settings', 'description' => 'Manage billing and subscription'],
        ];

        $this->db->table('permissions')->insertBatch($permissions);
    }

    public function down()
    {
        $this->forge->dropTable('permissions');
    }
}
