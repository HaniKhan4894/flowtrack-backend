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
            $adminRole = $db->table('roles')->where('slug', 'admin')->get()->getRowArray();
            $memberModel->insert([
                'organization_id' => $orgId,
                'user_id' => $userId,
                'role' => 'admin',
                'role_id' => $adminRole['id'] ?? null,
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
                'is_active' => true,
                'is_billable' => true,
                'created_at' => date('Y-m-d H:i:s'),
                'updated_at' => date('Y-m-d H:i:s'),
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
                ->where('name', 'Sample Task')
                ->first();

            if (!$existingTask) {
                $taskModel->insert([
                    'project_id' => $projectId,
                    'name' => 'Sample Task',
                    'description' => 'Complete the testing workflow',
                    'is_active' => true,
                    'created_at' => date('Y-m-d H:i:s'),
                    'updated_at' => date('Y-m-d H:i:s'),
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

        // Ensure critical permission slugs used by routes exist
        $criticalSlugs = ['activity.create', 'screenshots.create', 'reports.view_own', 'reports.view_team'];
        foreach ($criticalSlugs as $slug) {
            $exists = $db->table('permissions')->where('slug', $slug)->get()->getRowArray();
            if (!$exists) {
                $db->table('permissions')->insert([
                    'name' => ucwords(str_replace('.', ' ', $slug)),
                    'slug' => $slug,
                    'category' => explode('.', $slug)[0],
                    'description' => 'Auto-added by OrganizationSeeder',
                ]);
            }
        }

        $this->assignRolePermissions($db);

        echo "✓ Ensured all permissions exist\n";
    }

    private function assignRolePermissions($db)
    {
        $roleMap = [];
        foreach ($db->table('roles')->get()->getResultArray() as $role) {
            $roleMap[$role['slug']] = $role['id'];
        }

        $permMap = [];
        foreach ($db->table('permissions')->get()->getResultArray() as $perm) {
            $permMap[$perm['slug']] = $perm['id'];
        }

        $grant = function (string $roleSlug, array $permissionSlugs) use ($db, $roleMap, $permMap) {
            if (!isset($roleMap[$roleSlug])) {
                return;
            }

            foreach ($permissionSlugs as $slug) {
                if (!isset($permMap[$slug])) {
                    continue;
                }
                $exists = $db->table('role_permissions')
                    ->where('role_id', $roleMap[$roleSlug])
                    ->where('permission_id', $permMap[$slug])
                    ->get()
                    ->getRowArray();

                if (!$exists) {
                    $db->table('role_permissions')->insert([
                        'role_id' => $roleMap[$roleSlug],
                        'permission_id' => $permMap[$slug],
                    ]);
                }
            }
        };

        $member = ['time.view_own', 'time.edit_own', 'projects.view', 'screenshots.view_own', 'screenshots.create', 'activity.view_own', 'activity.create', 'reports.view_own'];
        $manager = array_merge($member, ['time.view_team', 'projects.create', 'projects.edit', 'screenshots.view_team', 'activity.view_team', 'reports.view_team', 'reports.export']);
        $admin = array_keys($permMap);

        $grant('member', $member);
        $grant('manager', $manager);
        $grant('admin', $admin);
        $grant('owner', $admin);
    }
}
