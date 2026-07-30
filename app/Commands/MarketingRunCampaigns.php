<?php

namespace App\Commands;

use App\Services\Admin\MarketingCampaignService;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

/**
 * Dispatch scheduled one-off campaigns and recurring lifecycle automations.
 * Schedule every 15-30 minutes via cron / Task Scheduler.
 */
class MarketingRunCampaigns extends BaseCommand
{
    protected $group = 'Marketing';
    protected $name = 'marketing:run-campaigns';
    protected $description = 'Send due marketing campaigns and lifecycle automations';
    protected $usage = 'marketing:run-campaigns [limit]';

    public function run(array $params)
    {
        $limit = isset($params[0]) ? max(1, (int) $params[0]) : 20;
        $results = (new MarketingCampaignService())->runDue($limit);

        if ($results === []) {
            CLI::write('No campaigns due.', 'yellow');

            return;
        }

        $totalSent = 0;

        foreach ($results as $result) {
            if (isset($result['error'])) {
                CLI::write(sprintf('  #%d %s — FAILED: %s', $result['campaign_id'], $result['name'], $result['error']), 'red');
                continue;
            }

            $totalSent += $result['sent'];
            CLI::write(sprintf(
                '  #%d %s — sent %d, failed %d, skipped %d (audience %d)',
                $result['campaign_id'],
                $result['name'],
                $result['sent'],
                $result['failed'],
                $result['skipped'],
                $result['recipients']
            ), 'green');
        }

        CLI::write(sprintf('Processed %d campaign(s), %d message(s) sent.', count($results), $totalSent), 'green');
    }
}
