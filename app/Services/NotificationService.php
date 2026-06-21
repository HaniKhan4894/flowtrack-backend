<?php

namespace App\Services;

use App\Models\NotificationModel;

class NotificationService
{
    protected NotificationModel $notificationModel;
    protected NotificationPreferenceService $preferenceService;
    protected EmailService $emailService;
    protected $db;

    public function __construct()
    {
        $this->notificationModel = new NotificationModel();
        $this->preferenceService = new NotificationPreferenceService();
        $this->emailService = new EmailService();
        $this->db = \Config\Database::connect();
    }

    /**
     * Create notification when user preferences allow in-app alerts.
     */
    public function create(int $userId, string $type, string $title, string $message, ?array $data = null, ?string $eventKey = null): ?array
    {
        if ($eventKey && !$this->preferenceService->shouldNotify($userId, $eventKey, 'in_app')) {
            return null;
        }

        $notificationId = $this->notificationModel->insert([
            'user_id' => $userId,
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'data' => $data ? json_encode($data) : null,
        ]);

        return $this->notificationModel->find($notificationId);
    }

    public function getUserNotifications(int $userId, bool $unreadOnly = false, int $limit = 50): array
    {
        $builder = $this->notificationModel->builder();
        $builder->where('user_id', $userId);

        if ($unreadOnly) {
            $builder->where('is_read', false);
        }

        return $builder->orderBy('created_at', 'DESC')
            ->limit($limit)
            ->get()
            ->getResultArray();
    }

    public function markAsRead(int $notificationId, int $userId): bool
    {
        return $this->notificationModel
            ->where('id', $notificationId)
            ->where('user_id', $userId)
            ->set([
                'is_read' => true,
                'read_at' => date('Y-m-d H:i:s'),
            ])
            ->update();
    }

    public function markAllAsRead(int $userId): bool
    {
        return $this->notificationModel
            ->where('user_id', $userId)
            ->where('is_read', false)
            ->set([
                'is_read' => true,
                'read_at' => date('Y-m-d H:i:s'),
            ])
            ->update();
    }

    public function delete(int $notificationId, int $userId): bool
    {
        return $this->notificationModel
            ->where('id', $notificationId)
            ->where('user_id', $userId)
            ->delete();
    }

    public function getUnreadCount(int $userId): int
    {
        return $this->notificationModel
            ->where('user_id', $userId)
            ->where('is_read', false)
            ->countAllResults();
    }

    public function notifyTimeEntryStarted(int $userId, array $timeEntry): ?array
    {
        return $this->create(
            $userId,
            'info',
            'Timer Started',
            'You started tracking time' . (!empty($timeEntry['project_name']) ? ' for ' . $timeEntry['project_name'] : ''),
            ['time_entry_id' => $timeEntry['id']],
            NotificationPreferenceService::EVENT_TIME_ENTRY_STARTED
        );
    }

    public function notifyTimeEntryStopped(int $userId, array $timeEntry): ?array
    {
        $hours = round(((int) ($timeEntry['duration_seconds'] ?? 0)) / 3600, 2);

        return $this->create(
            $userId,
            'info',
            'Timer Stopped',
            "You tracked {$hours}h" . (!empty($timeEntry['project_name']) ? ' on ' . $timeEntry['project_name'] : ''),
            ['time_entry_id' => $timeEntry['id']],
            NotificationPreferenceService::EVENT_TIME_ENTRY_STOPPED
        );
    }

    public function notifyTimesheetSubmitted(int $approverId, array $period, int $submitterId): ?array
    {
        $submitter = $this->db->table('users')->where('id', $submitterId)->get()->getRowArray();
        $name = trim(($submitter['first_name'] ?? '') . ' ' . ($submitter['last_name'] ?? '')) ?: 'A team member';

        $notification = $this->create(
            $approverId,
            'info',
            'Timesheet Submitted',
            "{$name} submitted a timesheet for week starting {$period['week_start']}",
            ['period_id' => $period['id'], 'user_id' => $submitterId],
            NotificationPreferenceService::EVENT_TIMESHEET_SUBMITTED
        );

        if ($this->preferenceService->shouldNotify($approverId, NotificationPreferenceService::EVENT_TIMESHEET_SUBMITTED, 'email')) {
            $approver = $this->db->table('users')->where('id', $approverId)->get()->getRowArray();
            if (!empty($approver['email'])) {
                $this->emailService->sendSimpleEmail(
                    $approver['email'],
                    'Timesheet pending approval',
                    "<p>{$name} submitted a timesheet for week starting {$period['week_start']}.</p>"
                );
            }
        }

        return $notification;
    }

    public function notifyTimesheetApproved(int $userId, array $period, bool $rejected = false): ?array
    {
        if ($rejected) {
            $title = 'Timesheet Rejected';
            $message = 'Your timesheet for week starting ' . $period['week_start'] . ' was rejected';
            if (!empty($period['rejection_reason'])) {
                $message .= ': ' . $period['rejection_reason'];
            }
        } else {
            $title = 'Timesheet Approved';
            $message = 'Your timesheet for week starting ' . $period['week_start'] . ' was approved';
        }

        $notification = $this->create(
            $userId,
            $rejected ? 'warning' : 'success',
            $title,
            $message,
            ['period_id' => $period['id'], 'status' => $period['status']],
            NotificationPreferenceService::EVENT_TIMESHEET_APPROVED
        );

        if ($this->preferenceService->shouldNotify($userId, NotificationPreferenceService::EVENT_TIMESHEET_APPROVED, 'email')) {
            $user = $this->db->table('users')->where('id', $userId)->get()->getRowArray();
            if (!empty($user['email'])) {
                $this->emailService->sendSimpleEmail($user['email'], $title, "<p>{$message}</p>");
            }
        }

        return $notification;
    }

    public function notifyPayrollFinalized(int $userId, array $run): ?array
    {
        return $this->create(
            $userId,
            'success',
            'Payroll Finalized',
            'Payroll run "' . ($run['title'] ?? 'Payroll') . '" has been finalized',
            ['payroll_run_id' => $run['id']],
            NotificationPreferenceService::EVENT_PAYROLL_FINALIZED
        );
    }

    public function notifyInvoiceCreated(int $userId, array $invoice): ?array
    {
        return $this->create(
            $userId,
            'success',
            'Invoice Created',
            'Invoice #' . $invoice['invoice_number'] . ' has been created',
            ['invoice_id' => $invoice['id']],
            NotificationPreferenceService::EVENT_INVOICE_CREATED
        );
    }

    public function notifyInvoiceSent(int $userId, array $invoice): ?array
    {
        return $this->create(
            $userId,
            'success',
            'Invoice Sent',
            'Invoice #' . $invoice['invoice_number'] . ' was sent to the client',
            ['invoice_id' => $invoice['id']],
            NotificationPreferenceService::EVENT_INVOICE_SENT
        );
    }

    public function notifyInvoiceClientApproved(int $userId, array $invoice): ?array
    {
        return $this->create(
            $userId,
            'info',
            'Invoice Approved by Client',
            'Invoice #' . $invoice['invoice_number'] . ' was approved via client portal',
            ['invoice_id' => $invoice['id']]
        );
    }

    public function notifyInvoicePaymentReceived(int $userId, array $invoice, float $amount): ?array
    {
        return $this->create(
            $userId,
            'success',
            'Payment Received',
            'Payment of ' . number_format($amount, 2) . ' recorded for invoice #' . $invoice['invoice_number'],
            ['invoice_id' => $invoice['id'], 'amount' => $amount]
        );
    }

    public function notifyWeeklySummary(int $userId, string $orgName, array $summary): ?array
    {
        $hours = $summary['total_hours'] ?? 0;
        return $this->create(
            $userId,
            'info',
            'Weekly Productivity Digest',
            "Team logged {$hours}h this week in {$orgName}",
            ['type' => 'weekly_summary', 'summary' => $summary]
        );
    }

    public function notifyDeliveryRisk(int $userId, array $risk): ?array
    {
        return $this->create(
            $userId,
            'warning',
            'Delivery Risk Alert',
            ($risk['project_name'] ?? 'Project') . ': ' . ($risk['reason'] ?? 'Risk detected'),
            ['type' => 'delivery_risk', 'risk' => $risk]
        );
    }

    public function notifyMemberAdded(int $userId, string $organizationName): array
    {
        $result = $this->create(
            $userId,
            'info',
            'Added to Organization',
            'You have been added to ' . $organizationName,
            ['organization_name' => $organizationName]
        );

        return $result ?? [];
    }

    public function notifyAdvancedMonitoringEnabled(int $userId, ?string $reason, string $startedByName): ?array
    {
        $message = $startedByName . ' enabled advanced monitoring on your account due to suspicious or low activity concerns.';
        if ($reason) {
            $message .= ' Reason: ' . $reason;
        }

        return $this->create(
            $userId,
            'warning',
            'Advanced Monitoring Enabled',
            $message,
            ['type' => 'advanced_monitoring_enabled'],
            NotificationPreferenceService::EVENT_ADVANCED_MONITORING_ENABLED
        );
    }

    public function notifyAdvancedMonitoringResult(int $userId, string $summary): ?array
    {
        return $this->create(
            $userId,
            'info',
            'Advanced Monitoring Review Complete',
            $summary,
            ['type' => 'advanced_monitoring_result'],
            NotificationPreferenceService::EVENT_ADVANCED_MONITORING_RESULT
        );
    }
}
