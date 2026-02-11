<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class UpdateOrganizationMembersForRoles extends Migration
{
    public function up()
    {
        // Add role_id column
        $this->forge->addColumn('organization_members', [
            'role_id' => [
                'type' => 'BIGINT',
                'constraint' => 20,
                'unsigned' => true,
                'null' => true,
                'after' => 'user_id',
            ],
        ]);

        // Add foreign key
        $this->forge->processIndexes('organization_members');
        $this->db->query('ALTER TABLE organization_members ADD CONSTRAINT fk_org_members_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL ON UPDATE CASCADE');

        // Migrate existing role data to role_id
        $this->migrateExistingRoles();

        // Drop old role column after migration
        // $this->forge->dropColumn('organization_members', 'role');
    }

    private function migrateExistingRoles()
    {
        $roles = [
            'admin' => $this->db->table('roles')->where('slug', 'admin')->get()->getRow()->id,
            'manager' => $this->db->table('roles')->where('slug', 'manager')->get()->getRow()->id,
            'member' => $this->db->table('roles')->where('slug', 'member')->get()->getRow()->id,
        ];

        foreach ($roles as $roleSlug => $roleId) {
            $this->db->table('organization_members')
                ->where('role', $roleSlug)
                ->update(['role_id' => $roleId]);
        }
    }

    public function down()
    {
        $this->db->query('ALTER TABLE organization_members DROP FOREIGN KEY fk_org_members_role');
        $this->forge->dropColumn('organization_members', 'role_id');
    }
}
