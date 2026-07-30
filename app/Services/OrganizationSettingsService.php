<?php

namespace App\Services;

use App\Models\OrganizationModel;
use App\Models\PlanModel;
use App\Models\SubscriptionModel;

class OrganizationSettingsService
{
    public const DEFAULT_TRACKING = [
        'screenshot_enabled' => true,
        'screenshot_only_while_timer' => true,
        'screenshot_frequency_minutes' => 5,
        'screenshot_quality' => 'normal',
        'screenshot_retention_days' => 90,
        'screenshot_hide_from_users' => false,
        'screenshot_disallow_deleting' => false,
        'screenshot_suppress_notifications' => false,
        'activity_tracking_enabled' => true,
        'url_tracking_enabled' => true,
        'idle_timeout_minutes' => 5,
        'keep_idle_time' => 'prompt',
        /** Safety net for timers left running (sleeping laptop, crashed client). 0 disables it. */
        'max_session_hours' => 12,
        'timer_tolerance_minutes' => 2,
        'timer_reminder_enabled' => true,
        'automated_tracking' => true,
    ];

    public const DEFAULT_TIMESHEET = [
        'require_approval' => true,
        'pay_period' => 'weekly',
        'allow_modify_time' => true,
        'require_reason_on_edit' => false,
    ];

    public const DEFAULT_OFFICE = [
        'auto_detect_enabled' => false,
    ];

    protected OrganizationModel $organizationModel;
    protected PlanModel $planModel;
    protected SubscriptionModel $subscriptionModel;

    public function __construct()
    {
        $this->organizationModel = new OrganizationModel();
        $this->planModel = new PlanModel();
        $this->subscriptionModel = new SubscriptionModel();
    }

    public function getDefaults(): array
    {
        return [
            'default_daily_hours' => 8,
            'tracking' => self::DEFAULT_TRACKING,
            'timesheet' => self::DEFAULT_TIMESHEET,
            'office' => self::DEFAULT_OFFICE,
        ];
    }

    public function decodeSettings(?string $json): array
    {
        $defaults = $this->getDefaults();
        if (empty($json)) {
            return $defaults;
        }

        $decoded = is_string($json) ? json_decode($json, true) : $json;
        if (!is_array($decoded)) {
            return $defaults;
        }

        return $this->mergeSettings($defaults, $decoded);
    }

    public function mergeSettings(array $base, array $incoming): array
    {
        $merged = $base;

        if (array_key_exists('default_daily_hours', $incoming)) {
            $merged['default_daily_hours'] = round((float) $incoming['default_daily_hours'], 2);
        }

        foreach (['tracking', 'timesheet', 'office'] as $section) {
            if (!isset($incoming[$section]) || !is_array($incoming[$section])) {
                continue;
            }
            $merged[$section] = array_merge(
                $merged[$section] ?? [],
                $this->sanitizeSection($section, $incoming[$section])
            );
        }

        return $merged;
    }

    public function mergeSettingsPatch(array $current, array $patch): array
    {
        return $this->mergeSettings($current, $patch);
    }

    public function getOrganizationSettings(int $organizationId): array
    {
        $org = $this->organizationModel->find($organizationId);
        if (!$org) {
            return $this->getDefaults();
        }

        $raw = $org['settings'] ?? null;
        if (is_array($raw)) {
            return $this->mergeSettings($this->getDefaults(), $raw);
        }

        return $this->decodeSettings(is_string($raw) ? $raw : null);
    }

    public function getTimesheetSettings(int $organizationId): array
    {
        $settings = $this->getOrganizationSettings($organizationId);

        return $settings['timesheet'] ?? self::DEFAULT_TIMESHEET;
    }

    public function getOfficeSettings(int $organizationId): array
    {
        $settings = $this->getOrganizationSettings($organizationId);

        return $settings['office'] ?? self::DEFAULT_OFFICE;
    }

    public function getEffectiveTrackingConfig(int $organizationId): array
    {
        $settings = $this->getOrganizationSettings($organizationId);
        $tracking = $settings['tracking'] ?? self::DEFAULT_TRACKING;
        $effective = $tracking;

        $subscription = $this->subscriptionModel->getActiveSubscription($organizationId);
        $planId = $subscription ? (int) ($subscription['plan_id'] ?? 0) : 0;

        $screenshotsAllowed = true;
        $planInterval = 0;
        $planRetention = null;

        if ($planId > 0) {
            $screenshotsAllowed = $this->planModel->getFeatureValue($planId, 'screenshots') !== 'false';
            $intervalRaw = $this->planModel->getFeatureValue($planId, 'screenshot_interval');
            $planInterval = (int) ($intervalRaw ?? 0);
            $planRetention = $this->planModel->getFeatureValue($planId, 'data_retention');
            $activityAllowed = $this->planModel->getFeatureValue($planId, 'activity_tracking') !== 'false';
            $orgActivityOn = filter_var($tracking['activity_tracking_enabled'] ?? true, FILTER_VALIDATE_BOOLEAN);
            $effective['activity_tracking_enabled'] = $activityAllowed && $orgActivityOn;
        } else {
            $effective['activity_tracking_enabled'] = filter_var($tracking['activity_tracking_enabled'] ?? true, FILTER_VALIDATE_BOOLEAN);
        }

        if (!$screenshotsAllowed) {
            $effective['screenshot_enabled'] = false;
        } elseif (!empty($tracking['screenshot_enabled']) === false) {
            $effective['screenshot_enabled'] = false;
        } else {
            $effective['screenshot_enabled'] = true;
        }

        if (!$effective['screenshot_enabled']) {
            $effective['screenshot_frequency_minutes'] = 0;
        }

        $orgFreq = max(1, (int) ($tracking['screenshot_frequency_minutes'] ?? 5));
        if ($planInterval > 0) {
            $effective['screenshot_frequency_minutes'] = max($orgFreq, $planInterval);
        } else {
            $effective['screenshot_frequency_minutes'] = $orgFreq;
        }

        $orgRetention = max(7, (int) ($tracking['screenshot_retention_days'] ?? 90));
        if ($planRetention && $planRetention !== 'unlimited') {
            $effective['screenshot_retention_days'] = min($orgRetention, (int) $planRetention);
        } else {
            $effective['screenshot_retention_days'] = $orgRetention;
        }

        $effective['idle_timeout_minutes'] = max(1, min(60, (int) ($tracking['idle_timeout_minutes'] ?? 5)));
        $effective['timer_tolerance_minutes'] = max(1, min(30, (int) ($tracking['timer_tolerance_minutes'] ?? 2)));
        $effective['max_session_hours'] = max(0, min(24, (int) ($tracking['max_session_hours'] ?? 12)));

        $keepIdle = (string) ($tracking['keep_idle_time'] ?? 'prompt');
        $effective['keep_idle_time'] = in_array($keepIdle, ['prompt', 'always', 'never'], true) ? $keepIdle : 'prompt';

        $quality = (string) ($tracking['screenshot_quality'] ?? 'normal');
        $effective['screenshot_quality'] = in_array($quality, ['normal', 'high', 'very_high'], true) ? $quality : 'normal';

        return $effective;
    }

    public function getEffectiveTrackingConfigForMember(int $organizationId, int $userId): array
    {
        $effective = $this->getEffectiveTrackingConfig($organizationId);
        $session = (new AdvancedMonitoringService())->getActiveSession($organizationId, $userId);

        if (!$session) {
            return $effective;
        }

        $caps = $this->getPlanCaps($organizationId);
        $planMin = max(1, (int) ($caps['screenshot_interval_min'] ?? 1));
        $overrideFreq = max($planMin, min(60, (int) ($session['screenshot_frequency_minutes'] ?? 1)));

        $effective['screenshot_enabled'] = true;
        $effective['activity_tracking_enabled'] = true;
        $effective['url_tracking_enabled'] = true;
        $effective['screenshot_frequency_minutes'] = $overrideFreq;
        $effective['advanced_monitoring'] = true;
        $effective['advanced_monitoring_session_id'] = (int) $session['id'];

        return $effective;
    }

    /**
     * When enabled, regular members cannot view their own screenshots.
     * Users with screenshots.view_team (managers/admins) remain exempt.
     */
    public function areScreenshotsHiddenFromUser(int $organizationId, int $userId): bool
    {
        $config = $this->getEffectiveTrackingConfig($organizationId);
        if (empty($config['screenshot_hide_from_users'])) {
            return false;
        }

        $permissionService = new PermissionService();

        return !$permissionService->userHasPermission($userId, $organizationId, 'screenshots.view_team');
    }

    public function getPlanCaps(int $organizationId): array
    {
        $subscription = $this->subscriptionModel->getActiveSubscription($organizationId);
        if (!$subscription) {
            return [
                'screenshots' => false,
                'screenshot_interval_min' => 0,
                'data_retention_days' => null,
                'activity_tracking' => false,
            ];
        }

        $planId = (int) $subscription['plan_id'];
        $retention = $this->planModel->getFeatureValue($planId, 'data_retention');

        return [
            'screenshots' => $this->planModel->getFeatureValue($planId, 'screenshots') !== 'false',
            'screenshot_interval_min' => (int) ($this->planModel->getFeatureValue($planId, 'screenshot_interval') ?? 0),
            'data_retention_days' => ($retention && $retention !== 'unlimited') ? (int) $retention : null,
            'activity_tracking' => $this->planModel->getFeatureValue($planId, 'activity_tracking') !== 'false',
        ];
    }

    protected function sanitizeSection(string $section, array $data): array
    {
        return match ($section) {
            'tracking' => $this->sanitizeTracking($data),
            'timesheet' => $this->sanitizeTimesheet($data),
            'office' => $this->sanitizeOffice($data),
            default => [],
        };
    }

    protected function sanitizeTracking(array $data): array
    {
        $out = [];
        $bools = [
            'screenshot_enabled', 'screenshot_only_while_timer', 'screenshot_hide_from_users',
            'screenshot_disallow_deleting', 'screenshot_suppress_notifications',
            'activity_tracking_enabled', 'url_tracking_enabled', 'timer_reminder_enabled', 'automated_tracking',
        ];
        foreach ($bools as $key) {
            if (array_key_exists($key, $data)) {
                $out[$key] = filter_var($data[$key], FILTER_VALIDATE_BOOLEAN);
            }
        }

        if (array_key_exists('screenshot_frequency_minutes', $data)) {
            $out['screenshot_frequency_minutes'] = max(1, min(60, (int) $data['screenshot_frequency_minutes']));
        }
        if (array_key_exists('screenshot_retention_days', $data)) {
            $out['screenshot_retention_days'] = max(7, min(365, (int) $data['screenshot_retention_days']));
        }
        if (array_key_exists('idle_timeout_minutes', $data)) {
            $out['idle_timeout_minutes'] = max(1, min(60, (int) $data['idle_timeout_minutes']));
        }
        if (array_key_exists('timer_tolerance_minutes', $data)) {
            $out['timer_tolerance_minutes'] = max(1, min(30, (int) $data['timer_tolerance_minutes']));
        }
        if (array_key_exists('max_session_hours', $data)) {
            $out['max_session_hours'] = max(0, min(24, (int) $data['max_session_hours']));
        }
        if (array_key_exists('keep_idle_time', $data)) {
            $val = (string) $data['keep_idle_time'];
            if (in_array($val, ['prompt', 'always', 'never'], true)) {
                $out['keep_idle_time'] = $val;
            }
        }
        if (array_key_exists('screenshot_quality', $data)) {
            $val = (string) $data['screenshot_quality'];
            if (in_array($val, ['normal', 'high', 'very_high'], true)) {
                $out['screenshot_quality'] = $val;
            }
        }

        return $out;
    }

    protected function sanitizeTimesheet(array $data): array
    {
        $out = [];
        if (array_key_exists('require_approval', $data)) {
            $out['require_approval'] = filter_var($data['require_approval'], FILTER_VALIDATE_BOOLEAN);
        }
        if (array_key_exists('allow_modify_time', $data)) {
            $out['allow_modify_time'] = filter_var($data['allow_modify_time'], FILTER_VALIDATE_BOOLEAN);
        }
        if (array_key_exists('require_reason_on_edit', $data)) {
            $out['require_reason_on_edit'] = filter_var($data['require_reason_on_edit'], FILTER_VALIDATE_BOOLEAN);
        }
        if (array_key_exists('pay_period', $data)) {
            $val = (string) $data['pay_period'];
            if (in_array($val, ['weekly', 'biweekly', 'monthly'], true)) {
                $out['pay_period'] = $val;
            }
        }

        return $out;
    }

    protected function sanitizeOffice(array $data): array
    {
        $out = [];
        if (array_key_exists('auto_detect_enabled', $data)) {
            $out['auto_detect_enabled'] = filter_var($data['auto_detect_enabled'], FILTER_VALIDATE_BOOLEAN);
        }

        return $out;
    }
}
