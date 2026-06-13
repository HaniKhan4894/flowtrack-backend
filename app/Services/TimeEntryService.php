<?php

namespace App\Services;

use App\Models\TimeEntryModel;
use App\Models\ProjectModel;
use App\Services\TimezoneService;

class TimeEntryService
{
    protected $timeEntryModel;
    protected $projectModel;
    protected $timezoneService;
    protected $db;

    public function __construct()
    {
        $this->timeEntryModel = new TimeEntryModel();
        $this->projectModel = new ProjectModel();
        $this->timezoneService = new TimezoneService();
        $this->db = \Config\Database::connect();
    }

    private function computeElapsedSeconds(array $entry): int
    {
        $startedAt = strtotime((string) $entry['started_at']);
        if (!$startedAt) {
            return 0;
        }

        $pausedDuration = (int) ($entry['paused_duration_seconds'] ?? 0);
        $now = !empty($entry['paused_at']) ? strtotime((string) $entry['paused_at']) : time();
        $elapsed = $now - $startedAt - $pausedDuration;

        return max(0, $elapsed);
    }

    private function formatActiveTimer(array $entry): array
    {
        $orgId = (int) ($entry['organization_id'] ?? 0);
        $phpTz = $this->timezoneService->getOrgTimezone($orgId);

        $entry['elapsed_seconds'] = $this->computeElapsedSeconds($entry);
        $entry['server_now'] = gmdate('Y-m-d\TH:i:s\Z');
        $entry = $this->timezoneService->applyToRecord($entry, $phpTz, ['started_at', 'ended_at', 'paused_at']);

        return $entry;
    }

    private function formatTimeEntry(array $entry): array
    {
        $orgId = (int) ($entry['organization_id'] ?? 0);
        $phpTz = $this->timezoneService->getOrgTimezone($orgId);

        return $this->timezoneService->applyToRecord($entry, $phpTz, ['started_at', 'ended_at', 'paused_at']);
    }

    /**
     * Start timer
     */
    public function startTimer(int $userId, int $organizationId, array $data): array
    {
        // Check if user has active timer
        $activeTimer = $this->getActiveTimer($userId);
        if ($activeTimer) {
            throw new \Exception('You already have an active timer running');
        }

        // Validate project belongs to organization
        if (isset($data['project_id'])) {
            $project = $this->projectModel->find($data['project_id']);
            if (!$project || $project['organization_id'] != $organizationId) {
                throw new \Exception('Invalid project');
            }
        }

        $this->db->transStart();

        try {
            $entryData = [
                'user_id' => $userId,
                'organization_id' => $organizationId,
                'project_id' => $data['project_id'] ?? null,
                'task_id' => $data['task_id'] ?? null,
                'description' => $data['description'] ?? null,
                'started_at' => date('Y-m-d H:i:s'),
                'is_manual' => false,
                'is_billable' => $data['is_billable'] ?? true,
                'hourly_rate' => $data['hourly_rate'] ?? null,
            ];

            $entryId = $this->timeEntryModel->insert($entryData);

            if (!$entryId) {
                throw new \Exception('Failed to start timer');
            }

            $this->db->transComplete();

            return $this->formatTimeEntry($this->timeEntryModel->find($entryId));

        } catch (\Exception $e) {
            $this->db->transRollback();
            throw $e;
        }
    }

    /**
     * Stop timer
     */
    public function stopTimer(int $userId, int $entryId): array
    {
        $entry = $this->timeEntryModel->find($entryId);

        if (!$entry) {
            throw new \Exception('Time entry not found');
        }

        if ($entry['user_id'] != $userId) {
            throw new \Exception('Unauthorized');
        }

        if ($entry['ended_at']) {
            throw new \Exception('Timer already stopped');
        }

        $endedAt = date('Y-m-d H:i:s');

        // Calculate total duration excluding the time spent paused
        $totalSeconds = strtotime($endedAt) - strtotime($entry['started_at']);

        // If it was paused when stopped, we need to handle that
        $pausedDuration = (int) ($entry['paused_duration_seconds'] ?? 0);
        if ($entry['paused_at']) {
            $pausedDuration += (strtotime($endedAt) - strtotime($entry['paused_at']));
        }

        $netDuration = $totalSeconds - $pausedDuration;

        $this->timeEntryModel->update($entryId, [
            'ended_at' => $endedAt,
            'paused_at' => null, // Clear pause state if any
            'paused_duration_seconds' => $pausedDuration,
            'duration_seconds' => $netDuration > 0 ? $netDuration : 0
        ]);

        return $this->formatTimeEntry($this->timeEntryModel->find($entryId));
    }

    /**
     * Pause timer
     */
    public function pauseTimer(int $userId, int $entryId): array
    {
        $entry = $this->timeEntryModel->find($entryId);

        if (!$entry || $entry['user_id'] != $userId || $entry['ended_at']) {
            throw new \Exception('Invalid time entry');
        }

        if ($entry['paused_at']) {
            throw new \Exception('Timer is already paused');
        }

        $this->timeEntryModel->update($entryId, [
            'paused_at' => date('Y-m-d H:i:s')
        ]);

        return $this->formatActiveTimer($this->timeEntryModel->find($entryId));
    }

    /**
     * Resume timer
     */
    public function resumeTimer(int $userId, int $entryId): array
    {
        $entry = $this->timeEntryModel->find($entryId);

        if (!$entry || $entry['user_id'] != $userId || $entry['ended_at']) {
            throw new \Exception('Invalid time entry');
        }

        if (!$entry['paused_at']) {
            throw new \Exception('Timer is not paused');
        }

        $now = date('Y-m-d H:i:s');
        $pauseDuration = strtotime($now) - strtotime($entry['paused_at']);
        $totalPaused = (int) $entry['paused_duration_seconds'] + $pauseDuration;

        $this->timeEntryModel->update($entryId, [
            'paused_at' => null,
            'paused_duration_seconds' => $totalPaused
        ]);

        return $this->formatActiveTimer($this->timeEntryModel->find($entryId));
    }

    /**
     * Get active timer for user
     */
    public function getActiveTimer(int $userId): ?array
    {
        $entry = $this->timeEntryModel
            ->where('user_id', $userId)
            ->where('ended_at', null)
            ->first();

        return $entry ? $this->formatActiveTimer($entry) : null;
    }

    /**
     * Get time entries with filters (query params)
     */
    public function getTimeEntries(array $filters): array
    {
        $builder = $this->timeEntryModel->builder();

        // Apply filters from query parameters
        if (isset($filters['user_id'])) {
            $builder->where('user_id', $filters['user_id']);
        }

        if (isset($filters['organization_id'])) {
            $builder->where('organization_id', $filters['organization_id']);
        }

        $orgId = (int) ($filters['organization_id'] ?? 0);
        $phpTz = $this->timezoneService->getOrgTimezone($orgId);

        if (isset($filters['start_date'])) {
            $startUtc = $this->timezoneService->dateRangeUtc($filters['start_date'], $filters['start_date'], $phpTz)[0];
            $builder->where('started_at >=', $startUtc);
        }

        if (isset($filters['end_date'])) {
            $endUtc = $this->timezoneService->dateRangeUtc($filters['end_date'], $filters['end_date'], $phpTz)[1];
            $builder->where('started_at <=', $endUtc);
        }

        if (isset($filters['project_id'])) {
            $builder->where('project_id', $filters['project_id']);
        }

        if (isset($filters['is_billable'])) {
            $builder->where('is_billable', $filters['is_billable']);
        }

        // Pagination
        $page = $filters['page'] ?? 1;
        $perPage = $filters['per_page'] ?? 20;
        $offset = ($page - 1) * $perPage;

        $total = $builder->countAllResults(false);
        $entries = $builder->orderBy('started_at', 'DESC')->limit($perPage, $offset)->get()->getResultArray();
        $entries = array_map(fn ($e) => $this->formatTimeEntry($e), $entries);

        return [
            'data' => $entries,
            'pagination' => [
                'current_page' => (int) $page,
                'per_page' => (int) $perPage,
                'total' => $total,
                'total_pages' => ceil($total / $perPage),
                'has_more' => $page < ceil($total / $perPage)
            ]
        ];
    }

    /**
     * Create manual time entry
     */
    public function createManualEntry(int $userId, int $organizationId, array $data): array
    {
        $this->db->transStart();

        try {
            $duration = strtotime($data['ended_at']) - strtotime($data['started_at']);

            $entryData = [
                'user_id' => $userId,
                'organization_id' => $organizationId,
                'project_id' => $data['project_id'] ?? null,
                'task_id' => $data['task_id'] ?? null,
                'description' => $data['description'] ?? null,
                'started_at' => $data['started_at'],
                'ended_at' => $data['ended_at'],
                'duration_seconds' => $duration,
                'is_manual' => true,
                'is_billable' => $data['is_billable'] ?? true,
                'hourly_rate' => $data['hourly_rate'] ?? null,
            ];

            $entryId = $this->timeEntryModel->insert($entryData);

            if (!$entryId) {
                throw new \Exception('Failed to create time entry');
            }

            $this->db->transComplete();

            return $this->formatTimeEntry($this->timeEntryModel->find($entryId));

        } catch (\Exception $e) {
            $this->db->transRollback();
            throw $e;
        }
    }
}
