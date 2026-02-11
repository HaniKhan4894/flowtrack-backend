<?php

namespace App\Services;

use App\Models\TimeEntryModel;
use App\Models\ProjectModel;

class TimeEntryService
{
    protected $timeEntryModel;
    protected $projectModel;
    protected $db;

    public function __construct()
    {
        $this->timeEntryModel = new TimeEntryModel();
        $this->projectModel = new ProjectModel();
        $this->db = \Config\Database::connect();
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

            return $this->timeEntryModel->find($entryId);

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
        $duration = strtotime($endedAt) - strtotime($entry['started_at']);

        $this->timeEntryModel->update($entryId, [
            'ended_at' => $endedAt,
            'duration_seconds' => $duration
        ]);

        return $this->timeEntryModel->find($entryId);
    }

    /**
     * Get active timer for user
     */
    public function getActiveTimer(int $userId): ?array
    {
        return $this->timeEntryModel
            ->where('user_id', $userId)
            ->where('ended_at', null)
            ->first();
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

        if (isset($filters['project_id'])) {
            $builder->where('project_id', $filters['project_id']);
        }

        if (isset($filters['start_date'])) {
            $builder->where('started_at >=', $filters['start_date']);
        }

        if (isset($filters['end_date'])) {
            $builder->where('started_at <=', $filters['end_date']);
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

        return [
            'data' => $entries,
            'pagination' => [
                'current_page' => (int)$page,
                'per_page' => (int)$perPage,
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

            return $this->timeEntryModel->find($entryId);

        } catch (\Exception $e) {
            $this->db->transRollback();
            throw $e;
        }
    }
}
