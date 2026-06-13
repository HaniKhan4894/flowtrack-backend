<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class SeedSuperAdminUser extends Migration
{
    public function up()
    {
        $email = env('SUPER_ADMIN_EMAIL', 'superadmin@flowtrack.com');
        $existing = $this->db->table('users')->where('email', $email)->get()->getRowArray();

        if ($existing) {
            $this->db->table('users')->where('id', $existing['id'])->update([
                'is_super_admin' => 1,
                'role' => 'owner',
            ]);

            return;
        }

        $this->db->table('users')->insert([
            'email' => $email,
            'password_hash' => password_hash(env('SUPER_ADMIN_PASSWORD', 'SuperAdmin@1122'), PASSWORD_DEFAULT),
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'role' => 'owner',
            'is_active' => 1,
            'is_super_admin' => 1,
            'email_verified_at' => date('Y-m-d H:i:s'),
            'created_at' => date('Y-m-d H:i:s'),
            'updated_at' => date('Y-m-d H:i:s'),
        ]);
    }

    public function down()
    {
        $email = env('SUPER_ADMIN_EMAIL', 'superadmin@flowtrack.com');
        $this->db->table('users')->where('email', $email)->update(['is_super_admin' => 0]);
    }
}
