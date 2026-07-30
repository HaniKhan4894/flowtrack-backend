<?php

namespace App\Commands;

use App\Services\TimeEntryService;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

/**
 * Close timers that no client is backing any more and split the ones that crossed midnight.
 *
 * Run every 5 minutes. Without a scheduler an abandoned timer (sleeping laptop, killed app,
 * closed browser tab) keeps counting until its owner opens the app again.
 */
class TrackingSweepTimers extends BaseCommand
{
    protected $group = 'Tracking';
    protected $name = 'tracking:sweep-timers';
    protected $description = 'Split overnight timers and auto-close timers with no live client';
    protected $usage = 'tracking:sweep-timers';

    public function run(array $params)
    {
        $stats = (new TimeEntryService())->sweepOpenTimers();

        CLI::write(sprintf(
            'Open timers checked: %d — auto-closed: %d — failed: %d',
            $stats['checked'],
            $stats['closed'],
            $stats['failed']
        ), $stats['failed'] > 0 ? 'yellow' : 'green');
    }
}
