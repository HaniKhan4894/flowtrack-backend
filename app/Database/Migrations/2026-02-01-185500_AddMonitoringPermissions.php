<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddMonitoringPermissions extends Migration
{
    public function up()
    {
        // 1. Add missing permissions
        $permissions = [
            ['name' => 'View Own Activity', 'slug' => 'activity.view_own', 'category' => 'activity', 'description' => 'View own activity logs'],
            ['name' => 'View Team Activity', 'slug' => 'activity.view_team', 'category' => 'activity', 'description' => 'View team activity logs'],
            ['name' => 'Create Activity Log', 'slug' => 'activity.create', 'category' => 'activity', 'description' => 'Create/Sync activity logs'],
            ['name' => 'Create Screenshot', 'slug' => 'screenshots.create', 'category' => 'screenshots', 'description' => 'Upload screenshots'],
        ];

        foreach ($permissions as $permission) {
            $exists = $this->db->table('permissions')
                ->where('slug', $permission['slug'])
                ->countAllResults();
            
            if ($exists === 0) {
                $this->db->table('permissions')->insert($permission);
            }
        }

        // 2. Assign permissions to roles
        $this->assignPermissionsToRoles();
    }

    private function assignPermissionsToRoles()
    {
        // Get permissions by slug for easier mapping
        $permissions = $this->db->table('permissions')->get()->getResultArray();
        $permMap = [];
        foreach ($permissions as $p) {
            $permMap[$p['slug']] = $p['id'];
        }

        $roles = $this->db->table('roles')->get()->getResultArray();
        $roleMap = [];
        foreach ($roles as $r) {
            $roleMap[$r['slug']] = $r['id'];
        }

        $assignments = [];

        // Member
        $memberSlugs = ['activity.view_own', 'activity.create', 'screenshots.create', 'screenshots.view_own'];
        foreach ($memberSlugs as $slug) {
            if (isset($permMap[$slug]) && isset($roleMap['member'])) {
                 // Check if already assigned (to avoid duplicates)
                 $exists = $this->db->table('role_permissions')
                 ->where('role_id', $roleMap['member'])
                 ->where('permission_id', $permMap[$slug])
                 ->countAllResults();
             
                if ($exists === 0) {
                    $assignments[] = ['role_id' => $roleMap['member'], 'permission_id' => $permMap[$slug]];
                }
            }
        }

        // Manager / Admin / Owner
        $leaderSlugs = ['activity.view_own', 'activity.view_team', 'activity.create', 'screenshots.create', 'screenshots.view_own', 'screenshots.view_team', 'screenshots.blur', 'screenshots.delete'];
        $leaderRoles = ['manager', 'admin', 'owner'];
        
        foreach ($leaderRoles as $roleSlug) {
            if (!isset($roleMap[$roleSlug])) continue;
            
            foreach ($leaderSlugs as $slug) {
                if (!isset($permMap[$slug])) continue;
                
                // Check if already assigned (to avoid duplicates)
                $exists = $this->db->table('role_permissions')
                    ->where('role_id', $roleMap[$roleSlug])
                    ->where('permission_id', $permMap[$slug])
                    ->countAllResults();
                
                if ($exists === 0) {
                    $assignments[] = ['role_id' => $roleMap[$roleSlug], 'permission_id' => $permMap[$slug]];
                }
            }
        }

        if (!empty($assignments)) {
            $this->db->table('role_permissions')->insertBatch($assignments);
        }
    }

    public function down()
    {
        // Remove permissions
        $slugs = ['activity.view_own', 'activity.view_team', 'activity.create', 'screenshots.create'];
        $this->db->table('permissions')->whereIn('slug', $slugs)->delete();
    }
}
