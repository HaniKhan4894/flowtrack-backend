<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateProjectMembersAndInvitationProjects extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => [
                'type'           => 'BIGINT',
                'constraint'     => 20,
                'unsigned'       => true,
                'auto_increment' => true,
            ],
            'organization_id' => [
                'type'       => 'BIGINT',
                'constraint' => 20,
                'unsigned'   => true,
            ],
            'project_id' => [
                'type'       => 'BIGINT',
                'constraint' => 20,
                'unsigned'   => true,
            ],
            'user_id' => [
                'type'       => 'BIGINT',
                'constraint' => 20,
                'unsigned'   => true,
            ],
            'assigned_by' => [
                'type'       => 'BIGINT',
                'constraint' => 20,
                'unsigned'   => true,
                'null'       => true,
            ],
            'created_at' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
            'updated_at' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey(['project_id', 'user_id'], 'project_members_project_user_unique');
        $this->forge->addKey(['organization_id', 'user_id'], false, false, 'project_members_org_user');
        $this->forge->addKey('user_id');
        $this->forge->addForeignKey('organization_id', 'organizations', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('user_id', 'users', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('project_members', true);

        if ($this->db->tableExists('organization_invitations') && !$this->db->fieldExists('project_ids', 'organization_invitations')) {
            $this->forge->addColumn('organization_invitations', [
                'project_ids' => [
                    'type' => 'TEXT',
                    'null' => true,
                    'after' => 'role',
                ],
            ]);
        }
    }

    public function down()
    {
        if ($this->db->tableExists('organization_invitations') && $this->db->fieldExists('project_ids', 'organization_invitations')) {
            $this->forge->dropColumn('organization_invitations', 'project_ids');
        }
        $this->forge->dropTable('project_members', true);
    }
}
