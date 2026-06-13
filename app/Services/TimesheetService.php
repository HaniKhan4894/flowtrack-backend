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
    protected $db;

    public function __construct()
    {
        $this->periodModel = new TimesheetPeriodModel();
        $this->entryModel = new TimesheetEntryModel();
        $this->timeEntryModel = new TimeEntryModel();
        $this->timezoneService = new TimezoneService();
        $this->notificationService = new NotificationService();
        $this->permissionService = new PermissionService();
        $this->db = \Config\Database::connect();
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
        $localToday = $this->timezoneService->toOrgLocal(gmdate('Y-m-d H:i:s'), $phpTz);
        $localDate = $localToday ? substr($localToday, 0, 10) : date('Y-m-d');
        $weekStart = $weekStart ?? $this->getWeekStart($localDate, $phpTz);
        $weekEnd = $this->getWeekEnd($weekStart, $phpTz);

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
        for ($i = 0; $i < 7; $i++) {
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
        $weekEnd = $this->getWeekEnd($period['week_start'], $phpTz);
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

            $this->periodModel->update($periodId, [
                'status' => 'submitted',
                'submitted_at' => date('Y-m-d H:i:s'),
                'approved_by' => null,
                'approved_at' => null,
                'rejection_reason' => null,
            ]);

            $this->db->transComplete();

            $updated = $this->periodModel->find($periodId);
            $this->notifyApprovers($organizationId, $updated, $userId);

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
