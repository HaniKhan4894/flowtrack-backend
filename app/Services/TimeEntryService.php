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

    private function orgLocalDate(string $utcTimestamp, string $phpTz): string
    {
        $local = $this->timezoneService->toOrgLocal($utcTimestamp, $phpTz);

        return $local ? substr($local, 0, 10) : substr($utcTimestamp, 0, 10);
    }

    private function orgLocalToday(string $phpTz): string
    {
        try {
            return (new \DateTime('now', new \DateTimeZone($phpTz)))->format('Y-m-d');
        } catch (\Exception $e) {
            return date('Y-m-d');
        }
    }

    private function nextLocalDate(string $localDate): string
    {
        try {
            return (new \DateTime($localDate . ' 12:00:00'))->modify('+1 day')->format('Y-m-d');
        } catch (\Exception $e) {
            return date('Y-m-d', strtotime($localDate . ' +1 day'));
        }
    }

    /**
     * Close an open entry at $endedAtUtc with pause-aware duration.
     * When $endedAtEqualsPause, treat end as the pause moment (overnight pause).
     */
    private function closeOpenEntryAt(array $entry, string $endedAtUtc, bool $endedAtEqualsPause = false): array
    {
        $started = strtotime((string) $entry['started_at']);
        $ended = strtotime($endedAtUtc);
        if (!$started || !$ended || $ended < $started) {
            $ended = $started ?: time();
            $endedAtUtc = date('Y-m-d H:i:s', $ended);
        }

        $paused = (int) ($entry['paused_duration_seconds'] ?? 0);
        if (!$endedAtEqualsPause && !empty($entry['paused_at'])) {
            $pausedAt = strtotime((string) $entry['paused_at']);
            if ($pausedAt && $pausedAt < $ended) {
                $paused += ($ended - $pausedAt);
            }
        }

        $netDuration = max(0, $ended - $started - $paused);

        $this->timeEntryModel->update((int) $entry['id'], [
            'ended_at' => $endedAtUtc,
            'paused_at' => null,
            'paused_duration_seconds' => $paused,
            'duration_seconds' => $netDuration,
        ]);

        $closed = $this->formatTimeEntry($this->timeEntryModel->find((int) $entry['id']));
        $closed = $this->attachProjectName($closed);

        try {
            $this->notificationService->notifyTimeEntryStopped((int) $entry['user_id'], $closed);
        } catch (\Throwable $e) {
            log_message('error', 'Timer stopped notification failed: ' . $e->getMessage());
        }

        $this->recordToLedger((int) $closed['organization_id'], (int) $entry['user_id'], (int) $entry['id'], 'record');
        $this->emitEntryEvent('time_entry.completed', (int) $closed['organization_id'], $closed);

        return $closed;
    }

    /**
     * Continue tracking into the next calendar day with a fresh open entry.
     */
    private function openContinuationEntry(array $fromEntry, string $startedAtUtc, ?string $pausedAtUtc = null): array
    {
        $data = [
            'user_id' => (int) $fromEntry['user_id'],
            'organization_id' => (int) $fromEntry['organization_id'],
            'project_id' => $fromEntry['project_id'] ?? null,
            'task_id' => $fromEntry['task_id'] ?? null,
            'description' => $fromEntry['description'] ?? null,
            'started_at' => $startedAtUtc,
            'ended_at' => null,
            'paused_at' => $pausedAtUtc,
            'paused_duration_seconds' => 0,
            'duration_seconds' => 0,
            'is_manual' => false,
            'is_billable' => $fromEntry['is_billable'] ?? true,
            'hourly_rate' => $fromEntry['hourly_rate'] ?? null,
        ];

        foreach (['client_public_ip', 'client_router_mac', 'work_location'] as $field) {
            if (array_key_exists($field, $fromEntry) && $fromEntry[$field] !== null && $fromEntry[$field] !== '') {
                $data[$field] = $fromEntry[$field];
            }
        }

        $id = $this->timeEntryModel->insert($data);
        if (!$id) {
            throw new \RuntimeException('Failed to continue timer into the next day');
        }

        return $this->timeEntryModel->find($id);
    }

    /**
     * Split open timers that crossed midnight (org timezone).
     *
     * - Running overnight: close prior day(s) at 23:59:59, open continuation at 00:00:00.
     * - Paused overnight: close at pause time (no phantom overnight hours); resume starts a new entry.
     *
     * @return array|null Current open entry after sync, or null if nothing left running
     */
    public function syncOpenTimerDayBoundary(array $entry): ?array
    {
        if (!empty($entry['ended_at'])) {
            return null;
        }

        $orgId = (int) ($entry['organization_id'] ?? 0);
        $phpTz = $this->timezoneService->getOrgTimezone($orgId);
        $today = $this->orgLocalToday($phpTz);
        $startDate = $this->orgLocalDate((string) $entry['started_at'], $phpTz);

        if ($startDate >= $today) {
            return $entry;
        }

        // Paused across calendar days → finalize at pause; caller/resume opens a new day entry.
        if (!empty($entry['paused_at'])) {
            $this->closeOpenEntryAt($entry, (string) $entry['paused_at'], true);

            return null;
        }

        // Running across one or more midnights
        $current = $entry;
        $guard = 0;
        while ($guard++ < 60) {
            $startDate = $this->orgLocalDate((string) $current['started_at'], $phpTz);
            if ($startDate >= $today) {
                return $current;
            }

            [, $endOfDayUtc] = $this->timezoneService->dayRangeUtc($startDate, $phpTz);
            $nowUtc = gmdate('Y-m-d H:i:s');
            // Safety: never close in the future
            if ($endOfDayUtc > $nowUtc) {
                return $current;
            }

            $this->closeOpenEntryAt($current, $endOfDayUtc, false);

            $nextDate = $this->nextLocalDate($startDate);
            [$nextStartUtc] = $this->timezoneService->dayRangeUtc($nextDate, $phpTz);

            // If next day is still in the past relative to "today", continue the chain;
            // if next day is today or later, open continuation from day start (or now if somehow later).
            $continueFrom = $nextStartUtc <= $nowUtc ? $nextStartUtc : $nowUtc;
            $current = $this->openContinuationEntry($current, $continueFrom, null);
        }

        return $current;
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
        // Check if user has active timer (also syncs midnight splits first)
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

        // Split prior days first so stop only finalizes today's segment
        $synced = $this->syncOpenTimerDayBoundary($entry);
        if (!$synced) {
            // Overnight pause already finalized the entry
            $closed = $this->timeEntryModel->find($entryId);
            if ($closed && !empty($closed['ended_at'])) {
                return $this->attachProjectName($this->formatTimeEntry($closed));
            }
            throw new \Exception('Timer already stopped');
        }

        $entry = $synced;
        $endedAt = date('Y-m-d H:i:s');

        return $this->attachProjectName($this->closeOpenEntryAt($entry, $endedAt, false));
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

        $synced = $this->syncOpenTimerDayBoundary($entry);
        if (!$synced) {
            throw new \Exception('Timer already stopped');
        }
        $entry = $synced;

        if ($entry['paused_at']) {
            throw new \Exception('Timer is already paused');
        }

        $this->timeEntryModel->update((int) $entry['id'], [
            'paused_at' => date('Y-m-d H:i:s'),
        ]);

        return $this->formatActiveTimer($this->timeEntryModel->find((int) $entry['id']));
    }

    /**
     * Resume timer
     */
    public function resumeTimer(int $userId, int $entryId): array
    {
        $entry = $this->timeEntryModel->find($entryId);

        if (!$entry || $entry['user_id'] != $userId) {
            throw new \Exception('Invalid time entry');
        }

        // Overnight pause: old entry was/is closed at pause → start a fresh entry today
        if (!empty($entry['ended_at'])) {
            throw new \Exception('Timer already stopped — start a new timer for today');
        }

        if (!$entry['paused_at']) {
            throw new \Exception('Timer is not paused');
        }

        $orgId = (int) ($entry['organization_id'] ?? 0);
        $phpTz = $this->timezoneService->getOrgTimezone($orgId);
        $today = $this->orgLocalToday($phpTz);
        $startDate = $this->orgLocalDate((string) $entry['started_at'], $phpTz);
        $pauseDate = $this->orgLocalDate((string) $entry['paused_at'], $phpTz);

        if ($startDate < $today || $pauseDate < $today) {
            // Close yesterday's work at the pause moment, then open a new running entry now
            $this->closeOpenEntryAt($entry, (string) $entry['paused_at'], true);
            $fresh = $this->openContinuationEntry($entry, date('Y-m-d H:i:s'), null);

            return $this->formatActiveTimer($fresh);
        }

        $now = date('Y-m-d H:i:s');
        $pauseDuration = strtotime($now) - strtotime((string) $entry['paused_at']);
        $totalPaused = (int) $entry['paused_duration_seconds'] + max(0, $pauseDuration);

        $this->timeEntryModel->update((int) $entry['id'], [
            'paused_at' => null,
            'paused_duration_seconds' => $totalPaused,
        ]);

        return $this->formatActiveTimer($this->timeEntryModel->find((int) $entry['id']));
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

        if (!$entry) {
            return null;
        }

        $synced = $this->syncOpenTimerDayBoundary($entry);
        if (!$synced) {
            return null;
        }

        return $this->formatActiveTimer($synced);
    }

    /**
     * Ensure all open org timers are split at midnight (for admin live views).
     *
     * @param int[] $userIds
     */
    public function syncOpenTimersForUsers(array $userIds): void
    {
        if ($userIds === []) {
            return;
        }

        $rows = $this->timeEntryModel
            ->whereIn('user_id', array_map('intval', $userIds))
            ->where('ended_at', null)
            ->findAll();

        foreach ($rows as $row) {
            try {
                $this->syncOpenTimerDayBoundary($row);
            } catch (\Throwable $e) {
                log_message('error', 'Day-boundary timer sync failed: ' . $e->getMessage());
            }
        }
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
