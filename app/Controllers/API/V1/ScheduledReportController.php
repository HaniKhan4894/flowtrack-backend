<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\ScheduledReportService;

class ScheduledReportController extends ResourceController
{
    protected ScheduledReportService $scheduledReportService;
    protected $format = 'json';

    public function __construct()
    {
        $this->scheduledReportService = new ScheduledReportService();
    }

    private function organizationId(): int|\CodeIgniter\HTTP\ResponseInterface
    {
        $organizationId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if ($organizationId <= 0) {
            return $this->fail('Organization context is required', 400);
        }
        return $organizationId;
    }

    public function index()
    {
        try {
            $organizationId = $this->organizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            return $this->respond([
                'success' => true,
                'data' => $this->scheduledReportService->getScheduledReports($organizationId),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function create()
    {
        try {
            $organizationId = $this->organizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $data = $this->request->getJSON(true) ?? [];

            return $this->respondCreated([
                'success' => true,
                'data' => $this->scheduledReportService->create($organizationId, $userId, $data),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function update($id = null)
    {
        try {
            $organizationId = $this->organizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $data = $this->request->getJSON(true) ?? [];

            return $this->respond([
                'success' => true,
                'data' => $this->scheduledReportService->update((int) $id, $organizationId, $data),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function delete($id = null)
    {
        try {
            $organizationId = $this->organizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $this->scheduledReportService->delete((int) $id, $organizationId);

            return $this->respond(['success' => true, 'message' => 'Scheduled report deleted']);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
