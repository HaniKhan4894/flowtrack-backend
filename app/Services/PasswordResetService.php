<?php

namespace App\Services;

use App\Models\UserModel;
use App\Services\EmailService;

class PasswordResetService
{
    protected $userModel;
    protected $emailService;
    protected $db;

    public function __construct()
    {
        $this->userModel = new UserModel();
        $this->emailService = new EmailService();
        $this->db = \Config\Database::connect();
    }

    /**
     * Send password reset email
     */
    public function sendResetEmail(string $email): bool
    {
        // Check if user exists
        $user = $this->userModel->where('email', $email)->first();

        if (!$user) {
            // Don't reveal if email exists or not (security)
            return true;
        }

        // Generate reset token
        $token = bin2hex(random_bytes(32));

        // Delete old tokens for this email
        $this->db->table('password_resets')->where('email', $email)->delete();

        // Save new token
        $this->db->table('password_resets')->insert([
            'email' => $email,
            'token' => hash('sha256', $token),
            'created_at' => date('Y-m-d H:i:s')
        ]);

        // Send email
        return $this->emailService->sendPasswordResetEmail($email, $token);
    }

    /**
     * Reset password using token
     */
    public function resetPassword(string $token, string $newPassword): bool
    {
        $hashedToken = hash('sha256', $token);

        // Find token
        $reset = $this->db->table('password_resets')
            ->where('token', $hashedToken)
            ->where('created_at >', date('Y-m-d H:i:s', strtotime('-1 hour')))
            ->get()
            ->getRowArray();

        if (!$reset) {
            throw new \Exception('Invalid or expired reset token');
        }

        // Update password
        $this->userModel->where('email', $reset['email'])->set([
            'password_hash' => password_hash($newPassword, PASSWORD_DEFAULT)
        ])->update();

        // Delete used token
        $this->db->table('password_resets')->where('email', $reset['email'])->delete();

        return true;
    }

    /**
     * Cleanup expired tokens (run via cron)
     */
    public function cleanupExpiredTokens(): int
    {
        return $this->db->table('password_resets')
            ->where('created_at <', date('Y-m-d H:i:s', strtotime('-1 hour')))
            ->delete();
    }
}
