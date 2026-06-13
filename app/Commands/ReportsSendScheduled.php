<?php

namespace App\Commands;

use App\Services\ScheduledReportService;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

class ReportsSendScheduled extends BaseCommand
{
    protected $group       = 'Reports';
    protected $name        = 'reports:send-scheduled';
    protected $description = 'Send due scheduled reports to configured recipients';
    protected $usage       = 'reports:send-scheduled';

    public function run(array $params)
    {
        CLI::write('Checking scheduled reports...', 'yellow');

        $service = new ScheduledReportService();
        $result = $service->sendDueReports();

        CLI::write('Sent ' . $result['sent_count'] . ' report(s).', 'green');

        if (!empty($result['sent_ids'])) {
            CLI::write('Report IDs: ' . implode(', ', $result['sent_ids']));
        }
    }
}
