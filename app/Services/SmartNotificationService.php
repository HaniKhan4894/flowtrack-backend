<?php

namespace App\Services;

use App\Models\SmartNotificationRuleModel;

class SmartNotificationService
{
    public const RULE_TYPES = [
        'suspicious_high_activity',
        'overworking',
        'underworking',
        'social_media_time',
        'suspicious_apps',
    ];

    public const TEMPLATES = [
        [
            'name' => 'Suspiciously high activity',
            'rule_type' => 'suspicious_high_activity',
            'frequency' => 'hourly',
            'channels' => ['email', 'in_app'],
            'threshold' => 85,
        ],
        [
            'name' => 'Members overworking',
            'rule_type' => 'overworking',
            'frequency' => 'weekly',
            'channels' => ['email', 'in_app'],
            'threshold' => 50,
        ],
        [
            'name' => 'Members underworking',
            'rule_type' => 'underworking',
            'frequency' => 'weekly',
            'channels' => ['email', 'in_app'],
            'threshold' => 20,
        ],
        [
            'name' => 'Time on social media or AI sites',
            'rule_type' => 'social_media_time',
            'frequency' => 'daily',
            'channels' => ['email', 'in_app'],
            'threshold' => 60,
        ],
        [
            'name' => 'Suspicious applications',
            'rule_type' => 'suspicious_apps',
            'frequency' => 'hourly',
            'channels' => ['email', 'in_app'],
            'threshold' => 30,
        ],
    ];

    protected SmartNotificationRuleModel $model;
    protected UnusualActivityService $unusualActivityService;
    protected NotificationService $notificationService;
    protected EmailService $emailService;
    protected TimezoneService $timezoneService;
    protected $db;

    public function __construct()
    {
        $this->model = new SmartNotificationRuleModel();
        $this->unusualActivityService = new UnusualActivityService();
        $this->notificationService = new NotificationService();
        $this->emailService = new EmailService();
        $this->timezoneService = new TimezoneService();
        $this->db = \Config\Database::connect();
    }

    public function list(int $organizationId): array
    {
        return $this->model
            ->where('organization_id', $organizationId)
            ->orderBy('created_at', 'DESC')
            ->findAll();
    }

    public function getTemplates(): array
    {
        return self::TEMPLATES;
    }

    public function create(int $organizationId, int $userId, array $data): array
    {
        $ruleType = (string) ($data['rule_type'] ?? '');
        if (!in_array($ruleType, self::RULE_TYPES, true)) {
            throw new \RuntimeException('Invalid rule type');
        }

        $channels = $data['channels'] ?? ['in_app'];
        if (!is_array($channels)) {
            $channels = ['in_app'];
        }

        $row = [
            'organization_id' => $organizationId,
            'name' => trim((string) ($data['name'] ?? 'Notification rule')),
            'rule_type' => $ruleType,
            'threshold' => isset($data['threshold']) ? (float) $data['threshold'] : null,
            'target_scope' => (string) ($data['target_scope'] ?? 'all_members'),
            'frequency' => in_array($data['frequency'] ?? 'daily', ['hourly', 'daily', 'weekly'], true)
                ? $data['frequency'] : 'daily',
            'channels' => json_encode($channels),
            'config' => !empty($data['config']) ? json_encode($data['config']) : null,
            'is_active' => !empty($data['is_active']) ? 1 : 0,
            'created_by' => $userId,
        ];

        $id = $this->model->insert($row);
        return $this->formatRule($this->model->find($id));
    }

    public function update(int $id, int $organizationId, array $data): array
    {
        $existing = $this->getById($id, $organizationId);
        if (!$existing) {
            throw new \RuntimeException('Rule not found');
        }

        $update = [];
        foreach (['name', 'rule_type', 'target_scope', 'frequency'] as $field) {
            if (isset($data[$field])) {
                $update[$field] = $data[$field];
            }
        }
        if (array_key_exists('threshold', $data)) {
            $update['threshold'] = $data['threshold'] !== null ? (float) $data['threshold'] : null;
        }
        if (array_key_exists('is_active', $data)) {
            $update['is_active'] = !empty($data['is_active']) ? 1 : 0;
        }
        if (isset($data['channels']) && is_array($data['channels'])) {
            $update['channels'] = json_encode($data['channels']);
        }
        if (isset($data['config'])) {
            $update['config'] = json_encode($data['config']);
        }

        if (!empty($update)) {
            $this->model->update($id, $update);
        }

        return $this->formatRule($this->model->find($id));
    }

    public function delete(int $id, int $organizationId): void
    {
        $existing = $this->getById($id, $organizationId);
        if (!$existing) {
            throw new \RuntimeException('Rule not found');
        }
        $this->model->delete($id);
    }

    public function getById(int $id, int $organizationId): ?array
    {
        $row = $this->model->find($id);
        if (!$row || (int) $row['organization_id'] !== $organizationId) {
            return null;
        }

        return $this->formatRule($row);
    }

    public function evaluateAllOrganizations(): array
    {
        $orgs = $this->db->table('organizations')->select('id')->where('is_active', 1)->get()->getResultArray();
        $summary = ['organizations' => 0, 'alerts_sent' => 0];

        foreach ($orgs as $org) {
            $orgId = (int) $org['id'];
            $summary['organizations']++;
            $summary['alerts_sent'] += $this->evaluateOrganization($orgId);
        }

        return $summary;
    }

    public function evaluateOrganization(int $organizationId): int
    {
        $rules = $this->model
            ->where('organization_id', $organizationId)
            ->where('is_active', 1)
            ->findAll();

        if ($rules === []) {
            return 0;
        }

        $sent = 0;
        foreach ($rules as $rule) {
            if ($this->shouldEvaluateNow($rule) && $this->evaluateRule($organizationId, $rule)) {
                $sent++;
            }
        }

        return $sent;
    }

    protected function shouldEvaluateNow(array $rule): bool
    {
        $freq = $rule['frequency'] ?? 'daily';
        $hour = (int) date('G');

        return match ($freq) {
            'hourly' => true,
            'daily' => $hour === 8,
            'weekly' => $hour === 8 && (int) date('N') === 1,
            default => false,
        };
    }

    protected function evaluateRule(int $organizationId, array $rule): bool
    {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        $endLocal = (new \DateTime('now', new \DateTimeZone($phpTz)))->format('Y-m-d');
        $startLocal = match ($rule['frequency']) {
            'hourly' => $endLocal,
            'weekly' => (new \DateTime('now', new \DateTimeZone($phpTz)))->modify('-6 days')->format('Y-m-d'),
            default => (new \DateTime('now', new \DateTimeZone($phpTz)))->modify('-1 day')->format('Y-m-d'),
        };

        $members = $this->db->table('organization_members')
            ->select('user_id')
            ->where('organization_id', $organizationId)
            ->get()
            ->getResultArray();

        $triggered = [];
        foreach ($members as $member) {
            $userId = (int) $member['user_id'];
            if ($this->memberTriggersRule($organizationId, $userId, $rule, $startLocal, $endLocal)) {
                $triggered[] = $userId;
            }
        }

        if ($triggered === []) {
            return false;
        }

        $channels = json_decode($rule['channels'] ?? '[]', true) ?: ['in_app'];
        $managers = $this->getManagerUserIds($organizationId);
        $message = sprintf(
            'Smart alert "%s" triggered for %d member(s).',
            $rule['name'],
            count($triggered)
        );

        foreach ($managers as $managerId) {
            if (in_array('in_app', $channels, true)) {
                $this->notificationService->create(
                    $managerId,
                    'smart_alert',
                    $rule['name'],
                    $message,
                    ['rule_id' => $rule['id'], 'triggered_users' => $triggered]
                );
            }
        }

        return true;
    }

    protected function memberTriggersRule(int $organizationId, int $userId, array $rule, string $start, string $end): bool
    {
        $threshold = (float) ($rule['threshold'] ?? 0);

        return match ($rule['rule_type']) {
            'suspicious_high_activity' => $this->hasUnusualHighActivity($organizationId, $userId, $start, $end),
            'overworking' => $this->getHoursWorked($organizationId, $userId, $start, $end) >= $threshold,
            'underworking' => $this->getHoursWorked($organizationId, $userId, $start, $end) <= $threshold,
            'social_media_time' => $this->getCategoryPercent($organizationId, $userId, $start, $end, 'unproductive') >= $threshold,
            'suspicious_apps' => $this->getSuspiciousAppMinutes($organizationId, $userId, $start, $end) >= $threshold,
            default => false,
        };
    }

    protected function hasUnusualHighActivity(int $organizationId, int $userId, string $start, string $end): bool
    {
        $data = $this->unusualActivityService->getUnusualActivity(
            $organizationId,
            $userId,
            $start,
            $end,
            ['highly_unusual', 'unusual']
        );

        $summary = $data['summary'] ?? [];

        return ((int) ($summary['highly_unusual_count'] ?? 0)) > 0
            || ((int) ($summary['unusual_count'] ?? 0)) > 0;
    }

    protected function getHoursWorked(int $organizationId, int $userId, string $start, string $end): float
    {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($start, $end, $phpTz);

        $seconds = (int) $this->db->table('time_entries')
            ->select('COALESCE(SUM(duration_seconds),0) as total', false)
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->where('started_at >=', $startUtc)
            ->where('started_at <=', $endUtc)
            ->get()
            ->getRowArray()['total'];

        return round($seconds / 3600, 2);
    }

    protected function getCategoryPercent(int $organizationId, int $userId, string $start, string $end, string $category): float
    {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($start, $end, $phpTz);

        $rows = $this->db->table('activity_logs al')
            ->select('al.category, COALESCE(SUM(al.duration_seconds),0) as total', false)
            ->join('time_entries te', 'te.id = al.time_entry_id')
            ->where('te.organization_id', $organizationId)
            ->where('al.user_id', $userId)
            ->where('al.logged_at >=', $startUtc)
            ->where('al.logged_at <=', $endUtc)
            ->groupBy('al.category')
            ->get()
            ->getResultArray();

        $total = array_sum(array_map(fn ($r) => (int) $r['total'], $rows));
        if ($total <= 0) {
            return 0;
        }

        foreach ($rows as $row) {
            if ($row['category'] === $category) {
                return round(((int) $row['total'] / $total) * 100, 1);
            }
        }

        return 0;
    }

    protected function getSuspiciousAppMinutes(int $organizationId, int $userId, string $start, string $end): float
    {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($start, $end, $phpTz);

        $patterns = ['tiktok', 'instagram', 'facebook', 'netflix', 'discord', 'telegram'];
        $builder = $this->db->table('activity_logs al')
            ->select('COALESCE(SUM(al.duration_seconds),0) as total', false)
            ->join('time_entries te', 'te.id = al.time_entry_id')
            ->where('te.organization_id', $organizationId)
            ->where('al.user_id', $userId)
            ->where('al.logged_at >=', $startUtc)
            ->where('al.logged_at <=', $endUtc);

        $builder->groupStart();
        foreach ($patterns as $i => $pattern) {
            if ($i === 0) {
                $builder->like('al.app_name', $pattern);
            } else {
                $builder->orLike('al.app_name', $pattern);
            }
        }
        $builder->groupEnd();

        $seconds = (int) $builder->get()->getRowArray()['total'];

        return round($seconds / 60, 1);
    }

    protected function getManagerUserIds(int $organizationId): array
    {
        $rows = $this->db->table('organization_members om')
            ->select('om.user_id')
            ->join('roles r', 'r.id = om.role_id')
            ->where('om.organization_id', $organizationId)
            ->whereIn('r.slug', ['owner', 'admin', 'manager', 'team_lead'])
            ->get()
            ->getResultArray();

        return array_map(fn ($r) => (int) $r['user_id'], $rows);
    }

    protected function formatRule(?array $row): ?array
    {
        if (!$row) {
            return null;
        }

        $row['channels'] = json_decode($row['channels'] ?? '[]', true) ?: [];
        $row['config'] = json_decode($row['config'] ?? 'null', true);
        $row['is_active'] = (bool) $row['is_active'];

        return $row;
    }
}
