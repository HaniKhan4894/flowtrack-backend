<?php

namespace App\Commands;

use App\Services\SmartNotificationService;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

class EvaluateSmartNotifications extends BaseCommand
{
    protected $group = 'Notifications';
    protected $name = 'notifications:evaluate-smart';
    protected $description = 'Evaluate smart notification rules and send alerts';
    protected $usage = 'notifications:evaluate-smart';

    public function run(array $params)
    {
        $summary = (new SmartNotificationService())->evaluateAllOrganizations();
        CLI::write(
            sprintf('Evaluated %d organization(s), sent %d alert(s).', $summary['organizations'], $summary['alerts_sent']),
            'green'
        );
    }
}
