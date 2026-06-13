<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class ExtendRolesForOwnerAndTeamLead extends Migration
{
    public function up()
    {
        $this->db->query("ALTER TABLE organization_members MODIFY role ENUM('owner','admin','manager','team_lead','member') NOT NULL DEFAULT 'member'");
        $this->db->query("ALTER TABLE users MODIFY role ENUM('owner','admin','manager','team_lead','member') NOT NULL DEFAULT 'member'");

        $exists = $this->db->table('roles')->where('slug', 'team_lead')->countAllResults();
        if ($exists === 0) {
            $this->db->table('roles')->insert([
                'name' => 'Team Lead',
                'slug' => 'team_lead',
                'description' => 'Can view team activity and time, no settings or billing',
                'is_system' => 1,
                'organization_id' => null,
                'created_at' => date('Y-m-d H:i:s'),
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
        }

        $teamLead = $this->db->table('roles')->where('slug', 'team_lead')->get()->getRowArray();
        if ($teamLead) {
            $teamLeadId = (int) $teamLead['id'];
            $slugs = [
                'projects.view',
                'time.view_own', 'time.edit_own', 'time.view_team',
                'screenshots.view_own', 'screenshots.view_team', 'screenshots.create',
                'activity.view_own', 'activity.view_team', 'activity.create',
                'reports.view_own', 'reports.view_team',
            ];
            foreach ($slugs as $slug) {
                $perm = $this->db->table('permissions')->where('slug', $slug)->get()->getRowArray();
                if ($perm) {
                    $exists = $this->db->table('role_permissions')
                        ->where('role_id', $teamLeadId)
                        ->where('permission_id', $perm['id'])
                        ->countAllResults();
                    if ($exists === 0) {
                        $this->db->table('role_permissions')->insert([
                            'role_id' => $teamLeadId,
                            'permission_id' => $perm['id'],
                        ]);
                    }
                }
            }
        }
    }

    public function down()
    {
        $teamLead = $this->db->table('roles')->where('slug', 'team_lead')->get()->getRowArray();
        if ($teamLead) {
            $this->db->table('role_permissions')->where('role_id', $teamLead['id'])->delete();
            $this->db->table('roles')->where('id', $teamLead['id'])->delete();
        }
        $this->db->query("ALTER TABLE organization_members MODIFY role ENUM('admin','manager','member') NOT NULL DEFAULT 'member'");
        $this->db->query("ALTER TABLE users MODIFY role ENUM('admin','manager','member') NOT NULL DEFAULT 'member'");
    }
}
