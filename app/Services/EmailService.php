<?php

namespace App\Services;

use CodeIgniter\Email\Email;
use Config\Email as EmailConfig;

class EmailService
{
    protected Email $email;
    protected EmailConfig $config;

    public function __construct()
    {
        $this->email = \Config\Services::email();
        $this->config = config('Email');
    }

    private function frontendUrl(string $path = ''): string
    {
        $base = rtrim((string) env('app.frontendURL', 'https://flowtrackhani.vercel.app'), '/');
        return $path ? $base . '/' . ltrim($path, '/') : $base;
    }

    private function sendMail(
        string $to,
        string $subject,
        string $htmlMessage,
        ?string $fromEmail = null,
        ?string $fromName = null
    ): bool {
        try {
            $this->email->clear(true);
            $this->email->setFrom(
                $fromEmail ?? $this->config->fromEmail,
                $fromName ?? $this->config->fromName
            );
            $this->email->setTo($to);
            $this->email->setSubject($subject);
            $this->email->setMailType('html');
            $this->email->setMessage($htmlMessage);

            if (!$this->email->send()) {
                log_message('error', 'Email send failed: ' . $this->email->printDebugger(['headers', 'subject']));
                return false;
            }

            return true;
        } catch (\Exception $e) {
            log_message('error', 'Failed to send email: ' . $e->getMessage());
            return false;
        }
    }

    public function sendVerificationEmail(array $user, string $token): bool
    {
        $verifyLink = $this->frontendUrl('verify-email?token=' . urlencode($token));
        $name = $user['first_name'] ?? 'there';

        $message = $this->wrapTemplate(
            'Verify your FlowTrack email',
            "
                <p>Hi {$name},</p>
                <p>Thanks for signing up for FlowTrack. Please confirm your email address to activate your account.</p>
                <p><a href='{$verifyLink}' style='background:#4F46E5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;'>Verify Email Address</a></p>
                <p style='color:#94a3b8;font-size:14px;'>This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>
                <p style='color:#94a3b8;font-size:13px;word-break:break-all;'>{$verifyLink}</p>
            "
        );

        return $this->sendMail($user['email'], 'Verify your FlowTrack account', $message);
    }

    public function sendWelcomeEmail(array $user): bool
    {
        $name = $user['first_name'] ?? 'there';
        $loginLink = $this->frontendUrl('login');

        $message = $this->wrapTemplate(
            'Welcome to FlowTrack',
            "
                <p>Hi {$name},</p>
                <p>Your email is verified and your FlowTrack account is ready.</p>
                <p>Track time, capture screenshots, manage projects, and keep your team aligned from one platform.</p>
                <p><a href='{$loginLink}' style='background:#4F46E5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;'>Go to Dashboard</a></p>
            "
        );

        return $this->sendMail($user['email'], 'Welcome to FlowTrack!', $message);
    }

    public function sendPasswordResetEmail(string $email, string $resetToken): bool
    {
        $resetLink = $this->frontendUrl('reset-password?token=' . urlencode($resetToken));

        $message = $this->wrapTemplate(
            'Reset your password',
            "
                <p>We received a request to reset your FlowTrack password.</p>
                <p><a href='{$resetLink}' style='background:#4F46E5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;'>Reset Password</a></p>
                <p style='color:#94a3b8;font-size:14px;'>This link expires in 1 hour. If you did not request a reset, please ignore this email.</p>
                <p style='color:#94a3b8;font-size:13px;word-break:break-all;'>{$resetLink}</p>
            "
        );

        return $this->sendMail($email, 'Reset your FlowTrack password', $message);
    }

    public function sendTeamInvitationEmail(
        string $email,
        string $organizationName,
        string $role,
        string $token,
        ?string $inviterName = null
    ): bool {
        $inviteLink = $this->frontendUrl('register?invitation_token=' . urlencode($token));
        $inviterText = $inviterName ? "<strong>{$inviterName}</strong> has" : 'You have been';

        $message = $this->wrapTemplate(
            'Team invitation',
            "
                <p>Hello,</p>
                <p>{$inviterText} invited you to join <strong>{$organizationName}</strong> on FlowTrack as a <strong>{$role}</strong>.</p>
                <p>Click below to create your account and join the team:</p>
                <p><a href='{$inviteLink}' style='background:#4F46E5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;'>Accept Invitation</a></p>
                <p style='color:#94a3b8;font-size:14px;'>This invitation expires in 7 days.</p>
                <p style='color:#94a3b8;font-size:13px;word-break:break-all;'>{$inviteLink}</p>
            "
        );

        return $this->sendMail($email, "You're invited to {$organizationName} on FlowTrack", $message);
    }

    public function sendInvoiceEmail(array $invoice, string $clientEmail): bool
    {
        $message = $this->wrapTemplate(
            "Invoice #{$invoice['invoice_number']}",
            "
                <p>Dear {$invoice['client_name']},</p>
                <p>Please find your invoice details below.</p>
                <p><strong>Total:</strong> {$invoice['currency']} {$invoice['total']}</p>
                <p><strong>Due Date:</strong> {$invoice['due_date']}</p>
                <p>Thank you for your business.</p>
            "
        );

        return $this->sendMail(
            $clientEmail,
            "Invoice #{$invoice['invoice_number']}",
            $message,
            $this->config->fromEmail,
            $this->config->fromName . ' Billing'
        );
    }

    public function sendWeeklyReport(array $user, array $reportData): bool
    {
        $totalHours = round(($reportData['total_seconds'] ?? 0) / 3600, 2);
        $name = $user['first_name'] ?? 'there';

        $message = $this->wrapTemplate(
            'Weekly productivity report',
            "
                <p>Hi {$name},</p>
                <p>Here is your productivity summary for this week:</p>
                <ul>
                    <li><strong>Total Hours:</strong> {$totalHours}</li>
                    <li><strong>Projects:</strong> {$reportData['projects_count']}</li>
                    <li><strong>Tasks Completed:</strong> {$reportData['tasks_completed']}</li>
                </ul>
            "
        );

        return $this->sendMail(
            $user['email'],
            'Your weekly FlowTrack report',
            $message,
            $this->config->fromEmail,
            $this->config->fromName . ' Reports'
        );
    }

    private function wrapTemplate(string $title, string $bodyHtml): string
    {
        return "
            <html>
            <body style='margin:0;padding:0;background:#0f172a;font-family:Arial,sans-serif;color:#e2e8f0;'>
                <div style='max-width:600px;margin:0 auto;padding:32px 24px;'>
                    <div style='background:#111827;border:1px solid #1f2937;border-radius:16px;padding:28px;'>
                        <h2 style='margin:0 0 16px;color:#fff;font-size:24px;'>{$title}</h2>
                        <div style='font-size:15px;line-height:1.7;color:#cbd5e1;'>{$bodyHtml}</div>
                    </div>
                    <p style='text-align:center;color:#64748b;font-size:12px;margin-top:20px;'>
                        &copy; " . date('Y') . " FlowTrack. All rights reserved.
                    </p>
                </div>
            </body>
            </html>
        ";
    }
}
