<?php

namespace App\Services;

/**
 * Phase 9 — Work Integrity engine.
 *
 * Inspects the raw activity captured against a time entry to estimate how
 * genuine the tracked work is. It flags patterns typical of automated input
 * (mouse jigglers, key repeaters) and of unattended tracking (no input, poor
 * coverage). The output is a 0-100 integrity score plus human-readable flags
 * that back the "Verified Work" badge and feed the proof-of-work certificate.
 *
 * This is heuristic and privacy-preserving: it only uses aggregate input
 * counters (keystrokes / clicks / mouse movement) already collected for
 * productivity, never keystroke content.
 */
class WorkIntegrityService
{
    protected $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    /**
     * Integrity score for a single time entry.
     *
     * @return array{score:float, grade:string, flags:array<int,string>, metrics:array<string,mixed>}
     */
    public function scoreForEntry(int $entryId): array
    {
        $entry = $this->db->table('time_entries')
            ->select('id, duration_seconds')
            ->where('id', $entryId)
            ->get()
            ->getRowArray();

        if (!$entry) {
            return $this->result(0, ['missing_entry'], []);
        }

        $duration = (int) ($entry['duration_seconds'] ?? 0);

        $rows = $this->db->table('activity_logs')
            ->select('duration_seconds, keyboard_strokes, mouse_clicks, mouse_movement')
            ->where('time_entry_id', $entryId)
            ->get()
            ->getResultArray();

        return $this->evaluate($duration, $rows);
    }

    /**
     * Aggregate integrity across a set of entries (e.g. for an invoice).
     *
     * @param array<int,int> $entryIds
     * @return array{score:float, grade:string, flags:array<int,string>, entries:int}
     */
    public function scoreForEntries(array $entryIds): array
    {
        $entryIds = array_values(array_filter(array_map('intval', $entryIds)));
        if ($entryIds === []) {
            return ['score' => 0.0, 'grade' => $this->grade(0), 'flags' => [], 'entries' => 0];
        }

        $sum = 0.0;
        $flagCounts = [];
        foreach ($entryIds as $id) {
            $r = $this->scoreForEntry($id);
            $sum += $r['score'];
            foreach ($r['flags'] as $f) {
                $flagCounts[$f] = ($flagCounts[$f] ?? 0) + 1;
            }
        }

        arsort($flagCounts);
        $avg = round($sum / count($entryIds), 1);

        return [
            'score'   => $avg,
            'grade'   => $this->grade($avg),
            'flags'   => array_keys(array_slice($flagCounts, 0, 5, true)),
            'entries' => count($entryIds),
        ];
    }

    /**
     * Core heuristic scoring from aggregate input counters.
     *
     * @param array<int,array<string,mixed>> $rows
     * @return array{score:float, grade:string, flags:array<int,string>, metrics:array<string,mixed>}
     */
    private function evaluate(int $durationSeconds, array $rows): array
    {
        $samples = count($rows);
        $activitySeconds = 0;
        $keys = 0;
        $clicks = 0;
        $movement = 0;
        $movementValues = [];
        $silentSamples = 0; // samples with no keys and no clicks

        foreach ($rows as $r) {
            $activitySeconds += (int) ($r['duration_seconds'] ?? 0);
            $k = (int) ($r['keyboard_strokes'] ?? 0);
            $c = (int) ($r['mouse_clicks'] ?? 0);
            $m = (int) ($r['mouse_movement'] ?? 0);
            $keys += $k;
            $clicks += $c;
            $movement += $m;
            if ($m > 0) {
                $movementValues[] = $m;
            }
            if ($k === 0 && $c === 0) {
                $silentSamples++;
            }
        }

        // No activity captured at all → can't verify (neutral-low).
        if ($samples === 0 || $activitySeconds === 0) {
            $score = $durationSeconds > 0 ? 55.0 : 0.0;
            $flags = $durationSeconds > 0 ? ['no_activity_captured'] : [];
            return $this->result($score, $flags, [
                'samples' => $samples,
                'activity_seconds' => $activitySeconds,
                'coverage' => 0,
            ]);
        }

        $flags = [];
        $score = 100.0;

        // 1) Coverage: how much of the entry has captured activity.
        $coverage = $durationSeconds > 0 ? min(1.0, $activitySeconds / $durationSeconds) : 1.0;
        if ($coverage < 0.4) {
            $score -= 25;
            $flags[] = 'low_activity_coverage';
        } elseif ($coverage < 0.7) {
            $score -= 10;
        }

        // 2) Silent samples: activity with no keyboard AND no clicks.
        $silentRatio = $samples > 0 ? $silentSamples / $samples : 0;
        if ($silentRatio >= 0.8 && $samples >= 3) {
            $score -= 20;
            $flags[] = 'mostly_no_input';
        }

        // 3) Synthetic mouse: movement present, but essentially no keys/clicks.
        if ($movement > 0 && $keys === 0 && $clicks === 0 && $samples >= 3) {
            $score -= 25;
            $flags[] = 'synthetic_mouse_only';
        }

        // 4) Uniform / repeating movement (classic mouse-jiggler signature).
        if (count($movementValues) >= 4) {
            $unique = count(array_unique($movementValues));
            $uniformity = 1 - ($unique / count($movementValues));
            if ($uniformity >= 0.7 && $keys === 0) {
                $score -= 20;
                $flags[] = 'uniform_input_pattern';
            }
        }

        // 5) Implausible input rate (key/click flooding) — very high per second.
        $inputPerMin = $activitySeconds > 0 ? (($keys + $clicks) / ($activitySeconds / 60)) : 0;
        if ($inputPerMin > 1500) {
            $score -= 15;
            $flags[] = 'implausible_input_rate';
        }

        $score = max(0, min(100, round($score, 1)));

        return $this->result($score, $flags, [
            'samples'          => $samples,
            'activity_seconds' => $activitySeconds,
            'coverage'         => round($coverage, 2),
            'keys'             => $keys,
            'clicks'           => $clicks,
            'movement'         => $movement,
        ]);
    }

    /**
     * @param array<int,string> $flags
     * @param array<string,mixed> $metrics
     */
    private function result(float $score, array $flags, array $metrics): array
    {
        return [
            'score'   => $score,
            'grade'   => $this->grade($score),
            'flags'   => array_values(array_unique($flags)),
            'metrics' => $metrics,
        ];
    }

    private function grade(float $score): string
    {
        if ($score >= 90) return 'verified';
        if ($score >= 75) return 'trusted';
        if ($score >= 55) return 'review';
        return 'flagged';
    }
}
