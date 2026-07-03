<?php

namespace App\Controllers\API\V1;

use App\Services\CalendarService;
use App\Services\TimeEntryService;
use CodeIgniter\RESTful\ResourceController;

/**
 * Phase 8 — Calendar actions: list a day's meetings and turn one into a tracked
 * time entry.
 */
class CalendarController extends ResourceController
{
    protected $format = 'json';
    protected CalendarService $calendar;

    public function __construct()
    {
        $this->calendar = new CalendarService();
    }

    /**
     * GET /api/v1/integrations/calendar/events?date=YYYY-MM-DD
     */
    public function events()
    {
        try {
            $orgId = $this->orgId();
            if (!$this->calendar->isConnected($orgId)) {
                return $this->respond(['success' => true, 'data' => ['connected' => false, 'events' => []]]);
            }

            $date = (string) ($this->request->getGet('date') ?? '');
            if ($date === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                $date = date('Y-m-d');
            }

            $result = $this->calendar->eventsForDay($orgId, $date);
            return $this->respond([
                'success' => true,
                'data' => array_merge(['connected' => true, 'date' => $date], $result),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/integrations/calendar/log-time
     * Body: { title, started_at, ended_at, project_id?, is_billable? }
     */
    public function logTime()
    {
        try {
            [$orgId, $userId] = $this->context();
            $body = $this->request->getJSON(true) ?? [];

            $title = trim((string) ($body['title'] ?? ''));
            $startedAt = (string) ($body['started_at'] ?? '');
            $endedAt = (string) ($body['ended_at'] ?? '');

            if ($startedAt === '' || $endedAt === '' || strtotime($endedAt) <= strtotime($startedAt)) {
                return $this->fail('A valid meeting time range is required.', 400);
            }

            $entry = (new TimeEntryService())->createManualEntry($userId, $orgId, [
                'project_id'  => isset($body['project_id']) && $body['project_id'] ? (int) $body['project_id'] : null,
                'description' => mb_substr($title !== '' ? $title : 'Meeting', 0, 1000),
                'started_at'  => $startedAt,
                'ended_at'    => $endedAt,
                'is_billable' => (bool) ($body['is_billable'] ?? true),
            ]);

            return $this->respondCreated(['success' => true, 'data' => ['entry' => $entry]]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    private function orgId(): int
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if (!$orgId) {
            throw new \RuntimeException('Unauthorized');
        }
        return $orgId;
    }

    private function context(): array
    {
        $orgId = $this->orgId();
        $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
        if (!$userId) {
            throw new \RuntimeException('Unauthorized');
        }
        return [$orgId, $userId];
    }
}
