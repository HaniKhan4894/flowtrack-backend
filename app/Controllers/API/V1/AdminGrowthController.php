<?php

namespace App\Controllers\API\V1;

use App\Services\Admin\AdminGrowthService;
use App\Services\Admin\GrowthSegmentService;
use App\Services\Admin\MarketingCampaignService;

/**
 * Growth analytics: funnel, cohorts, churn, health scores and lifecycle segments.
 */
class AdminGrowthController extends AdminBaseController
{
    protected AdminGrowthService $growth;
    protected GrowthSegmentService $segments;

    public function __construct()
    {
        $this->growth = new AdminGrowthService();
        $this->segments = new GrowthSegmentService();
    }

    /**
     * Everything the growth dashboard needs in one request.
     */
    public function overview()
    {
        return $this->attempt(fn () => [
            'metrics' => $this->growth->keyMetrics(),
            'funnel' => $this->growth->funnel((int) ($this->request->getGet('funnel_days') ?? 90)),
            'engagement' => $this->growth->engagementDistribution(),
            'segments' => $this->segments->overview(),
            'campaigns' => (new MarketingCampaignService())->performanceSummary(),
        ]);
    }

    public function cohorts()
    {
        $months = (int) ($this->request->getGet('months') ?? 9);

        return $this->attempt(fn () => $this->growth->cohorts($months));
    }

    public function churn()
    {
        $months = (int) ($this->request->getGet('months') ?? 12);

        return $this->attempt(fn () => [
            'churn' => $this->growth->churnAnalysis($months),
            'revenue_movement' => $this->growth->revenueMovement($months),
        ]);
    }

    public function health()
    {
        $limit = (int) ($this->request->getGet('limit') ?? 60);

        return $this->attempt(fn () => $this->growth->healthScores($limit));
    }

    public function segments()
    {
        return $this->attempt(fn () => [
            'definitions' => $this->segments->definitions(),
            'overview' => $this->segments->overview(),
        ]);
    }

    /**
     * Accounts inside a single segment, with optional threshold overrides.
     */
    public function segmentMembers(string $key)
    {
        $config = $this->request->getGet() ?: [];
        unset($config['limit']);
        $limit = (int) ($this->request->getGet('limit') ?? 100);

        return $this->attempt(fn () => [
            'stats' => $this->segments->stats($key, $config),
            'organizations' => $this->segments->organizations($key, $config, $limit),
        ]);
    }
}
