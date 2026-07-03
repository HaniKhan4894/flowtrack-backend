<?php

namespace App\Services;

use App\Models\ProjectModel;

/**
 * Phase 2 — AI auto-categorization.
 *
 * Looks at a user's raw activity for a given day (apps, window titles, URLs,
 * plus optional GitHub commits) and asks the LLM to propose structured time
 * entries mapped to the organization's real projects. The result is advisory:
 * the user reviews and one-click adds any suggestion as a manual time entry.
 */
class AiCategorizationService
{
    protected AiService $ai;
    protected TimezoneService $tz;
    protected GitHubService $github;
    protected $db;

    public function __construct()
    {
        $this->ai = new AiService();
        $this->tz = new TimezoneService();
        $this->github = new GitHubService();
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
}
