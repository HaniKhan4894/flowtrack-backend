<?php

namespace App\Controllers\API\V1;

use App\Services\AiService;
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
