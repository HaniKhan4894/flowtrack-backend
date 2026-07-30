<?php

namespace App\Commands;

use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

/**
 * Repair activity logs that were recorded outside their time entry's window.
 *
 * A desktop client that never received the "timer stopped" signal (crash, offline, timer
 * stopped in the web app) kept syncing segments onto the finished entry, which made
 * "Active work" read higher than the hours actually tracked. Writes are now clamped at the
 * API, so this only cleans up rows created before that fix.
 */
class TrackingRepairActivity extends BaseCommand
{
    /** Same tolerance the API uses when matching a segment to its entry. */
    private const GRACE_SECONDS = 90;

    /** Ignore trims smaller than this — not worth rewriting someone's timesheet over. */
    private const MIN_TRIM_SECONDS = 900;

    protected $group = 'Tracking';
    protected $name = 'tracking:repair-activity';
    protected $description = 'Trim or delete activity logs recorded outside their time entry window';
    protected $usage = 'tracking:repair-activity [--apply] [--trim-entries] [--user=ID] [--since=YYYY-MM-DD]';

    public function run(array $params)
    {
        $apply = in_array('--apply', $params, true) || (bool) CLI::getOption('apply');
        $trimEntries = in_array('--trim-entries', $params, true) || (bool) CLI::getOption('trim-entries');
        $userId = (int) (CLI::getOption('user') ?? 0);
        $since = (string) (CLI::getOption('since') ?? '');

        $db = \Config\Database::connect();

        $builder = $db->table('activity_logs al')
            ->select('al.id, al.time_entry_id, al.user_id, al.logged_at, al.duration_seconds,'
                . ' te.started_at, te.ended_at, te.paused_at')
            ->join('time_entries te', 'te.id = al.time_entry_id');

        if ($userId > 0) {
            $builder->where('al.user_id', $userId);
        }
        if ($since !== '') {
            $builder->where('al.logged_at >=', $since . ' 00:00:00');
        }

        $rows = $builder->orderBy('al.id', 'ASC')->get()->getResultArray();

        CLI::write(sprintf('Scanning %d activity log(s)%s', count($rows), $apply ? '' : ' (dry run)'), 'yellow');

        $toDelete = [];
        $toTrim = [];
        $toReassign = [];
        $secondsRemoved = 0;
        $affectedEntries = [];

        foreach ($rows as $row) {
            $started = strtotime((string) $row['started_at']);
            if (!$started) {
                continue;
            }

            $end = !empty($row['ended_at'])
                ? strtotime((string) $row['ended_at'])
                : (!empty($row['paused_at']) ? strtotime((string) $row['paused_at']) : time());

            $windowStart = $started - self::GRACE_SECONDS;
            $windowEnd = ($end ?: time()) + self::GRACE_SECONDS;

            $segmentStart = strtotime((string) $row['logged_at']);
            $duration = max(0, (int) $row['duration_seconds']);
            $segmentEnd = $segmentStart + $duration;

            $clampedStart = max($segmentStart, $windowStart);
            $clampedEnd = min($segmentEnd, $windowEnd);
            $clamped = $clampedEnd - $clampedStart;

            if ($clamped >= $duration) {
                continue;
            }

            $affectedEntries[(int) $row['time_entry_id']] = true;

            // A midnight split hands the session to a fresh entry — those segments are real
            // work that simply points at the previous half of the session.
            $owner = $this->findOwningEntry($db, (int) $row['user_id'], (int) $row['time_entry_id'], $segmentStart);
            if ($owner !== null) {
                $toReassign[] = ['id' => (int) $row['id'], 'time_entry_id' => $owner];
                continue;
            }

            if ($clamped <= 0) {
                $toDelete[] = (int) $row['id'];
                $secondsRemoved += $duration;
                continue;
            }

            $toTrim[] = [
                'id' => (int) $row['id'],
                'logged_at' => date('Y-m-d H:i:s', $clampedStart),
                'duration_seconds' => $clamped,
            ];
            $secondsRemoved += $duration - $clamped;
        }

        CLI::write('');
        CLI::write(sprintf('Entries affected:   %d', count($affectedEntries)));
        CLI::write(sprintf('Logs to reassign:   %d', count($toReassign)));
        CLI::write(sprintf('Logs to delete:     %d', count($toDelete)));
        CLI::write(sprintf('Logs to trim:       %d', count($toTrim)));
        CLI::write(sprintf(
            'Phantom activity:   %02d:%02d:%02d',
            intdiv($secondsRemoved, 3600),
            intdiv($secondsRemoved % 3600, 60),
            $secondsRemoved % 60
        ), 'green');

        $entryFixes = $trimEntries ? $this->planEntryTrims($db, $userId, $since) : [];
        if ($trimEntries) {
            $this->reportEntryTrims($entryFixes);
        } else {
            $this->reportSuspiciousEntries($db, $userId);
        }

        if (!$apply) {
            CLI::write('');
            CLI::write('Nothing changed. Re-run with --apply to write these fixes.', 'yellow');

            return;
        }

        foreach ($toReassign as $update) {
            $db->table('activity_logs')->where('id', $update['id'])->update([
                'time_entry_id' => $update['time_entry_id'],
            ]);
        }

        foreach (array_chunk($toDelete, 500) as $chunk) {
            $db->table('activity_logs')->whereIn('id', $chunk)->delete();
        }

        foreach ($toTrim as $update) {
            $db->table('activity_logs')->where('id', $update['id'])->update([
                'logged_at' => $update['logged_at'],
                'duration_seconds' => $update['duration_seconds'],
            ]);
        }

        foreach ($entryFixes as $fix) {
            $db->table('time_entries')->where('id', $fix['id'])->update([
                'ended_at' => $fix['ended_at'],
                'duration_seconds' => $fix['duration_seconds'],
            ]);
        }

        CLI::write('Repair applied.', 'green');
    }

    /**
     * Historic version of the live integrity rule: cut the tail of finished entries that
     * nothing was reporting during, so old phantom hours match what the tracker now records.
     *
     * @return list<array{id:int,user_id:int,started_at:string,old_seconds:int,action:string,ended_at:?string,duration_seconds:int,tail:int}>
     */
    private function planEntryTrims(\CodeIgniter\Database\BaseConnection $db, int $userId, string $since): array
    {
        $builder = $db->table('time_entries te')
            ->select('te.id, te.user_id, te.organization_id, te.started_at, te.ended_at,'
                . ' te.duration_seconds, te.paused_duration_seconds, te.is_manual')
            ->where('te.ended_at IS NOT NULL', null, false)
            ->where('te.is_manual', 0)
            ->where('te.duration_seconds >', 0);

        if ($userId > 0) {
            $builder->where('te.user_id', $userId);
        }
        if ($since !== '') {
            $builder->where('te.started_at >=', $since . ' 00:00:00');
        }

        $settings = new \App\Services\OrganizationSettingsService();
        $timeEntryService = new \App\Services\TimeEntryService();
        $configCache = [];
        $fixes = [];

        foreach ($builder->get()->getResultArray() as $entry) {
            $orgId = (int) $entry['organization_id'];
            if (!isset($configCache[$orgId])) {
                try {
                    $configCache[$orgId] = $settings->getEffectiveTrackingConfig($orgId);
                } catch (\Throwable $e) {
                    $configCache[$orgId] = [];
                }
            }
            $tracking = $configCache[$orgId];

            // Only orgs that collect evidence can be judged on missing evidence.
            if (empty($tracking['activity_tracking_enabled']) && empty($tracking['screenshot_enabled'])) {
                continue;
            }

            $started = strtotime((string) $entry['started_at']);
            $ended = strtotime((string) $entry['ended_at']);
            if (!$started || !$ended) {
                continue;
            }

            $counted = (int) $entry['duration_seconds'];
            $paused = (int) $entry['paused_duration_seconds'];
            $idleGrace = max(300, (int) ($tracking['idle_timeout_minutes'] ?? 5) * 60);
            $lastEvidence = $timeEntryService->lastEvidenceTimestamp((int) $entry['id']);

            if ($lastEvidence === null) {
                if ($counted < self::MIN_TRIM_SECONDS) {
                    continue;
                }
                $fixes[] = [
                    'id' => (int) $entry['id'],
                    'user_id' => (int) $entry['user_id'],
                    'started_at' => (string) $entry['started_at'],
                    'old_seconds' => $counted,
                    'action' => 'zero',
                    'ended_at' => (string) $entry['started_at'],
                    'duration_seconds' => 0,
                ];
                continue;
            }

            $verifiedSpan = ($lastEvidence + $idleGrace) - $started;
            if ($verifiedSpan <= 0) {
                continue;
            }

            // Pause timestamps are not kept, so assume the pauses happened inside the verified
            // window; when that leaves nothing the pauses clearly came after it, and the entry
            // is already consistent with its evidence.
            $candidate = $verifiedSpan - $paused;
            if ($candidate <= 0) {
                $candidate = min($counted, $verifiedSpan);
            }

            $newDuration = min($counted, $candidate);
            if ($counted - $newDuration < self::MIN_TRIM_SECONDS) {
                continue;
            }

            $fixes[] = [
                'id' => (int) $entry['id'],
                'user_id' => (int) $entry['user_id'],
                'started_at' => (string) $entry['started_at'],
                'old_seconds' => $counted,
                'action' => 'trim',
                'ended_at' => gmdate('Y-m-d H:i:s', $started + $paused + $newDuration),
                'duration_seconds' => $newDuration,
            ];
        }

        return $fixes;
    }

    private function reportEntryTrims(array $fixes): void
    {
        CLI::write('');
        if ($fixes === []) {
            CLI::write('No finished entry has unverified time left on it.', 'green');

            return;
        }

        $reclaimed = 0;
        CLI::write('Entries with time nothing was reporting during:', 'yellow');
        foreach ($fixes as $fix) {
            $reclaimed += $fix['old_seconds'] - $fix['duration_seconds'];
            CLI::write(sprintf(
                '  #%-6s user=%-4s %s  %s → %s  (%s)',
                $fix['id'],
                $fix['user_id'],
                $fix['started_at'],
                $this->hms($fix['old_seconds']),
                $this->hms($fix['duration_seconds']),
                $fix['action'] === 'zero' ? 'no activity or screenshot at all' : 'trim to last activity'
            ));
        }
        CLI::write(sprintf('Unverified time removed: %s', $this->hms($reclaimed)), 'green');
    }

    private function hms(int $seconds): string
    {
        return sprintf('%02d:%02d:%02d', intdiv($seconds, 3600), intdiv($seconds % 3600, 60), $seconds % 60);
    }

    /**
     * Another entry of the same user that was actually running when the segment was recorded.
     */
    private function findOwningEntry(
        \CodeIgniter\Database\BaseConnection $db,
        int $userId,
        int $currentEntryId,
        int $segmentStart
    ): ?int {
        $at = date('Y-m-d H:i:s', $segmentStart);

        $row = $db->table('time_entries')
            ->select('id')
            ->where('user_id', $userId)
            ->where('id !=', $currentEntryId)
            ->where('started_at <=', $at)
            ->groupStart()
                ->where('ended_at >=', $at)
                ->orWhere('ended_at IS NULL', null, false)
            ->groupEnd()
            ->orderBy('started_at', 'DESC')
            ->limit(1)
            ->get()
            ->getRowArray();

        return $row ? (int) $row['id'] : null;
    }

    /**
     * Long entries with no recorded activity — usually a timer left running on a sleeping machine.
     */
    private function reportSuspiciousEntries(\CodeIgniter\Database\BaseConnection $db, int $userId): void
    {
        $builder = $db->table('time_entries te')
            ->select('te.id, te.user_id, te.started_at, te.ended_at, te.duration_seconds,'
                . ' COUNT(al.id) AS log_rows')
            ->join('activity_logs al', 'al.time_entry_id = te.id', 'left')
            ->where('te.duration_seconds >', 6 * 3600)
            ->groupBy('te.id')
            ->having('log_rows', 0)
            ->orderBy('te.duration_seconds', 'DESC')
            ->limit(20);

        if ($userId > 0) {
            $builder->where('te.user_id', $userId);
        }

        $rows = $builder->get()->getResultArray();
        if ($rows === []) {
            return;
        }

        CLI::write('');
        CLI::write('Review these entries — over 6h logged with zero recorded activity:', 'yellow');
        foreach ($rows as $row) {
            CLI::write(sprintf(
                '  entry #%-6s user=%-4s %s → %s  %s',
                $row['id'],
                $row['user_id'],
                $row['started_at'],
                $row['ended_at'] ?? 'OPEN',
                sprintf(
                    '%02d:%02d:%02d',
                    intdiv((int) $row['duration_seconds'], 3600),
                    intdiv((int) $row['duration_seconds'] % 3600, 60),
                    (int) $row['duration_seconds'] % 60
                )
            ));
        }
    }
}
