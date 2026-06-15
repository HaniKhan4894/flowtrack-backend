<?php

namespace App\Controllers\API\V1;

use App\Services\InsightsService;
use CodeIgniter\RESTful\ResourceController;

class InsightsController extends ResourceController
{
    protected InsightsService $insightsService;
    protected $format = 'json';

    public function __construct()
    {
        $this->insightsService = new InsightsService();
    }

    public function weeklySummary()
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
        $summary = $this->insightsService->getWeeklyManagerSummary($orgId, $userId);
        return $this->respond(['success' => true, 'data' => $summary]);
    }

    public function benchmarks()
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        $start = $this->request->getGet('start_date') ?? $this->request->getGet('start') ?? date('Y-m-d', strtotime('-30 days'));
        $end = $this->request->getGet('end_date') ?? $this->request->getGet('end') ?? date('Y-m-d');
        $data = $this->insightsService->getBenchmarks($orgId, $start, $end);
        return $this->respond(['success' => true, 'data' => $data]);
    }

    public function workPatterns()
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        $userId = $this->request->getGet('user_id');
        $days = (int) ($this->request->getGet('days') ?? 14);
        $data = $this->insightsService->getWorkPatterns($orgId, $userId ? (int) $userId : null, max(7, min(30, $days)));
        return $this->respond(['success' => true, 'data' => $data]);
    }

    public function coach()
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        $userId = $this->request->getGet('user_id');
        $data = $this->insightsService->getCoachSuggestions($orgId, $userId ? (int) $userId : null);
        return $this->respond(['success' => true, 'data' => $data]);
    }

    public function deliveryRisks()
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        $data = $this->insightsService->getDeliveryRisks($orgId);
        return $this->respond(['success' => true, 'data' => $data]);
    }

    public function sprints()
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        return $this->respond(['success' => true, 'data' => $this->insightsService->listSprints($orgId)]);
    }

    public function createSprint()
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        $body = $this->request->getJSON(true) ?? [];
        if (empty($body['start_date']) || empty($body['end_date'])) {
            return $this->respond(['success' => false, 'error' => 'start_date and end_date are required'], 400);
        }
        $sprint = $this->insightsService->createSprint($orgId, $body);
        return $this->respond(['success' => true, 'data' => $sprint], 201);
    }
}
