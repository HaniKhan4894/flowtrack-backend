<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\TimeEntryService;

class TimeEntryController extends ResourceController
{
    protected $timeEntryService;
    protected $format = 'json';

    public function __construct()
    {
        $this->timeEntryService = new TimeEntryService();
    }

    /**
     * GET /api/v1/time-entries?user_id=1&project_id=5&start_date=2024-01-01&page=1&per_page=20
     */
    public function index()
    {
        try {
            // Get query parameters
            $filters = [
                'user_id' => $this->request->getGet('user_id') ?? $this->request->user_id ?? null,
                'organization_id' => $this->request->getGet('organization_id') ?? $this->request->organization_id ?? null,
                'project_id' => $this->request->getGet('project_id'),
                'start_date' => $this->request->getGet('start_date'),
                'end_date' => $this->request->getGet('end_date'),
                'is_billable' => $this->request->getGet('is_billable'),
                'page' => $this->request->getGet('page') ?? 1,
                'per_page' => $this->request->getGet('per_page') ?? 20,
            ];

            // Remove null values
            $filters = array_filter($filters, fn($value) => $value !== null);

            $result = $this->timeEntryService->getTimeEntries($filters);

            return $this->respond([
                'success' => true,
                'data' => $result['data'],
                'pagination' => $result['pagination']
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/time-entries/start
     */
    public function start()
    {
        try {
            $userId = $this->request->user_id ?? 1;
            $organizationId = $this->request->getGet('organization_id') ?? $this->request->organization_id ?? 1;

            $data = $this->request->getJSON(true);

            $entry = $this->timeEntryService->startTimer($userId, $organizationId, $data);

            return $this->respondCreated([
                'success' => true,
                'message' => 'Timer started successfully',
                'data' => $entry
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/time-entries/{id}/stop
     */
    public function stop($id)
    {
        try {
            $userId = $this->request->user_id ?? 1;

            $entry = $this->timeEntryService->stopTimer($userId, $id);

            return $this->respond([
                'success' => true,
                'message' => 'Timer stopped successfully',
                'data' => $entry
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/time-entries/active
     */
    public function active()
    {
        try {
            $userId = $this->request->user_id ?? 1;

            $entry = $this->timeEntryService->getActiveTimer($userId);

            return $this->respond([
                'success' => true,
                'data' => $entry
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/time-entries/manual
     */
    public function manual()
    {
        try {
            $userId = $this->request->user_id ?? 1;
            $organizationId = $this->request->getGet('organization_id') ?? $this->request->organization_id ?? 1;

            $data = $this->request->getJSON(true);

            // Validation
            $rules = [
                'started_at' => 'required|valid_date',
                'ended_at' => 'required|valid_date',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $entry = $this->timeEntryService->createManualEntry($userId, $organizationId, $data);

            return $this->respondCreated([
                'success' => true,
                'message' => 'Manual time entry created successfully',
                'data' => $entry
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
