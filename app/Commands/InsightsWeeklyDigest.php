<?php

namespace App\Commands;

use App\Services\InsightsService;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

class InsightsWeeklyDigest extends BaseCommand
{
    protected $group       = 'Insights';
    protected $name        = 'insights:weekly-digest';
    protected $description = 'Send weekly productivity summaries to managers';
    protected $usage       = 'insights:weekly-digest';

    public function run(array $params)
    {
        CLI::write('Sending weekly manager digests...', 'yellow');

        $service = new InsightsService();
        $result = $service->sendWeeklyDigests();

        CLI::write('Sent ' . $result['sent_count'] . ' digest(s).', 'green');
    }
}
