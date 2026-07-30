<?php

namespace App\Commands;

use App\Services\Admin\AdminCouponService;
use App\Services\Admin\AdminGrowthService;
use App\Services\Admin\AdminPaymentService;
use App\Services\Admin\GrowthSegmentService;
use App\Services\Admin\MarketingCampaignService;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

/**
 * Temporary developer helper: executes every growth/payment query once so SQL
 * errors surface without clicking through the admin portal.
 */
class GrowthSmoke extends BaseCommand
{
    protected $group = 'Development';
    protected $name = 'growth:smoke';
    protected $description = 'Run every growth/payment admin query once and report failures';

    public function run(array $params)
    {
        $payments = new AdminPaymentService();
        $growth = new AdminGrowthService();
        $segments = new GrowthSegmentService();
        $campaigns = new MarketingCampaignService();
        $coupons = new AdminCouponService();

        $checks = [
            'payments.list' => fn () => $payments->list(['per_page' => 5]),
            'payments.summary' => fn () => $payments->summary([]),
            'payments.revenue' => fn () => $payments->revenueReport(12),
            'payments.dunning' => fn () => $payments->dunningQueue(),
            'payments.forOrganization' => fn () => $payments->forOrganization(1, 5),
            'payments.export' => fn () => $payments->exportRows(['per_page' => 5]),
            'growth.keyMetrics' => fn () => $growth->keyMetrics(),
            'growth.funnel' => fn () => $growth->funnel(90),
            'growth.cohorts' => fn () => $growth->cohorts(6),
            'growth.churnAnalysis' => fn () => $growth->churnAnalysis(12),
            'growth.revenueMovement' => fn () => $growth->revenueMovement(12),
            'growth.healthScores' => fn () => $growth->healthScores(20),
            'growth.engagementDistribution' => fn () => $growth->engagementDistribution(),
            'campaigns.list' => fn () => $campaigns->list(['per_page' => 5]),
            'campaigns.performanceSummary' => fn () => $campaigns->performanceSummary(),
            'campaigns.playbooks' => fn () => $campaigns->playbooks(),
            'coupons.list' => fn () => $coupons->list(['per_page' => 5]),
            'coupons.summary' => fn () => $coupons->summary(),
        ];

        foreach ($segments->definitions() as $definition) {
            $config = [];
            foreach ($definition['config'] as $field) {
                $config[$field['key']] = $field['default'];
            }

            $checks['segment.' . $definition['key'] . '.stats'] = fn () => $segments->stats($definition['key'], $config);
            $checks['segment.' . $definition['key'] . '.orgs'] = fn () => $segments->organizations($definition['key'], $config, 5);
            $checks['segment.' . $definition['key'] . '.recipients'] = fn () => $segments->recipients($definition['key'], $config, 5);
        }

        $failures = 0;

        foreach ($checks as $label => $check) {
            try {
                $result = $check();
                $size = is_array($result) ? count($result) : 1;
                CLI::write(sprintf('  OK    %-45s (%d top-level keys)', $label, $size), 'green');
            } catch (\Throwable $e) {
                $failures++;
                CLI::write(sprintf('  FAIL  %-45s %s', $label, $e->getMessage()), 'red');
            }
        }

        CLI::newLine();
        CLI::write($failures === 0
            ? 'All growth/payment queries passed.'
            : sprintf('%d check(s) failed.', $failures), $failures === 0 ? 'green' : 'red');
    }
}
