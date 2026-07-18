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
    protected $permissionService;
    protected $notificationService;
    protected $db;

    public function __construct()
    {
        $this->timeEntryModel = new TimeEntryModel();
        $this->projectModel = new ProjectModel();
        $this->timezoneService = new TimezoneService();
        $this->permissionService = new PermissionService();
        $this->notificationService = new NotificationService();
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

        // Validate project belongs to organization and user is allowed to use it
        if (!empty($data['project_id'])) {
            $project = $this->projectModel->find($data['project_id']);
            if (!$project || $project['organization_id'] != $organizationId) {
                throw new \Exception('Invalid project');
            }

            $projectMemberService = new ProjectMemberService();
            if (!$projectMemberService->isAssigned($organizationId, $userId, (int) $data['project_id'])) {
                throw new \Exception('You are not assigned to this project');
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

            $locationMeta = $this->resolveWorkLocationMeta($organizationId, $data);
            $entryData = array_merge($entryData, $locationMeta);

            $entryId = $this->timeEntryModel->insert($entryData);

            if (!$entryId) {
                throw new \Exception('Failed to start timer');
            }

            $this->db->transComplete();

            $entry = $this->formatTimeEntry($this->timeEntryModel->find($entryId));
            $entry = $this->attachProjectName($entry);
            try {
                $this->notificationService->notifyTimeEntryStarted($userId, $entry);
            } catch (\Throwable $e) {
                log_message('error', 'Timer started notification failed: ' . $e->getMessage());
            }

            return $entry;

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

        $entry = $this->formatTimeEntry($this->timeEntryModel->find($entryId));
        $entry = $this->attachProjectName($entry);
        try {
            $this->notificationService->notifyTimeEntryStopped($userId, $entry);
        } catch (\Throwable $e) {
            log_message('error', 'Timer stopped notification failed: ' . $e->getMessage());
        }

        $this->recordToLedger((int) $entry['organization_id'], $userId, $entryId, 'record');
        $this->emitEntryEvent('time_entry.completed', (int) $entry['organization_id'], $entry);

        return $entry;
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
            if (!empty($data['project_id'])) {
                $project = $this->projectModel->find($data['project_id']);
                if (!$project || (int) $project['organization_id'] !== $organizationId) {
                    throw new \Exception('Invalid project');
                }
                $projectMemberService = new ProjectMemberService();
                if (!$projectMemberService->isAssigned($organizationId, $userId, (int) $data['project_id'])) {
                    throw new \Exception('You are not assigned to this project');
                }
            }

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

            $entry = $this->formatTimeEntry($this->timeEntryModel->find($entryId));
            $this->recordToLedger($organizationId, $userId, $entryId, 'record');
            $this->emitEntryEvent('time_entry.completed', $organizationId, $entry);

            return $entry;

        } catch (\Exception $e) {
            $this->db->transRollback();
            throw $e;
        }
    }

    public function updateEntry(int $entryId, int $actorUserId, int $organizationId, array $data): array
    {
        $entry = $this->timeEntryModel->find($entryId);
        if (!$entry || (int) $entry['organization_id'] !== $organizationId) {
            throw new \Exception('Time entry not found');
        }

        $this->assertCanEditEntry($actorUserId, $organizationId, $entry);

        if (empty($entry['ended_at']) && isset($data['ended_at'])) {
            throw new \Exception('Cannot set end time on an active timer');
        }

        $updates = [];
        $allowed = ['project_id', 'task_id', 'description', 'started_at', 'ended_at', 'is_billable', 'hourly_rate'];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $updates[$field] = $data[$field];
            }
        }

        if (isset($updates['project_id']) && $updates['project_id']) {
            $project = $this->projectModel->find($updates['project_id']);
            if (!$project || (int) $project['organization_id'] !== $organizationId) {
                throw new \Exception('Invalid project');
            }
            $targetUserId = (int) ($entry['user_id'] ?? $actorUserId);
            $projectMemberService = new ProjectMemberService();
            if (!$projectMemberService->isAssigned($organizationId, $targetUserId, (int) $updates['project_id'])) {
                throw new \Exception('You are not assigned to this project');
            }
        }

        if (isset($updates['started_at'], $updates['ended_at'])) {
            $duration = strtotime($updates['ended_at']) - strtotime($updates['started_at']);
            $updates['duration_seconds'] = max(0, $duration);
        } elseif (isset($updates['ended_at']) || isset($updates['started_at'])) {
            $started = $updates['started_at'] ?? $entry['started_at'];
            $ended = $updates['ended_at'] ?? $entry['ended_at'];
            if ($started && $ended) {
                $updates['duration_seconds'] = max(0, strtotime($ended) - strtotime($started));
            }
        }

        if (!empty($updates)) {
            $this->timeEntryModel->update($entryId, $updates);
            // Only completed entries are ledgered; amend keeps the chain honest.
            if (!empty($entry['ended_at'])) {
                $this->recordToLedger($organizationId, (int) $entry['user_id'], $entryId, 'amend');
            }
        }

        $updated = $this->formatTimeEntry($this->timeEntryModel->find($entryId));
        $this->emitEntryEvent('time_entry.updated', $organizationId, $updated);

        return $updated;
    }

    public function deleteEntry(int $entryId, int $actorUserId, int $organizationId): bool
    {
        $entry = $this->timeEntryModel->find($entryId);
        if (!$entry || (int) $entry['organization_id'] !== $organizationId) {
            throw new \Exception('Time entry not found');
        }

        $this->assertCanEditEntry($actorUserId, $organizationId, $entry);

        if (empty($entry['ended_at'])) {
            throw new \Exception('Stop the timer before deleting this entry');
        }

        // Record the deletion in the ledger *before* the row disappears.
        $this->recordToLedger($organizationId, (int) $entry['user_id'], $entryId, 'delete');
        $this->emitEntryEvent('time_entry.deleted', $organizationId, $entry);

        return $this->timeEntryModel->delete($entryId);
    }

    /**
     * Append to the proof-of-work ledger. Never let ledger issues break tracking.
     */
    private function recordToLedger(int $organizationId, int $userId, int $entryId, string $action): void
    {
        try {
            (new LedgerService())->appendTimeEntry($organizationId, $userId, $entryId, $action);
        } catch (\Throwable $e) {
            log_message('error', 'Ledger append failed: ' . $e->getMessage());
        }
    }

    /**
     * Emit a time-entry domain event to webhooks + automations (best-effort).
     */
    private function emitEntryEvent(string $event, int $organizationId, array $entry): void
    {
        try {
            $userId = (int) ($entry['user_id'] ?? 0);
            $userName = 'A team member';
            if ($userId > 0) {
                $u = $this->db->table('users')->select('first_name, last_name')->where('id', $userId)->get()->getRowArray();
                if ($u) {
                    $userName = trim(($u['first_name'] ?? '') . ' ' . ($u['last_name'] ?? '')) ?: $userName;
                }
            }

            EventBus::emit($organizationId, $event, [
                'entry_id'         => (int) ($entry['id'] ?? 0),
                'user_id'          => $userId,
                'user_name'        => $userName,
                'project_id'       => $entry['project_id'] ?? null,
                'project_name'     => $entry['project_name'] ?? null,
                'description'      => $entry['description'] ?? null,
                'duration_seconds' => (int) ($entry['duration_seconds'] ?? 0),
                'hours'            => round(((int) ($entry['duration_seconds'] ?? 0)) / 3600, 2),
                'is_billable'      => (bool) ($entry['is_billable'] ?? false),
            ]);
        } catch (\Throwable $e) {
            log_message('error', 'Event emit failed: ' . $e->getMessage());
        }
    }

    private function assertCanEditEntry(int $actorUserId, int $organizationId, array $entry): void
    {
        $ownerId = (int) $entry['user_id'];
        if ($ownerId === $actorUserId) {
            if (!$this->permissionService->userHasPermission($actorUserId, $organizationId, 'time.manual_entry')) {
                throw new \Exception('Manual time entry editing is not allowed for your role');
            }
            return;
        }

        if (!$this->permissionService->userHasPermission($actorUserId, $organizationId, 'time.edit_team')) {
            throw new \Exception('Unauthorized');
        }
    }

    private function resolveWorkLocationMeta(int $organizationId, array $data): array
    {
        $publicIp = $data['client_public_ip'] ?? $data['public_ip'] ?? null;
        $routerMac = $data['client_router_mac'] ?? $data['router_mac'] ?? null;

        if (!$publicIp && !$routerMac) {
            return [];
        }

        $officeService = new OfficeLocationService();
        $workLocation = $officeService->resolveWorkLocation($organizationId, $publicIp, $routerMac);

        return [
            'client_public_ip' => $publicIp ? trim((string) $publicIp) : null,
            'client_router_mac' => $routerMac ? trim((string) $routerMac) : null,
            'work_location' => $workLocation,
        ];
    }

    public function updateWorkLocationFromClient(int $entryId, int $organizationId, array $data): void
    {
        $meta = $this->resolveWorkLocationMeta($organizationId, $data);
        if ($meta === []) {
            return;
        }

        $this->timeEntryModel->update($entryId, $meta);
    }

    private function attachProjectName(array $entry): array
    {
        if (!empty($entry['project_id'])) {
            $project = $this->projectModel->select('name')->find($entry['project_id']);
            $entry['project_name'] = $project['name'] ?? null;
        }

        return $entry;
    }
}
