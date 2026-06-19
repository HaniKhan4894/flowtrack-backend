<?php

namespace App\Services;

use App\Models\TimesheetPeriodModel;
use App\Models\TimesheetEntryModel;
use App\Models\TimeEntryModel;
use DateTime;
use DateTimeZone;

class TimesheetService
{
    protected TimesheetPeriodModel $periodModel;
    protected TimesheetEntryModel $entryModel;
    protected TimeEntryModel $timeEntryModel;
    protected TimezoneService $timezoneService;
    protected NotificationService $notificationService;
    protected PermissionService $permissionService;
    protected OrganizationSettingsService $settingsService;
    protected $db;

    public function __construct()
    {
        $this->periodModel = new TimesheetPeriodModel();
        $this->entryModel = new TimesheetEntryModel();
        $this->timeEntryModel = new TimeEntryModel();
        $this->timezoneService = new TimezoneService();
        $this->notificationService = new NotificationService();
        $this->permissionService = new PermissionService();
        $this->settingsService = new OrganizationSettingsService();
        $this->db = \Config\Database::connect();
    }

    public function getPayPeriod(int $organizationId): string
    {
        $settings = $this->settingsService->getTimesheetSettings($organizationId);

        return $settings['pay_period'] ?? 'weekly';
    }

    public function requiresApproval(int $organizationId): bool
    {
        $settings = $this->settingsService->getTimesheetSettings($organizationId);

        return !empty($settings['require_approval']);
    }

    public function getPeriodStart(string $date, string $phpTz, ?string $payPeriod = null): string
    {
        $payPeriod = $payPeriod ?? 'weekly';
        $dt = new DateTime($date, new DateTimeZone($phpTz));

        if ($payPeriod === 'monthly') {
            $dt->modify('first day of this month');

            return $dt->format('Y-m-d');
        }

        $dayOfWeek = (int) $dt->format('N');
        if ($dayOfWeek > 1) {
            $dt->modify('-' . ($dayOfWeek - 1) . ' days');
        }

        if ($payPeriod === 'biweekly') {
            $weekNumber = (int) $dt->format('W');
            if ($weekNumber % 2 === 0) {
                $dt->modify('-7 days');
            }
        }

        return $dt->format('Y-m-d');
    }

    public function getPeriodEnd(string $periodStart, string $phpTz, ?string $payPeriod = null): string
    {
        $payPeriod = $payPeriod ?? 'weekly';
        $dt = new DateTime($periodStart, new DateTimeZone($phpTz));

        if ($payPeriod === 'monthly') {
            $dt->modify('last day of this month');

            return $dt->format('Y-m-d');
        }

        $days = $payPeriod === 'biweekly' ? 13 : 6;
        $dt->modify('+' . $days . ' days');

        return $dt->format('Y-m-d');
    }

    public function getPeriodDayCount(?string $payPeriod = null): int
    {
        return match ($payPeriod ?? 'weekly') {
            'monthly' => 31,
            'biweekly' => 14,
            default => 7,
        };
    }

    public function getWeekStart(string $date, string $phpTz): string
    {
        $dt = new DateTime($date, new DateTimeZone($phpTz));
        $dayOfWeek = (int) $dt->format('N');
        if ($dayOfWeek > 1) {
            $dt->modify('-' . ($dayOfWeek - 1) . ' days');
        }

        return $dt->format('Y-m-d');
    }

    public function getWeekEnd(string $weekStart, string $phpTz): string
    {
        $dt = new DateTime($weekStart, new DateTimeZone($phpTz));
        $dt->modify('+6 days');

        return $dt->format('Y-m-d');
    }

    public function getOrCreatePeriod(int $organizationId, int $userId, string $weekStart): array
    {
        $period = $this->periodModel
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->where('week_start', $weekStart)
            ->first();

        if ($period) {
            return $period;
        }

        $periodId = $this->periodModel->insert([
            'organization_id' => $organizationId,
            'user_id' => $userId,
            'week_start' => $weekStart,
            'status' => 'draft',
        ]);

        return $this->periodModel->find($periodId);
    }

    public function getPeriods(int $organizationId, array $filters): array
    {
        $builder = $this->db->table('timesheet_periods tp')
            ->select('tp.*, users.first_name, users.last_name, users.email')
            ->join('users', 'users.id = tp.user_id')
            ->where('tp.organization_id', $organizationId);

        if (isset($filters['user_id'])) {
            $builder->where('tp.user_id', $filters['user_id']);
        }

        if (isset($filters['status'])) {
            $builder->where('tp.status', $filters['status']);
        }

        if (isset($filters['week_start'])) {
            $builder->where('tp.week_start', $filters['week_start']);
        }

        $page = (int) ($filters['page'] ?? 1);
        $perPage = (int) ($filters['per_page'] ?? 20);
        $offset = ($page - 1) * $perPage;

        $total = $builder->countAllResults(false);
        $rows = $builder->orderBy('tp.week_start', 'DESC')->limit($perPage, $offset)->get()->getResultArray();

        return [
            'data' => $rows,
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / max($perPage, 1)),
            ],
        ];
    }

    public function getPeriodById(int $periodId, int $organizationId): ?array
    {
        $period = $this->periodModel->find($periodId);
        if (!$period || (int) $period['organization_id'] !== $organizationId) {
            return null;
        }

        return $period;
    }

    public function getCurrentWeekGrid(int $userId, int $organizationId, ?string $weekStart = null): array
    {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        $payPeriod = $this->getPayPeriod($organizationId);
        $localToday = $this->timezoneService->toOrgLocal(gmdate('Y-m-d H:i:s'), $phpTz);
        $localDate = $localToday ? substr($localToday, 0, 10) : date('Y-m-d');
        $weekStart = $weekStart ?? $this->getPeriodStart($localDate, $phpTz, $payPeriod);
        $weekEnd = $this->getPeriodEnd($weekStart, $phpTz, $payPeriod);

        $period = $this->getOrCreatePeriod($organizationId, $userId, $weekStart);
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($weekStart, $weekEnd, $phpTz);

        $entries = $this->db->table('time_entries te')
            ->select('te.*, projects.name as project_name')
            ->join('projects', 'projects.id = te.project_id', 'left')
            ->where('te.organization_id', $organizationId)
            ->where('te.user_id', $userId)
            ->where('te.started_at >=', $startUtc)
            ->where('te.started_at <=', $endUtc)
            ->where('te.ended_at IS NOT NULL')
            ->orderBy('te.started_at', 'ASC')
            ->get()
            ->getResultArray();

        $entries = array_map(function ($entry) use ($phpTz) {
            return $this->timezoneService->applyToRecord($entry, $phpTz, ['started_at', 'ended_at']);
        }, $entries);

        $days = [];
        $dt = new DateTime($weekStart, new DateTimeZone($phpTz));
        $periodDays = min(
            (int) ((strtotime($weekEnd) - strtotime($weekStart)) / 86400) + 1,
            $this->getPeriodDayCount($payPeriod)
        );
        for ($i = 0; $i < $periodDays; $i++) {
            $dayDate = $dt->format('Y-m-d');
            $dayEntries = array_values(array_filter($entries, function ($e) use ($dayDate, $phpTz) {
                $started = $e['started_at'] ?? '';
                if (!$started) {
                    return false;
                }
                $local = $this->timezoneService->toOrgLocal($started, $phpTz) ?? $started;

                return substr($local, 0, 10) === $dayDate;
            }));

            $totalSeconds = array_sum(array_map(fn ($e) => (int) ($e['duration_seconds'] ?? 0), $dayEntries));

            $days[] = [
                'date' => $dayDate,
                'day_of_week' => (int) $dt->format('N'),
                'total_seconds' => $totalSeconds,
                'total_hours' => round($totalSeconds / 3600, 2),
                'entries' => $dayEntries,
            ];

            $dt->modify('+1 day');
        }

        $totalSeconds = array_sum(array_column($days, 'total_seconds'));

        return [
            'period' => $period,
            'week_start' => $weekStart,
            'week_end' => $weekEnd,
            'pay_period' => $payPeriod,
            'total_seconds' => $totalSeconds,
            'total_hours' => round($totalSeconds / 3600, 2),
            'days' => $days,
        ];
    }

    public function submitPeriod(int $periodId, int $userId, int $organizationId): array
    {
        $period = $this->getPeriodById($periodId, $organizationId);
        if (!$period) {
            throw new \Exception('Timesheet period not found');
        }

        if ((int) $period['user_id'] !== $userId) {
            throw new \Exception('Unauthorized');
        }

        if (!in_array($period['status'], ['draft', 'rejected'], true)) {
            throw new \Exception('Timesheet cannot be submitted in its current status');
        }

        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        $payPeriod = $this->getPayPeriod($organizationId);
        $weekEnd = $this->getPeriodEnd($period['week_start'], $phpTz, $payPeriod);
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($period['week_start'], $weekEnd, $phpTz);

        $timeEntries = $this->timeEntryModel
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->where('started_at >=', $startUtc)
            ->where('started_at <=', $endUtc)
            ->where('ended_at IS NOT NULL')
            ->findAll();

        $this->db->transStart();

        try {
            $this->entryModel->where('period_id', $periodId)->delete();

            foreach ($timeEntries as $entry) {
                $this->entryModel->insert([
                    'period_id' => $periodId,
                    'time_entry_id' => $entry['id'],
                    'status' => 'included',
                    'created_at' => date('Y-m-d H:i:s'),
                ]);
            }

            $requiresApproval = $this->requiresApproval($organizationId);
            $this->periodModel->update($periodId, [
                'status' => $requiresApproval ? 'submitted' : 'approved',
                'submitted_at' => date('Y-m-d H:i:s'),
                'approved_by' => $requiresApproval ? null : $userId,
                'approved_at' => $requiresApproval ? null : date('Y-m-d H:i:s'),
                'rejection_reason' => null,
            ]);

            $this->db->transComplete();

            $updated = $this->periodModel->find($periodId);
            if ($requiresApproval) {
                $this->notifyApprovers($organizationId, $updated, $userId);
            }

            return $updated;
        } catch (\Exception $e) {
            $this->db->transRollback();
            throw $e;
        }
    }

    public function approvePeriod(int $periodId, int $approverId, int $organizationId): array
    {
        $period = $this->getPeriodById($periodId, $organizationId);
        if (!$period) {
            throw new \Exception('Timesheet period not found');
        }

        if ($period['status'] !== 'submitted') {
            throw new \Exception('Only submitted timesheets can be approved');
        }

        $this->periodModel->update($periodId, [
            'status' => 'approved',
            'approved_by' => $approverId,
            'approved_at' => date('Y-m-d H:i:s'),
            'rejection_reason' => null,
        ]);

        $updated = $this->periodModel->find($periodId);
        $this->notificationService->notifyTimesheetApproved((int) $period['user_id'], $updated);

        return $updated;
    }

    public function rejectPeriod(int $periodId, int $approverId, int $organizationId, string $reason): array
    {
        $period = $this->getPeriodById($periodId, $organizationId);
        if (!$period) {
            throw new \Exception('Timesheet period not found');
        }

        if ($period['status'] !== 'submitted') {
            throw new \Exception('Only submitted timesheets can be rejected');
        }

        $this->periodModel->update($periodId, [
            'status' => 'rejected',
            'approved_by' => $approverId,
            'approved_at' => date('Y-m-d H:i:s'),
            'rejection_reason' => $reason,
        ]);

        $updated = $this->periodModel->find($periodId);
        $this->notificationService->notifyTimesheetApproved((int) $period['user_id'], $updated, true);

        return $updated;
    }

    private function notifyApprovers(int $organizationId, array $period, int $submitterId): void
    {
        $members = $this->db->table('organization_members')
            ->select('user_id')
            ->where('organization_id', $organizationId)
            ->get()
            ->getResultArray();

        foreach ($members as $member) {
            $memberId = (int) $member['user_id'];
            if ($memberId === $submitterId) {
                continue;
            }
            if ($this->permissionService->userHasPermission($memberId, $organizationId, 'timesheet.approve')) {
                $this->notificationService->notifyTimesheetSubmitted($memberId, $period, $submitterId);
            }
        }
    }
}
