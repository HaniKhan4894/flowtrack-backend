<?php

namespace App\Services;

use App\Models\NotificationPreferenceModel;

class NotificationPreferenceService
{
    public const EVENT_TIMESHEET_SUBMITTED = 'timesheet_submitted';
    public const EVENT_TIMESHEET_APPROVED = 'timesheet_approved';
    public const EVENT_PAYROLL_FINALIZED = 'payroll_finalized';
    public const EVENT_TIME_ENTRY_STOPPED = 'time_entry_stopped';
    public const EVENT_TIME_ENTRY_STARTED = 'time_entry_started';
    public const EVENT_INVOICE_CREATED = 'invoice_created';
    public const EVENT_INVOICE_SENT = 'invoice_sent';
    public const EVENT_ADVANCED_MONITORING_ENABLED = 'advanced_monitoring_enabled';
    public const EVENT_ADVANCED_MONITORING_RESULT = 'advanced_monitoring_result';

    protected NotificationPreferenceModel $preferenceModel;

    public function __construct()
    {
        $this->preferenceModel = new NotificationPreferenceModel();
    }

    public function getAvailableEvents(): array
    {
        return [
            ['key' => self::EVENT_TIME_ENTRY_STARTED, 'label' => 'Timer started'],
            ['key' => self::EVENT_TIME_ENTRY_STOPPED, 'label' => 'Timer stopped'],
            ['key' => self::EVENT_TIMESHEET_SUBMITTED, 'label' => 'Timesheet submitted (approvers)'],
            ['key' => self::EVENT_TIMESHEET_APPROVED, 'label' => 'Timesheet approved or rejected'],
            ['key' => self::EVENT_INVOICE_CREATED, 'label' => 'Invoice created'],
            ['key' => self::EVENT_INVOICE_SENT, 'label' => 'Invoice sent'],
            ['key' => self::EVENT_PAYROLL_FINALIZED, 'label' => 'Payroll finalized'],
            ['key' => self::EVENT_ADVANCED_MONITORING_ENABLED, 'label' => 'Advanced monitoring enabled on you'],
            ['key' => self::EVENT_ADVANCED_MONITORING_RESULT, 'label' => 'Advanced monitoring review result'],
        ];
    }

    public function getUserPreferences(int $userId): array
    {
        $saved = $this->preferenceModel->where('user_id', $userId)->findAll();
        $byKey = [];
        foreach ($saved as $row) {
            $byKey[$row['event_key']] = $row;
        }

        $preferences = [];
        foreach ($this->getAvailableEvents() as $event) {
            $key = $event['key'];
            $row = $byKey[$key] ?? null;
            $preferences[] = [
                'event_key' => $key,
                'label' => $event['label'],
                'email_enabled' => $row ? (bool) $row['email_enabled'] : true,
                'in_app_enabled' => $row ? (bool) $row['in_app_enabled'] : true,
            ];
        }

        return $preferences;
    }

    public function updatePreferences(int $userId, array $preferences): array
    {
        foreach ($preferences as $pref) {
            if (empty($pref['event_key'])) {
                continue;
            }

            $eventKey = $pref['event_key'];
            $existing = $this->preferenceModel
                ->where('user_id', $userId)
                ->where('event_key', $eventKey)
                ->first();

            $payload = [
                'email_enabled' => isset($pref['email_enabled']) ? (int) (bool) $pref['email_enabled'] : 1,
                'in_app_enabled' => isset($pref['in_app_enabled']) ? (int) (bool) $pref['in_app_enabled'] : 1,
            ];

            if ($existing) {
                $this->preferenceModel->update($existing['id'], $payload);
            } else {
                $this->preferenceModel->insert(array_merge([
                    'user_id' => $userId,
                    'event_key' => $eventKey,
                ], $payload));
            }
        }

        return $this->getUserPreferences($userId);
    }

    public function shouldNotify(int $userId, string $eventKey, string $channel = 'in_app'): bool
    {
        $pref = $this->preferenceModel
            ->where('user_id', $userId)
            ->where('event_key', $eventKey)
            ->first();

        if (!$pref) {
            return true;
        }

        if ($channel === 'email') {
            return (bool) $pref['email_enabled'];
        }

        return (bool) $pref['in_app_enabled'];
    }
}
