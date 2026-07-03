<?php

namespace App\Controllers\API\V1;

use App\Services\AiCategorizationService;
use App\Services\AiService;
use App\Services\AiStandupService;
use App\Services\PermissionService;
use CodeIgniter\RESTful\ResourceController;

class AiController extends ResourceController
{
    protected AiService $aiService;
    protected PermissionService $permissionService;
    protected $format = 'json';

    public function __construct()
    {
        $this->aiService = new AiService();
        $this->permissionService = new PermissionService();
    }

    /**
     * GET /api/v1/ai/status
     */
    public function status()
    {
        try {
            [$orgId] = $this->requireContext();
            return $this->respond([
                'success' => true,
                'data' => $this->aiService->statusFor($orgId),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/ai/ask  { question }
     */
    public function ask()
    {
        try {
            [$orgId, $userId] = $this->requireContext();
            if ($response = $this->requireTeamReports($orgId, $userId)) {
                return $response;
            }

            $body = $this->request->getJSON(true) ?? [];
            $question = (string) ($body['question'] ?? '');

            $result = $this->aiService->ask($orgId, $userId, $question);
            return $this->respond(['success' => true, 'data' => $result]);
        } catch (\InvalidArgumentException $e) {
            return $this->fail($e->getMessage(), 400);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/ai/weekly-narrative
     */
    public function weeklyNarrative()
    {
        try {
            [$orgId, $userId] = $this->requireContext();
            if ($response = $this->requireTeamReports($orgId, $userId)) {
                return $response;
            }

            $result = $this->aiService->weeklyNarrative($orgId, $userId);
            return $this->respond(['success' => true, 'data' => $result]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/ai/categorize?date=YYYY-MM-DD
     * Suggests time entries for the current user's own activity on a day.
     */
    public function categorize()
    {
        try {
            [$orgId, $userId] = $this->requireContext();

            $date = (string) ($this->request->getGet('date') ?? '');
            if ($date === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                $date = date('Y-m-d');
            }

            $result = (new AiCategorizationService())->suggest($orgId, $userId, $date);
            return $this->respond(['success' => true, 'data' => $result]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/ai/autopilot?date=YYYY-MM-DD
     * Reconstructs a full draft timesheet for the current user's own day.
     */
    public function autopilot()
    {
        try {
            [$orgId, $userId] = $this->requireContext();

            $date = (string) ($this->request->getGet('date') ?? '');
            if ($date === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                $date = date('Y-m-d');
            }

            $result = (new AiCategorizationService())->autopilot($orgId, $userId, $date);
            return $this->respond(['success' => true, 'data' => $result]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/ai/autopilot/apply
     * Body: { entries: [{ suggestion_id?, project_id?, description, started_at, ended_at, is_billable? }] }
     * Bulk-creates the accepted blocks as (ledgered) time entries.
     */
    public function applyAutopilot()
    {
        try {
            [$orgId, $userId] = $this->requireContext();

            $body = $this->request->getJSON(true) ?? [];
            $entries = $body['entries'] ?? [];
            if (!is_array($entries) || $entries === []) {
                return $this->fail('No entries to apply.', 400);
            }

            $result = (new AiCategorizationService())->applyAutopilot($orgId, $userId, $entries);
            return $this->respond(['success' => true, 'data' => $result]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/ai/standup?date=YYYY-MM-DD&user_id=123
     * Own standup by default; managers (reports.view_team) may target a member.
     */
    public function standup()
    {
        try {
            [$orgId, $userId] = $this->requireContext();

            $targetId = (int) ($this->request->getGet('user_id') ?? 0) ?: $userId;
            if ($targetId !== $userId && $response = $this->requireTeamReports($orgId, $userId)) {
                return $response;
            }

            $date = (string) ($this->request->getGet('date') ?? '');
            if ($date === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                $date = date('Y-m-d');
            }

            $result = (new AiStandupService())->forUser($orgId, $targetId, $date);
            return $this->respond(['success' => true, 'data' => $result]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    protected function requireContext(): array
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);

        if (!$orgId || !$userId) {
            throw new \RuntimeException('Unauthorized');
        }

        return [$orgId, $userId];
    }

    protected function requireTeamReports(int $orgId, int $userId)
    {
        if ($this->permissionService->userHasPermission($userId, $orgId, 'reports.view_team')) {
            return null;
        }

        return $this->failForbidden('Team report permission required');
    }
}
