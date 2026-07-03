<?php

namespace App\Services;

/**
 * Phase 3 — AI daily standup / work summaries per member.
 *
 * Turns a member's tracked time + activity for a day into a concise,
 * human-readable standup ("done / focus / blockers"), grounded only in real
 * FlowTrack data. Managers can generate for any member; members for themselves.
 */
class AiStandupService
{
    protected AiService $ai;
    protected TimezoneService $tz;
    protected $db;

    public function __construct()
    {
        $this->ai = new AiService();
        $this->tz = new TimezoneService();
        $this->db = \Config\Database::connect();
    }

    /**
     * @return array{date:string, user:array, stats:array, standup:string, model:string, source:string}
     */
    public function forUser(int $organizationId, int $userId, string $date): array
    {
        $status = $this->ai->statusFor($organizationId);
        if (!$status['enabled']) {
            throw new \RuntimeException('AI features are not configured. Add your OpenAI API key in Settings → Integrations.');
        }

        $user = $this->userInfo($organizationId, $userId);
        if (!$user) {
            throw new \RuntimeException('Member not found in this organization.');
        }

        [$startUtc, $endUtc] = $this->tz->dateRangeUtc($date, $date, $this->tz->getOrgTimezone($organizationId));

        $entries = $this->entriesFor($organizationId, $userId, $startUtc, $endUtc);
        $split = $this->productivitySplit($organizationId, $userId, $startUtc, $endUtc);
        $apps = $this->topApps($userId, $startUtc, $endUtc);

        $totalMinutes = array_sum(array_map(fn ($e) => $e['minutes'], $entries));

        $stats = [
            'tracked_minutes'    => $totalMinutes,
            'entries'            => count($entries),
            'productive_percent' => $split['productive_percent'],
            'productivity'       => $split['by_category'],
        ];

        if ($totalMinutes === 0) {
            return [
                'date'    => $date,
                'user'    => $user,
                'stats'   => $stats,
                'standup' => "No tracked time was found for **{$user['name']}** on {$date}.",
                'model'   => $status['model'],
                'source'  => $status['source'],
            ];
        }

        $payload = [
            'member'             => $user['name'],
            'date'               => $date,
            'tracked_hours'      => round($totalMinutes / 60, 2),
            'productive_percent' => $split['productive_percent'],
            'time_entries'       => $entries,
            'top_apps'           => $apps,
        ];

        $system = <<<SYS
You are FlowTrack's daily standup assistant. Using ONLY the JSON data for one
team member on one day, write a short standup update in Markdown with exactly
these three sections:

**✅ Done today** — 2-4 bullets summarizing concrete work (reference project
names and what was worked on; group related entries).
**🎯 Focus / in progress** — 1-2 bullets on what appears to be ongoing.
**⚠️ Possible blockers** — 0-2 bullets ONLY if the data suggests fragmentation,
heavy unproductive time, or very low tracked time; otherwise write "None
detected.".

Rules: be specific and cite real project names and hours from the data. Do not
invent tasks that aren't implied by the entries or apps. Keep it under 130
words. No preamble, no closing remarks.
SYS;

        $standup = $this->ai->chatForOrg($organizationId, [
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => json_encode($payload, JSON_UNESCAPED_SLASHES)],
        ], ['temperature' => 0.4, 'max_tokens' => 500]);

        return [
            'date'    => $date,
            'user'    => $user,
            'stats'   => $stats,
            'standup' => $standup,
            'model'   => $status['model'],
            'source'  => $status['source'],
        ];
    }

    /**
     * @return array{id:int, name:string, email:string}|null
     */
    private function userInfo(int $organizationId, int $userId): ?array
    {
        $row = $this->db->table('organization_members m')
            ->select('u.id, u.first_name, u.last_name, u.email')
            ->join('users u', 'u.id = m.user_id')
            ->where('m.organization_id', $organizationId)
            ->where('m.user_id', $userId)
            ->get()
            ->getRowArray();

        if (!$row) {
            return null;
        }

        $name = trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? ''));
        return [
            'id'    => (int) $row['id'],
            'name'  => $name !== '' ? $name : (string) $row['email'],
            'email' => (string) $row['email'],
        ];
    }

    /**
     * @return array<int, array{project:string, description:?string, minutes:int}>
     */
    private function entriesFor(int $organizationId, int $userId, string $startUtc, string $endUtc): array
    {
        $rows = $this->db->table('time_entries t')
            ->select('p.name as project_name, t.description, t.duration_seconds')
            ->join('projects p', 'p.id = t.project_id', 'left')
            ->where('t.organization_id', $organizationId)
            ->where('t.user_id', $userId)
            ->where('t.started_at >=', $startUtc)
            ->where('t.started_at <=', $endUtc)
            ->orderBy('t.duration_seconds', 'DESC')
            ->get()
            ->getResultArray();

        $out = [];
        foreach ($rows as $r) {
            $minutes = (int) round(((int) $r['duration_seconds']) / 60);
            if ($minutes < 1) {
                continue;
            }
            $out[] = [
                'project'     => $r['project_name'] ?? 'General',
                'description' => $r['description'] ? mb_substr((string) $r['description'], 0, 160) : null,
                'minutes'     => $minutes,
            ];
        }
        return $out;
    }

    /**
     * @return array{productive_percent:float, by_category:array<string,int>}
     */
    private function productivitySplit(int $organizationId, int $userId, string $startUtc, string $endUtc): array
    {
        $rows = $this->db->table('activity_logs a')
            ->select('a.category, SUM(CASE WHEN a.duration_seconds > 0 THEN a.duration_seconds ELSE 60 END) as secs')
            ->join('time_entries t', 't.id = a.time_entry_id')
            ->where('a.user_id', $userId)
            ->where('t.organization_id', $organizationId)
            ->where('a.logged_at >=', $startUtc)
            ->where('a.logged_at <=', $endUtc)
            ->groupBy('a.category')
            ->get()
            ->getResultArray();

        $byCategory = [];
        $total = 0;
        $productive = 0;
        foreach ($rows as $r) {
            $minutes = (int) round(((int) $r['secs']) / 60);
            $cat = (string) ($r['category'] ?? 'uncategorized');
            $byCategory[$cat] = $minutes;
            $total += $minutes;
            if ($cat === 'productive') {
                $productive += $minutes;
            }
        }

        return [
            'productive_percent' => $total > 0 ? round(($productive / $total) * 100, 1) : 0.0,
            'by_category'        => $byCategory,
        ];
    }

    /**
     * @return array<int, array{app:string, minutes:int, category:string}>
     */
    private function topApps(int $userId, string $startUtc, string $endUtc): array
    {
        $rows = $this->db->table('activity_logs')
            ->select('app_name, category, SUM(CASE WHEN duration_seconds > 0 THEN duration_seconds ELSE 60 END) as secs')
            ->where('user_id', $userId)
            ->where('logged_at >=', $startUtc)
            ->where('logged_at <=', $endUtc)
            ->groupBy('app_name, category')
            ->orderBy('secs', 'DESC')
            ->limit(8)
            ->get()
            ->getResultArray();

        $out = [];
        foreach ($rows as $r) {
            $app = trim((string) ($r['app_name'] ?? ''));
            if ($app === '') {
                continue;
            }
            $out[] = [
                'app'      => $app,
                'minutes'  => (int) round(((int) $r['secs']) / 60),
                'category' => (string) ($r['category'] ?? 'uncategorized'),
            ];
        }
        return $out;
    }
}
