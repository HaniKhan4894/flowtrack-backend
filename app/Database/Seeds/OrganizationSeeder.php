<?php

namespace App\Database\Seeds;

use CodeIgniter\Database\Seeder;

class OrganizationSeeder extends Seeder
{
    public function run()
    {
        $db = \Config\Database::connect();

        // ========================================
        // 1. Create Test User
        // ========================================
        $userModel = new \App\Models\UserModel();

        // Check if user already exists
        $existingUser = $userModel->where('email', 'admin@flowtrack.com')->first();

        if (!$existingUser) {
            $userId = $userModel->insert([
                'email' => 'admin@flowtrack.com',
                'password_hash' => password_hash('Admin@1122', PASSWORD_DEFAULT),
                'first_name' => 'Admin',
                'last_name' => 'User',
                'role' => 'user',
                'is_active' => true,
            ]);
            echo "✓ Created user: admin@flowtrack.com (Password: Admin@1122)\n";
        } else {
            $userId = $existingUser['id'];
            echo "✓ User already exists: admin@flowtrack.com\n";
        }

        // ========================================
        // 2. Create Organization
        // ========================================
        $orgModel = new \App\Models\OrganizationModel();

        // Check if organization already exists
        $existingOrg = $orgModel->where('owner_id', $userId)->first();

        if (!$existingOrg) {
            $orgId = $orgModel->insert([
                'name' => 'FlowTrack Demo Organization',
                'owner_id' => $userId,
                'is_active' => true,
                'trial_ends_at' => date('Y-m-d H:i:s', strtotime('+30 days')),
            ]);
            echo "✓ Created organization: FlowTrack Demo Organization\n";
        } else {
            $orgId = $existingOrg['id'];
            echo "✓ Organization already exists: {$existingOrg['name']}\n";
        }

        // ========================================
        // 3. Add User as Organization Admin Member
        // ========================================
        $memberModel = new \App\Models\OrganizationMemberModel();

        // Check if membership exists
        $existingMember = $memberModel
            ->where('organization_id', $orgId)
            ->where('user_id', $userId)
            ->first();

        if (!$existingMember) {
            $memberModel->insert([
                'organization_id' => $orgId,
                'user_id' => $userId,
                'role' => 'admin',
            ]);
            echo "✓ Added user as admin member of organization\n";
        } else {
            echo "✓ User already a member of organization\n";
        }

        // ========================================
        // 4. Ensure Roles Exist
        // ========================================
        $this->ensureRolesExist($db);

        // ========================================
        // 5. Ensure Permissions Exist  
        // ========================================
        $this->ensurePermissionsExist($db);

        // ========================================
        // 6. Create Sample Project
        // ========================================
        $projectModel = new \App\Models\ProjectModel();

        $existingProject = $projectModel
            ->where('organization_id', $orgId)
            ->where('name', 'Sample Project')
            ->first();

        if (!$existingProject) {
            $projectId = $projectModel->insert([
                'organization_id' => $orgId,
                'name' => 'Sample Project',
                'description' => 'A demo project for testing',
                'status' => 'active',
                'created_by' => $userId,
            ]);
            echo "✓ Created sample project\n";
        } else {
            $projectId = $existingProject['id'];
            echo "✓ Sample project already exists\n";
        }

        // ========================================
        // 7. Create Sample Task
        // ========================================
        if (isset($projectId)) {
            $taskModel = new \App\Models\TaskModel();

            $existingTask = $taskModel
                ->where('project_id', $projectId)
                ->where('title', 'Sample Task')
                ->first();

            if (!$existingTask) {
                $taskModel->insert([
                    'project_id' => $projectId,
                    'title' => 'Sample Task',
                    'description' => 'Complete the testing workflow',
                    'status' => 'in_progress',
                    'priority' => 'medium',
                    'assigned_to' => $userId,
                    'created_by' => $userId,
                ]);
                echo "✓ Created sample task\n";
            } else {
                echo "✓ Sample task already exists\n";
            }
        }

        echo "\n========================================\n";
        echo "Seeding Complete!\n";
        echo "========================================\n";
        echo "Login credentials:\n";
        echo "  Email: admin@flowtrack.com\n";
        echo "  Password: Admin@1122\n";
        echo "========================================\n";
    }

    private function ensureRolesExist($db)
    {
        $roles = [
            ['name' => 'Owner', 'slug' => 'owner', 'description' => 'Organization owner with full access'],
            ['name' => 'Admin', 'slug' => 'admin', 'description' => 'Administrator with full access'],
            ['name' => 'Manager', 'slug' => 'manager', 'description' => 'Team manager with elevated privileges'],
            ['name' => 'Member', 'slug' => 'member', 'description' => 'Regular team member'],
        ];

        foreach ($roles as $role) {
            $exists = $db->table('roles')->where('slug', $role['slug'])->get()->getRowArray();
            if (!$exists) {
                $db->table('roles')->insert($role);
                echo "✓ Created role: {$role['name']}\n";
            }
        }
    }

    private function ensurePermissionsExist($db)
    {
        $permissions = [
            // Time tracking
            ['name' => 'View Own Time', 'slug' => 'time.view_own', 'category' => 'time', 'description' => 'View own time entries'],
            ['name' => 'View Team Time', 'slug' => 'time.view_team', 'category' => 'time', 'description' => 'View team time entries'],
            ['name' => 'Create Time Entry', 'slug' => 'time.create', 'category' => 'time', 'description' => 'Create time entries'],
            ['name' => 'Edit Own Time', 'slug' => 'time.edit_own', 'category' => 'time', 'description' => 'Edit own time entries'],
            ['name' => 'Delete Own Time', 'slug' => 'time.delete_own', 'category' => 'time', 'description' => 'Delete own time entries'],

            // Screenshots
            ['name' => 'View Own Screenshots', 'slug' => 'screenshots.view_own', 'category' => 'screenshots', 'description' => 'View own screenshots'],
            ['name' => 'View Team Screenshots', 'slug' => 'screenshots.view_team', 'category' => 'screenshots', 'description' => 'View team screenshots'],
            ['name' => 'Create Screenshot', 'slug' => 'screenshots.create', 'category' => 'screenshots', 'description' => 'Upload screenshots'],

            // Projects
            ['name' => 'View Projects', 'slug' => 'projects.view', 'category' => 'projects', 'description' => 'View projects'],
            ['name' => 'Create Projects', 'slug' => 'projects.create', 'category' => 'projects', 'description' => 'Create new projects'],

            // Activity
            ['name' => 'View Own Activity', 'slug' => 'activity.view_own', 'category' => 'activity', 'description' => 'View own activity logs'],
            ['name' => 'View Team Activity', 'slug' => 'activity.view_team', 'category' => 'activity', 'description' => 'View team activity logs'],
        ];

        foreach ($permissions as $permission) {
            $exists = $db->table('permissions')->where('slug', $permission['slug'])->get()->getRowArray();
            if (!$exists) {
                $db->table('permissions')->insert($permission);
            }
        }

        echo "✓ Ensured all permissions exist\n";
    }
}
