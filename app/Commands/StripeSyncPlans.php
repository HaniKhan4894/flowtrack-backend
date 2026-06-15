<?php

namespace App\Commands;

use App\Services\SubscriptionService;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

class StripeSyncPlans extends BaseCommand
{
    protected $group       = 'Stripe';
    protected $name        = 'stripe:sync-plans';
    protected $description = 'Create Stripe products/prices for paid plans and store price IDs';
    protected $usage       = 'stripe:sync-plans';

    public function run(array $params)
    {
        CLI::write('Syncing Stripe prices for paid plans...', 'yellow');

        try {
            $service = new SubscriptionService();
            $synced = $service->syncStripePlans();
        } catch (\Throwable $e) {
            CLI::error($e->getMessage());
            return;
        }

        if ($synced === []) {
            CLI::write('No paid plans found to sync.', 'yellow');
            return;
        }

        foreach ($synced as $row) {
            CLI::write(
                sprintf(
                    'Plan %s (%s/%s): %s',
                    $row['slug'],
                    $row['billing_cycle'],
                    $row['plan_id'],
                    $row['price_id']
                ),
                'green'
            );
        }
    }
}
