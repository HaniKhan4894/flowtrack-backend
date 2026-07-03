<?php

namespace App\Services;

use App\Models\ProjectModel;
use App\Models\AutopilotSuggestionModel;

/**
 * Phase 2 — AI auto-categorization.
 *
 * Looks at a user's raw activity for a given day (apps, window titles, URLs,
 * plus optional GitHub commits) and asks the LLM to propose structured time
 * entries mapped to the organization's real projects. The result is advisory:
 * the user reviews and one-click adds any suggestion as a manual time entry.
 *
 * Phase 7 — AI Autopilot timesheets.
 *
 * Extends the categorizer into a full-day reconstructor: it fuses activity,
 * GitHub commits/PRs and Jira issues into a sequenced set of time BLOCKS (with
 * start/end times) that pre-draft the whole day. The user reviews and applies
 * the whole timesheet in one tap.
 */
class AiCategorizationService
{
    protected AiService $ai;
    protected TimezoneService $tz;
    protected GitHubService $github;
    protected JiraService $jira;
    protected AutopilotSuggestionModel $autopilot;
    protected $db;

    public function __construct()
    {
        $this->ai = new AiService();
        $this->tz = new TimezoneService();
        $this->github = new GitHubService();
        $this->jira = new JiraService();
        $this->autopilot = new AutopilotSuggestionModel();
        $this->db = \Config\Database::connect();
    }

    /**
     * @return array{date:string, suggestions:array<int,array>, based_on:array, model:string, source:string}
     */
    public function suggest(int $organizationId, int $userId, string $date): array
    {
        $status = $this->ai->statusFor($organizationId);
        if (!$status['enabled']) {
            throw new \RuntimeException('AI features are not configured. Add your OpenAI API key in Settings → Integrations.');
        }

        [$startUtc, $endUtc] = $this->tz->dateRangeUtc($date, $date, $this->tz->getOrgTimezone($organizationId));

        $activity = $this->activityClusters($organizationId, $userId, $startUtc, $endUtc);
        $existing = $this->existingEntries($organizationId, $userId, $startUtc, $endUtc);
        $projects = $this->projectCatalog($organizationId);
        $commits  = $this->commitHints($organizationId);

        if (empty($activity) && empty($commits)) {
            return [
                'date'        => $date,
                'suggestions' => [],
                'based_on'    => ['activity_clusters' => 0, 'commits' => 0, 'projects' => count($projects)],
                'model'       => $status['model'],
                'source'      => $status['source'],
                'message'     => 'No tracked activity found for this day to categorize.',
            ];
        }

        $payload = [
            'date'             => $date,
            'projects'         => $projects,
            'activity'         => $activity,
            'already_logged'   => $existing,
            'github_commits'   => $commits,
        ];

        $system = <<<SYS
You are FlowTrack's time-categorization assistant. Given a user's raw computer
activity for one day (apps, window/tab titles, URLs, durations) plus optional
GitHub commits and the organization's list of projects, propose a small set of
time entries that best describe the work.

Rules:
- Map each suggestion to the MOST likely project from the provided "projects"
  list using its id. If nothing fits, use null for project_id.
- Merge related activity into meaningful blocks; do NOT emit one entry per app.
- Prefer at most 6 suggestions, largest blocks first.
- duration_minutes must be a positive integer grounded in the provided
  durations; never inflate beyond the observed total.
- confidence is a number between 0 and 1.
- description is a short human phrase (max ~12 words) of what was worked on.
- Account for time already in "already_logged"; only suggest for work that is
  not clearly captured there.
- Use GitHub commit messages to sharpen descriptions and project matching.

Respond with STRICT JSON only, no prose, in this exact shape:
{"suggestions":[{"project_id":<int|null>,"project_name":<string|null>,"description":<string>,"duration_minutes":<int>,"confidence":<number>,"rationale":<string>}]}
SYS;

        $raw = $this->ai->chatForOrg($organizationId, [
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => json_encode($payload, JSON_UNESCAPED_SLASHES)],
        ], ['temperature' => 0.2, 'max_tokens' => 900]);

        $suggestions = $this->normalizeSuggestions($this->decodeJson($raw), $projects);

        return [
            'date'        => $date,
            'suggestions' => $suggestions,
            'based_on'    => [
                'activity_clusters' => count($activity),
                'commits'           => count($commits),
                'projects'          => count($projects),
            ],
            'model'  => $status['model'],
            'source' => $status['source'],
        ];
    }

    /**
     * Top activity clusters (apps + browser tabs) for the day, org-scoped.
     *
     * @return array<int, array{label:string, app:string, category:string, minutes:int}>
     */
    private function activityClusters(int $organizationId, int $userId, string $startUtc, string $endUtc): array
    {
        $rows = $this->db->table('activity_logs a')
            ->select('a.app_name, a.window_title, a.url, a.category, SUM(CASE WHEN a.duration_seconds > 0 THEN a.duration_seconds ELSE 60 END) as secs')
            ->join('time_entries t', 't.id = a.time_entry_id')
            ->where('a.user_id', $userId)
            ->where('t.organization_id', $organizationId)
            ->where('a.logged_at >=', $startUtc)
            ->where('a.logged_at <=', $endUtc)
            ->groupBy('a.app_name, a.window_title, a.url, a.category')
            ->orderBy('secs', 'DESC')
            ->limit(40)
            ->get()
            ->getResultArray();

        $out = [];
        foreach ($rows as $row) {
            $minutes = (int) round(((int) $row['secs']) / 60);
            if ($minutes < 1) {
                continue;
            }
            $label = trim((string) ($row['window_title'] ?? ''));
            if ($label === '') {
                $label = (string) ($row['app_name'] ?? 'Unknown');
            }
            $out[] = [
                'label'    => mb_substr($label, 0, 120),
                'app'      => (string) ($row['app_name'] ?? ''),
                'category' => (string) ($row['category'] ?? 'uncategorized'),
                'minutes'  => $minutes,
            ];
        }
        return array_slice($out, 0, 25);
    }

    /**
     * @return array<int, array{project:?string, description:?string, minutes:int}>
     */
    private function existingEntries(int $organizationId, int $userId, string $startUtc, string $endUtc): array
    {
        $rows = $this->db->table('time_entries t')
            ->select('p.name as project_name, t.description, t.duration_seconds')
            ->join('projects p', 'p.id = t.project_id', 'left')
            ->where('t.organization_id', $organizationId)
            ->where('t.user_id', $userId)
            ->where('t.started_at >=', $startUtc)
            ->where('t.started_at <=', $endUtc)
            ->get()
            ->getResultArray();

        return array_map(fn ($r) => [
            'project'     => $r['project_name'] ?? null,
            'description' => $r['description'] ?? null,
            'minutes'     => (int) round(((int) $r['duration_seconds']) / 60),
        ], $rows);
    }

    /**
     * @return array<int, array{id:int, name:string, description:?string}>
     */
    private function projectCatalog(int $organizationId): array
    {
        $rows = (new ProjectModel())
            ->where('organization_id', $organizationId)
            ->where('is_active', true)
            ->orderBy('name', 'ASC')
            ->findAll(50);

        return array_map(fn ($p) => [
            'id'          => (int) $p['id'],
            'name'        => (string) $p['name'],
            'description' => $p['description'] ? mb_substr((string) $p['description'], 0, 160) : null,
        ], $rows);
    }

    /**
     * GitHub commit messages for the recent window as extra grounding (best-effort).
     *
     * @return array<int, array{repo:string, message:string}>
     */
    private function commitHints(int $organizationId): array
    {
        try {
            if (!$this->github->isConnected($organizationId)) {
                return [];
            }
            $activity = $this->github->recentActivity($organizationId, 2);
            return array_map(fn ($c) => [
                'repo'    => $c['repo'],
                'message' => $c['message'],
            ], array_slice($activity['commits'], 0, 15));
        } catch (\Throwable $e) {
            return [];
        }
    }

    /**
     * @param array<string,mixed>|null $decoded
     * @param array<int, array{id:int, name:string}> $projects
     * @return array<int, array>
     */
    private function normalizeSuggestions(?array $decoded, array $projects): array
    {
        $items = $decoded['suggestions'] ?? [];
        if (!is_array($items)) {
            return [];
        }

        $names = [];
        foreach ($projects as $p) {
            $names[(int) $p['id']] = $p['name'];
        }

        $out = [];
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $minutes = (int) round((float) ($item['duration_minutes'] ?? 0));
            if ($minutes < 1) {
                continue;
            }
            $projectId = isset($item['project_id']) && $item['project_id'] !== null ? (int) $item['project_id'] : null;
            if ($projectId !== null && !isset($names[$projectId])) {
                $projectId = null; // hallucinated id → drop the mapping
            }
            $confidence = (float) ($item['confidence'] ?? 0);
            $confidence = max(0, min(1, $confidence));

            $out[] = [
                'project_id'       => $projectId,
                'project_name'     => $projectId !== null ? $names[$projectId] : ($item['project_name'] ?? null),
                'description'      => trim((string) ($item['description'] ?? '')) ?: 'Focused work',
                'duration_minutes' => $minutes,
                'confidence'       => round($confidence, 2),
                'rationale'        => isset($item['rationale']) ? (string) $item['rationale'] : '',
            ];
            if (count($out) >= 6) {
                break;
            }
        }
        return $out;
    }

    private function decodeJson(string $raw): ?array
    {
        $raw = trim($raw);
        // Strip markdown code fences if the model wrapped the JSON.
        $raw = preg_replace('/^```(?:json)?\s*|\s*```$/i', '', $raw);
        $start = strpos($raw, '{');
        $end = strrpos($raw, '}');
        if ($start !== false && $end !== false && $end >= $start) {
            $raw = substr($raw, $start, $end - $start + 1);
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    // ---------------------------------------------------------------------
    // Phase 7 — AI Autopilot: reconstruct a full day of time blocks.
    // ---------------------------------------------------------------------

    /**
     * Reconstruct a full draft timesheet for one day from every available
     * signal (activity, GitHub, Jira). Returns time-sequenced blocks the user
     * can review and apply in bulk. Each block is persisted so we can track
     * acceptance and avoid regenerating blindly.
     *
     * @return array{date:string, blocks:array<int,array>, based_on:array, model:string, source:string, message?:string}
     */
    public function autopilot(int $organizationId, int $userId, string $date): array
    {
        $status = $this->ai->statusFor($organizationId);
        if (!$status['enabled']) {
            throw new \RuntimeException('AI features are not configured. Add your OpenAI API key in Settings → Integrations.');
        }

        $phpTz = $this->tz->getOrgTimezone($organizationId);
        [$startUtc, $endUtc] = $this->tz->dateRangeUtc($date, $date, $phpTz);

        $activity = $this->activityClusters($organizationId, $userId, $startUtc, $endUtc);
        $existing = $this->existingEntries($organizationId, $userId, $startUtc, $endUtc);
        $projects = $this->projectCatalog($organizationId);
        $commits  = $this->commitHints($organizationId);
        $issues   = $this->jiraHints($organizationId);
        $bounds   = $this->dayBounds($organizationId, $userId, $startUtc, $endUtc, $phpTz);

        if (empty($activity) && empty($commits) && empty($issues)) {
            return [
                'date'     => $date,
                'blocks'   => [],
                'based_on' => ['activity_clusters' => 0, 'commits' => 0, 'jira_issues' => 0, 'projects' => count($projects)],
                'model'    => $status['model'],
                'source'   => $status['source'],
                'message'  => 'No tracked activity, commits or issues found for this day to reconstruct.',
            ];
        }

        $payload = [
            'date'           => $date,
            'day_bounds'     => $bounds,
            'projects'       => $projects,
            'activity'       => $activity,
            'already_logged' => $existing,
            'github_commits' => $commits,
            'jira_issues'    => $issues,
        ];

        $system = <<<SYS
You are FlowTrack Autopilot. Reconstruct a person's WHOLE working day as a
sequence of non-overlapping time blocks, using the provided signals (computer
activity with per-item minutes, GitHub commits, Jira issues, and the list of
projects).

Rules:
- Lay blocks out in chronological order between day_bounds.start and
  day_bounds.end (24h local "HH:MM"). If bounds are missing, assume a normal
  workday starting 09:00.
- Each block: start_time and end_time as "HH:MM" (local, 24h). Blocks must NOT
  overlap and end_time must be after start_time.
- Total scheduled minutes must stay close to the observed activity minutes; do
  NOT invent large amounts of time.
- Map each block to the MOST likely project id from "projects"; use null if
  nothing fits.
- Do NOT re-create work already present in "already_logged".
- description: short human phrase (max ~12 words).
- confidence: number 0..1. sources: array of short tags like "commit",
  "activity", "jira".
- Prefer 3-8 meaningful blocks; merge tiny fragments.

Respond with STRICT JSON only, no prose, exactly:
{"blocks":[{"start_time":"HH:MM","end_time":"HH:MM","project_id":<int|null>,"project_name":<string|null>,"description":<string>,"confidence":<number>,"sources":[<string>]}]}
SYS;

        $raw = $this->ai->chatForOrg($organizationId, [
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => json_encode($payload, JSON_UNESCAPED_SLASHES)],
        ], ['temperature' => 0.2, 'max_tokens' => 1200]);

        $blocks = $this->normalizeBlocks($this->decodeJson($raw), $projects, $date, $phpTz);
        $blocks = $this->persistBlocks($organizationId, $userId, $date, $blocks);

        return [
            'date'     => $date,
            'blocks'   => $blocks,
            'based_on' => [
                'activity_clusters' => count($activity),
                'commits'           => count($commits),
                'jira_issues'       => count($issues),
                'projects'          => count($projects),
            ],
            'model'  => $status['model'],
            'source' => $status['source'],
        ];
    }

    /**
     * Bulk-create time entries from accepted autopilot blocks. Each entry flows
     * through TimeEntryService so it is ledgered like any other manual entry.
     *
     * @param array<int, array{suggestion_id?:int, project_id?:int|null, description?:string, started_at:string, ended_at:string, is_billable?:bool}> $entries
     * @return array{created:int, entries:array<int,array>}
     */
    public function applyAutopilot(int $organizationId, int $userId, array $entries): array
    {
        $timeEntries = new TimeEntryService();
        $created = [];

        foreach ($entries as $e) {
            $startedAt = (string) ($e['started_at'] ?? '');
            $endedAt   = (string) ($e['ended_at'] ?? '');
            if ($startedAt === '' || $endedAt === '' || strtotime($endedAt) <= strtotime($startedAt)) {
                continue;
            }

            $projectId = isset($e['project_id']) && $e['project_id'] !== null && $e['project_id'] !== ''
                ? (int) $e['project_id'] : null;

            $entry = $timeEntries->createManualEntry($userId, $organizationId, [
                'project_id'  => $projectId,
                'description' => mb_substr((string) ($e['description'] ?? 'Focused work'), 0, 500),
                'started_at'  => $startedAt,
                'ended_at'    => $endedAt,
                'is_billable' => $e['is_billable'] ?? true,
            ]);

            $created[] = $entry;

            $suggestionId = (int) ($e['suggestion_id'] ?? 0);
            if ($suggestionId > 0) {
                $row = $this->autopilot->find($suggestionId);
                if ($row && (int) $row['organization_id'] === $organizationId && (int) $row['user_id'] === $userId) {
                    $this->autopilot->update($suggestionId, [
                        'status'           => 'applied',
                        'applied_entry_id' => $entry['id'] ?? null,
                    ]);
                }
            }
        }

        return ['created' => count($created), 'entries' => $created];
    }

    /**
     * First/last activity time of the day, in local HH:MM, to anchor the layout.
     *
     * @return array{start:?string, end:?string}
     */
    private function dayBounds(int $organizationId, int $userId, string $startUtc, string $endUtc, string $phpTz): array
    {
        $row = $this->db->table('activity_logs a')
            ->select('MIN(a.logged_at) as first_at, MAX(a.logged_at) as last_at')
            ->join('time_entries t', 't.id = a.time_entry_id')
            ->where('a.user_id', $userId)
            ->where('t.organization_id', $organizationId)
            ->where('a.logged_at >=', $startUtc)
            ->where('a.logged_at <=', $endUtc)
            ->get()
            ->getRowArray();

        $first = $row['first_at'] ?? null;
        $last  = $row['last_at'] ?? null;

        return [
            'start' => $first ? substr((string) $this->tz->toOrgLocal($first, $phpTz), 11, 5) : null,
            'end'   => $last ? substr((string) $this->tz->toOrgLocal($last, $phpTz), 11, 5) : null,
        ];
    }

    /**
     * Recent Jira issues as grounding (best-effort).
     *
     * @return array<int, array{key:string, summary:string, project:string}>
     */
    private function jiraHints(int $organizationId): array
    {
        try {
            if (!$this->jira->isConnected($organizationId)) {
                return [];
            }
            return array_map(fn ($i) => [
                'key'     => $i['key'],
                'summary' => $i['summary'],
                'project' => $i['project'],
            ], array_slice($this->jira->recentIssues($organizationId, 15), 0, 15));
        } catch (\Throwable $e) {
            return [];
        }
    }

    /**
     * @param array<string,mixed>|null $decoded
     * @param array<int, array{id:int, name:string}> $projects
     * @return array<int, array>
     */
    private function normalizeBlocks(?array $decoded, array $projects, string $date, string $phpTz): array
    {
        $items = $decoded['blocks'] ?? [];
        if (!is_array($items)) {
            return [];
        }

        $names = [];
        foreach ($projects as $p) {
            $names[(int) $p['id']] = $p['name'];
        }

        $out = [];
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $start = $this->normalizeClock($item['start_time'] ?? null);
            $end   = $this->normalizeClock($item['end_time'] ?? null);
            if ($start === null || $end === null || $end <= $start) {
                continue;
            }

            $startLocal = $date . ' ' . $start . ':00';
            $endLocal   = $date . ' ' . $end . ':00';
            $startedAtUtc = $this->tz->toUtc($startLocal, $phpTz);
            $endedAtUtc   = $this->tz->toUtc($endLocal, $phpTz);
            $minutes = (int) round((strtotime($endLocal) - strtotime($startLocal)) / 60);
            if ($minutes < 1) {
                continue;
            }

            $projectId = isset($item['project_id']) && $item['project_id'] !== null ? (int) $item['project_id'] : null;
            if ($projectId !== null && !isset($names[$projectId])) {
                $projectId = null;
            }
            $confidence = max(0, min(1, (float) ($item['confidence'] ?? 0)));
            $sources = [];
            if (isset($item['sources']) && is_array($item['sources'])) {
                foreach ($item['sources'] as $s) {
                    $sources[] = mb_substr((string) $s, 0, 24);
                }
            }

            $out[] = [
                'start_time'       => $start,
                'end_time'         => $end,
                'started_at'       => $startedAtUtc,
                'ended_at'         => $endedAtUtc,
                'duration_minutes' => $minutes,
                'project_id'       => $projectId,
                'project_name'     => $projectId !== null ? $names[$projectId] : ($item['project_name'] ?? null),
                'description'      => trim((string) ($item['description'] ?? '')) ?: 'Focused work',
                'confidence'       => round($confidence, 2),
                'sources'          => array_slice($sources, 0, 5),
            ];
            if (count($out) >= 10) {
                break;
            }
        }

        // Keep chronological order.
        usort($out, fn ($a, $b) => strcmp($a['start_time'], $b['start_time']));
        return $out;
    }

    /**
     * Persist generated blocks (replacing any prior "suggested" rows for the
     * day) and attach their DB ids so the client can report acceptance.
     *
     * @param array<int,array> $blocks
     * @return array<int,array>
     */
    private function persistBlocks(int $organizationId, int $userId, string $date, array $blocks): array
    {
        // Clear stale, un-applied suggestions for this day.
        $this->autopilot
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->where('work_date', $date)
            ->where('status', 'suggested')
            ->delete();

        foreach ($blocks as $i => $block) {
            $id = $this->autopilot->insert([
                'organization_id' => $organizationId,
                'user_id'         => $userId,
                'work_date'       => $date,
                'project_id'      => $block['project_id'],
                'description'     => $block['description'],
                'started_at'      => $block['started_at'],
                'ended_at'        => $block['ended_at'],
                'duration_minutes' => $block['duration_minutes'],
                'confidence'      => $block['confidence'],
                'sources'         => json_encode($block['sources']),
                'status'          => 'suggested',
            ]);
            $blocks[$i]['id'] = (int) $id;
        }

        return $blocks;
    }

    private function normalizeClock($value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        if (!preg_match('/^(\d{1,2}):(\d{2})/', trim($value), $m)) {
            return null;
        }
        $h = max(0, min(23, (int) $m[1]));
        $min = max(0, min(59, (int) $m[2]));
        return sprintf('%02d:%02d', $h, $min);
    }
}
