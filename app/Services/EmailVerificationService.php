<?php

namespace App\Services;

use App\Models\UserModel;

class EmailVerificationService
{
    protected UserModel $userModel;
    protected EmailService $emailService;
    protected $db;

    public function __construct()
    {
        $this->userModel = new UserModel();
        $this->emailService = new EmailService();
        $this->db = \Config\Database::connect();
    }

    public function sendVerificationEmail(array $user): bool
    {
        if (!empty($user['email_verified_at'])) {
            return true;
        }

        $token = bin2hex(random_bytes(32));

        $this->db->table('email_verifications')->where('user_id', $user['id'])->delete();
        $this->db->table('email_verifications')->insert([
            'user_id' => $user['id'],
            'email' => $user['email'],
            'token' => $token,
            'expires_at' => date('Y-m-d H:i:s', strtotime('+24 hours')),
            'created_at' => date('Y-m-d H:i:s'),
        ]);

        return $this->emailService->sendVerificationEmail($user, $token);
    }

    public function verifyEmail(string $token): bool
    {
        $record = $this->db->table('email_verifications')
            ->where('token', $token)
            ->where('expires_at >=', date('Y-m-d H:i:s'))
            ->get()
            ->getRowArray();

        if (!$record) {
            throw new \Exception('Verification link is invalid or has expired');
        }

        $this->userModel->update($record['user_id'], [
            'email_verified_at' => date('Y-m-d H:i:s'),
        ]);

        $this->db->table('email_verifications')->where('user_id', $record['user_id'])->delete();

        $user = $this->userModel->find($record['user_id']);
        if ($user) {
            $this->emailService->sendWelcomeEmail($user);
        }

        return true;
    }

    public function resendVerificationEmail(string $email): bool
    {
        $user = $this->userModel->where('email', $email)->first();
        if (!$user) {
            return true;
        }

        if (!empty($user['email_verified_at'])) {
            return true;
        }

        return $this->sendVerificationEmail($user);
    }
}
