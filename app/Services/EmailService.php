<?php

namespace App\Services;

use CodeIgniter\Email\Email;

class EmailService
{
    protected $email;

    public function __construct()
    {
        $this->email = \Config\Services::email();
    }

    /**
     * Send welcome email to new user
     */
    public function sendWelcomeEmail(array $user): bool
    {
        try {
            $this->email->setFrom('noreply@flowtrack.com', 'FlowTrack');
            $this->email->setTo($user['email']);
            $this->email->setSubject('Welcome to FlowTrack!');

            $message = $this->getWelcomeEmailTemplate($user);
            $this->email->setMessage($message);

            return $this->email->send();

        } catch (\Exception $e) {
            log_message('error', 'Failed to send welcome email: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Send password reset email
     */
    public function sendPasswordResetEmail(string $email, string $resetToken): bool
    {
        try {
            $this->email->setFrom('noreply@flowtrack.com', 'FlowTrack');
            $this->email->setTo($email);
            $this->email->setSubject('Reset Your Password');

            $resetLink = base_url("reset-password?token={$resetToken}");
            $message = $this->getPasswordResetTemplate($resetLink);
            $this->email->setMessage($message);
            return $this->email->send();

        } catch (\Exception $e) {
            log_message('error', 'Failed to send password reset email: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Send invoice to client
     */
    public function sendInvoiceEmail(array $invoice, string $clientEmail): bool
    {
        try {
            $this->email->setFrom('billing@flowtrack.com', 'FlowTrack Billing');
            $this->email->setTo($clientEmail);
            $this->email->setSubject("Invoice #{$invoice['invoice_number']}");

            $message = $this->getInvoiceEmailTemplate($invoice);
            $this->email->setMessage($message);

            return $this->email->send();

        } catch (\Exception $e) {
            log_message('error', 'Failed to send invoice email: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Send weekly report email
     */
    public function sendWeeklyReport(array $user, array $reportData): bool
    {
        try {
            $this->email->setFrom('reports@flowtrack.com', 'FlowTrack Reports');
            $this->email->setTo($user['email']);
            $this->email->setSubject('Your Weekly Productivity Report');

            $message = $this->getWeeklyReportTemplate($user, $reportData);
            $this->email->setMessage($message);

            return $this->email->send();

        } catch (\Exception $e) {
            log_message('error', 'Failed to send weekly report: ' . $e->getMessage());
            return false;
        }
    }

    // Email Templates

    private function getWelcomeEmailTemplate(array $user): string
    {
        return "
            <html>
            <body style='font-family: Arial, sans-serif;'>
                <h2>Welcome to FlowTrack, {$user['first_name']}!</h2>
                <p>We're excited to have you on board.</p>
                <p>FlowTrack helps you track time, manage projects, and boost productivity.</p>
                <p><a href='" . base_url() . "' style='background: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;'>Get Started</a></p>
                <p>Best regards,<br>The FlowTrack Team</p>
            </body>
            </html>
        ";
    }

    private function getPasswordResetTemplate(string $resetLink): string
    {
        return "
            <html>
            <body style='font-family: Arial, sans-serif;'>
                <h2>Reset Your Password</h2>
                <p>Click the button below to reset your password:</p>
                <p><a href='{$resetLink}' style='background: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;'>Reset Password</a></p>
                <p>This link will expire in 1 hour.</p>
                <p>If you didn't request this, please ignore this email.</p>
            </body>
            </html>
        ";
    }

    private function getInvoiceEmailTemplate(array $invoice): string
    {
        return "
            <html>
            <body style='font-family: Arial, sans-serif;'>
                <h2>Invoice #{$invoice['invoice_number']}</h2>
                <p>Dear {$invoice['client_name']},</p>
                <p>Please find your invoice attached.</p>
                <p><strong>Total: {$invoice['currency']} {$invoice['total']}</strong></p>
                <p>Due Date: {$invoice['due_date']}</p>
                <p>Thank you for your business!</p>
            </body>
            </html>
        ";
    }

    private function getWeeklyReportTemplate(array $user, array $reportData): string
    {
        $totalHours = round($reportData['total_seconds'] / 3600, 2);
        
        return "
            <html>
            <body style='font-family: Arial, sans-serif;'>
                <h2>Your Weekly Report</h2>
                <p>Hi {$user['first_name']},</p>
                <p>Here's your productivity summary for this week:</p>
                <ul>
                    <li><strong>Total Hours:</strong> {$totalHours} hours</li>
                    <li><strong>Projects:</strong> {$reportData['projects_count']}</li>
                    <li><strong>Tasks Completed:</strong> {$reportData['tasks_completed']}</li>
                </ul>
                <p>Keep up the great work!</p>
            </body>
            </html>
        ";
    }
}
