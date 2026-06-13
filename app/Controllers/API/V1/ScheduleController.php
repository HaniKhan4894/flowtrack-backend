<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\ScheduleService;
use App\Services\OvertimeService;

class ScheduleController extends ResourceController
{
    protected ScheduleService $scheduleService;
    protected OvertimeService $overtimeService;
    protected $format = 'json';

    public function __construct()
    {
        $this->scheduleService = new ScheduleService();
        $this->overtimeService = new OvertimeService();
    }

    private function requireOrganizationId()
    {
        $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if ($organizationId <= 0) {
            return $this->fail('Organization context is required', 400);
        }
        return $organizationId;
    }

    public function index()
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $userId = (int)($this->request->getGet('user_id') ?? $this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$userId) {
                return $this->fail('user_id is required', 400);
            }

            return $this->respond([
                'success' => true,
                'data' => $this->scheduleService->getSchedule($organizationId, $userId),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function upsert()
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $data = $this->request->getJSON(true);
            $userId = (int)($data['user_id'] ?? $this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$userId || empty($data['days'])) {
                return $this->fail('user_id and days are required', 400);
            }

            $schedule = $this->scheduleService->upsertSchedule($organizationId, $userId, $data['days']);

            return $this->respond([
                'success' => true,
                'message' => 'Schedule saved',
                'data' => $schedule,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function deleteDay($dayOfWeek = null)
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $userId = (int)($this->request->getGet('user_id') ?? $this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$userId) {
                return $this->fail('user_id is required', 400);
            }

            $this->scheduleService->deleteScheduleDay($organizationId, $userId, (int) $dayOfWeek);

            return $this->respondDeleted(['success' => true, 'message' => 'Schedule day removed']);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function expectedVsActual()
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $userId = (int)($this->request->getGet('user_id') ?? $this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $startDate = $this->request->getGet('start_date');
            $endDate = $this->request->getGet('end_date');

            if (!$userId || !$startDate || !$endDate) {
                return $this->fail('user_id, start_date, and end_date are required', 400);
            }

            return $this->respond([
                'success' => true,
                'data' => $this->scheduleService->getExpectedVsActual($organizationId, $userId, $startDate, $endDate),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function overtimeRules()
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            return $this->respond([
                'success' => true,
                'data' => $this->overtimeService->getRules($organizationId),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function upsertOvertimeRules()
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $data = $this->request->getJSON(true);

            return $this->respond([
                'success' => true,
                'data' => $this->overtimeService->upsertRules($organizationId, $data),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function calculateOvertime()
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $userId = (int)($this->request->getGet('user_id') ?? $this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $startDate = $this->request->getGet('start_date');
            $endDate = $this->request->getGet('end_date');

            if (!$userId || !$startDate || !$endDate) {
                return $this->fail('user_id, start_date, and end_date are required', 400);
            }

            return $this->respond([
                'success' => true,
                'data' => $this->overtimeService->calculate($organizationId, $userId, $startDate, $endDate),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
