<?php

namespace App\Commands;

use App\Services\WebhookService;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

/**
 * Phase 10 — Retry failed webhook deliveries. Schedule alongside the other
 * FlowTrack CLI jobs (e.g. every few minutes) via cron / task scheduler.
 */
class WebhooksDispatch extends BaseCommand
{
    protected $group = 'Webhooks';
    protected $name = 'webhooks:dispatch';
    protected $description = 'Retry failed/pending outbound webhook deliveries';
    protected $usage = 'webhooks:dispatch [limit]';

    public function run(array $params)
    {
        $limit = isset($params[0]) ? (int) $params[0] : 50;
        $retried = (new WebhookService())->retryFailed($limit);
        CLI::write(sprintf('Retried %d webhook delivery(ies).', $retried), 'green');
    }
}
