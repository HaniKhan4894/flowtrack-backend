<?php

namespace App\Services;

/**
 * Phase 12 — Slack command center.
 *
 * Handles Slack slash commands (/flowtrack …) and interactive button actions
 * (timesheet approvals). Verifies Slack's request signature, maps the Slack
 * workspace + user back to a FlowTrack organization + user, and executes the
 * requested action through the existing services so everything still flows
 * through TimeEntryService -> LedgerService.
 */
class SlackCommandService
{
    protected IntegrationService $integrations;
    protected $db;

    public function __construct()
    {
        $this->integrations = new IntegrationService();
        $this->db = \Config\Database::connect();
    }

    /**
     * Verify the Slack request signature (v0). Returns true when valid, or when
     * no signing secret is configured (dev fallback — logs a warning).
     */
    public function verifySignature(string $rawBody, ?string $timestamp, ?string $signature): bool
    {
        $secret = (string) (env('SLACK_SIGNING_SECRET') ?? '');
        if ($secret === '') {
            log_message('warning', 'SLACK_SIGNING_SECRET not set — skipping Slack signature verification.');
            return true;
        }
        if (!$timestamp || !$signature) {
            return false;
        }
        // Reject requests older than 5 minutes (replay protection).
        if (abs(time() - (int) $timestamp) > 300) {
            return false;
        }
        $base = 'v0:' . $timestamp . ':' . $rawBody;
        $computed = 'v0=' . hash_hmac('sha256', $base, $secret);
        return hash_equals($computed, $signature);
    }

    /**
     * Execute a slash command. Returns a Slack message payload (ephemeral).
     *
     * @param array<string,string> $params The parsed application/x-www-form-urlencoded body.
     * @return array<string,mixed>
     */
    public function handleCommand(array $params): array
    {
        $teamId = (string) ($params['team_id'] ?? '');
        $slackUserId = (string) ($params['user_id'] ?? '');
        $text = trim((string) ($params['text'] ?? ''));

        $ctx = $this->resolveContext($teamId, $slackUserId);
        if (!$ctx) {
            return $this->ephemeral(
                ":warning: Your Slack account isn't linked to FlowTrack. Make sure your Slack email matches your FlowTrack login, and that an admin has connected Slack in *Settings → Integrations*."
            );
        }

        [$orgId, $userId] = $ctx;
        $parts = preg_split('/\s+/', $text, 2) ?: [];
        $sub = strtolower($parts[0] ?? 'help');
        $arg = trim($parts[1] ?? '');

        try {
            switch ($sub) {
                case 'start':
                    return $this->cmdStart($orgId, $userId, $arg);
                case 'stop':
                    return $this->cmdStop($userId);
                case 'status':
                    return $this->cmdStatus($userId);
                case 'today':
                    return $this->cmdToday($orgId, $userId);
                case 'standup':
                    return $this->cmdStandup($orgId, $userId);
                case '':
                case 'help':
                default:
                    return $this->cmdHelp();
            }
        } catch (\Throwable $e) {
            return $this->ephemeral(':x: ' . $e->getMessage());
        }
    }

    // ── Commands ──────────────────────────────────────────────────────────

    private function cmdStart(int $orgId, int $userId, string $arg): array
    {
        $timeEntry = new TimeEntryService();
        $projectId = null;
        $description = $arg;

        // "start <project name or #id> : description" — best-effort project match.
        if ($arg !== '') {
            $projectId = $this->matchProject($orgId, $arg);
            if ($projectId) {
                $description = $arg;
            }
        }

        $entry = $timeEntry->startTimer($userId, $orgId, [
            'project_id'  => $projectId,
            'description' => $description !== '' ? $description : 'Started from Slack',
        ]);

        $proj = $entry['project_name'] ?? 'No project';
        return $this->ephemeral(":stopwatch: Timer *started* — {$proj}" . ($description ? " · _{$description}_" : ''));
    }

    private function cmdStop(int $userId): array
    {
        $timeEntry = new TimeEntryService();
        $active = $timeEntry->getActiveTimer($userId);
        if (!$active) {
            return $this->ephemeral(':information_source: You have no running timer.');
        }
        $entry = $timeEntry->stopTimer($userId, (int) $active['id']);
        $mins = (int) round(((int) ($entry['duration_seconds'] ?? 0)) / 60);
        return $this->ephemeral(":white_check_mark: Timer *stopped* — logged {$mins} min" . (!empty($entry['project_name']) ? " on {$entry['project_name']}" : ''));
    }

    private function cmdStatus(int $userId): array
    {
        $timeEntry = new TimeEntryService();
        $active = $timeEntry->getActiveTimer($userId);
        if (!$active) {
            return $this->ephemeral(':zzz: No timer running. Use `/flowtrack start` to begin.');
        }
        $started = strtotime((string) $active['started_at']);
        $mins = $started ? (int) round((time() - $started) / 60) : 0;
        $proj = $active['project_name'] ?? 'No project';
        return $this->ephemeral(":stopwatch: Running for *{$mins} min* — {$proj}" . (!empty($active['description']) ? " · _{$active['description']}_" : ''));
    }

    private function cmdToday(int $orgId, int $userId): array
    {
        $tz = new TimezoneService();
        $phpTz = $tz->getOrgTimezone($orgId);
        $today = (new \DateTime('now', new \DateTimeZone($phpTz)))->format('Y-m-d');
        [$startUtc, $endUtc] = $tz->dateRangeUtc($today, $today, $phpTz);

        $row = $this->db->table('time_entries')
            ->select('COALESCE(SUM(duration_seconds),0) as secs, COUNT(*) as cnt', false)
            ->where('user_id', $userId)
            ->where('organization_id', $orgId)
            ->where('started_at >=', $startUtc)
            ->where('started_at <=', $endUtc)
            ->get()
            ->getRowArray();

        $hours = round(((int) ($row['secs'] ?? 0)) / 3600, 2);
        return $this->ephemeral(":bar_chart: Today: *{$hours}h* across {$row['cnt']} entr" . ((int) $row['cnt'] === 1 ? 'y' : 'ies') . '.');
    }

    private function cmdStandup(int $orgId, int $userId): array
    {
        $tz = new TimezoneService();
        $phpTz = $tz->getOrgTimezone($orgId);
        $today = (new \DateTime('now', new \DateTimeZone($phpTz)))->format('Y-m-d');

        try {
            $standup = (new AiStandupService())->forUser($orgId, $userId, $today);
        } catch (\Throwable $e) {
            return $this->ephemeral(':information_source: ' . $e->getMessage());
        }

        $summary = $standup['summary'] ?? ($standup['narrative'] ?? null);
        if (!$summary && !empty($standup['sections'])) {
            $summary = is_string($standup['sections']) ? $standup['sections'] : json_encode($standup['sections']);
        }
        if (!$summary) {
            $summary = 'No standup could be generated for today yet.';
        }

        return $this->ephemeral(":memo: *Your standup for {$today}*\n" . $summary);
    }

    private function cmdHelp(): array
    {
        return $this->ephemeral(
            "*FlowTrack commands*\n" .
            "• `/flowtrack start [project] [description]` — start a timer\n" .
            "• `/flowtrack stop` — stop the running timer\n" .
            "• `/flowtrack status` — show the running timer\n" .
            "• `/flowtrack today` — today's tracked total\n" .
            "• `/flowtrack standup` — AI standup for today"
        );
    }

    // ── Interactive actions (timesheet approvals) ──────────────────────────

    /**
     * Handle an interactive payload (button click). Slack sends a JSON `payload`
     * form field. We support approve/reject timesheet actions whose value is
     * "approve:<periodId>" / "reject:<periodId>".
     *
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    public function handleInteraction(array $payload): array
    {
        $teamId = (string) ($payload['team']['id'] ?? '');
        $slackUserId = (string) ($payload['user']['id'] ?? '');
        $ctx = $this->resolveContext($teamId, $slackUserId);
        if (!$ctx) {
            return $this->ephemeral(':warning: Slack account not linked to FlowTrack.');
        }
        [$orgId, $userId] = $ctx;

        $action = $payload['actions'][0] ?? null;
        $value = (string) ($action['value'] ?? '');
        [$verb, $idPart] = array_pad(explode(':', $value, 2), 2, '');
        $periodId = (int) $idPart;
        if ($periodId <= 0) {
            return $this->ephemeral(':x: Unrecognized action.');
        }

        $timesheets = new TimesheetService();
        try {
            if ($verb === 'approve') {
                $timesheets->approvePeriod($periodId, $userId, $orgId);
                return $this->replaceOriginal(":white_check_mark: Timesheet #{$periodId} approved by <@{$slackUserId}>.");
            }
            if ($verb === 'reject') {
                $timesheets->rejectPeriod($periodId, $userId, $orgId, 'Rejected via Slack');
                return $this->replaceOriginal(":x: Timesheet #{$periodId} rejected by <@{$slackUserId}>.");
            }
        } catch (\Throwable $e) {
            return $this->ephemeral(':x: ' . $e->getMessage());
        }

        return $this->ephemeral(':x: Unknown action.');
    }

    // ── Context resolution ────────────────────────────────────────────────

    /**
     * Map a Slack workspace + user to [organizationId, userId].
     *
     * @return array{0:int,1:int}|null
     */
    private function resolveContext(string $teamId, string $slackUserId): ?array
    {
        if ($teamId === '' || $slackUserId === '') {
            return null;
        }
        $conn = $this->integrations->findByAccount('slack', $teamId);
        if (!$conn || !$conn['is_enabled']) {
            return null;
        }
        $orgId = $conn['organization_id'];

        // Cached mapping first.
        $map = $conn['settings']['slack_user_map'] ?? [];
        if (is_array($map) && !empty($map[$slackUserId])) {
            return [$orgId, (int) $map[$slackUserId]];
        }

        // Resolve via Slack users.info -> email -> FlowTrack user in this org.
        $email = $this->slackUserEmail($conn['secrets']['access_token'] ?? null, $slackUserId);
        if (!$email) {
            return null;
        }

        $user = $this->db->table('users u')
            ->select('u.id')
            ->join('organization_members om', 'om.user_id = u.id')
            ->where('om.organization_id', $orgId)
            ->where('LOWER(u.email)', strtolower($email))
            ->get()
            ->getRowArray();

        if (!$user) {
            return null;
        }

        $userId = (int) $user['id'];
        // Cache the mapping for next time.
        $map = is_array($map) ? $map : [];
        $map[$slackUserId] = $userId;
        $this->integrations->patchSettings($orgId, 'slack', ['slack_user_map' => $map]);

        return [$orgId, $userId];
    }

    private function slackUserEmail(?string $botToken, string $slackUserId): ?string
    {
        if (!$botToken) {
            return null;
        }
        $client = \Config\Services::curlrequest(['timeout' => 10, 'http_errors' => false]);
        $response = $client->get('https://slack.com/api/users.info', [
            'headers' => ['Authorization' => 'Bearer ' . $botToken],
            'query'   => ['user' => $slackUserId],
        ]);
        $body = json_decode((string) $response->getBody(), true);
        if (!is_array($body) || empty($body['ok'])) {
            return null;
        }
        return $body['user']['profile']['email'] ?? null;
    }

    private function matchProject(int $orgId, string $arg): ?int
    {
        // Explicit "#id".
        if (preg_match('/#(\d+)/', $arg, $m)) {
            $id = (int) $m[1];
            $row = $this->db->table('projects')->where('id', $id)->where('organization_id', $orgId)->get()->getRowArray();
            return $row ? $id : null;
        }
        // Name prefix match on the first word.
        $first = preg_split('/\s+/', $arg)[0] ?? '';
        if ($first === '') {
            return null;
        }
        $row = $this->db->table('projects')
            ->select('id')
            ->where('organization_id', $orgId)
            ->like('name', $first, 'after')
            ->get()
            ->getRowArray();
        return $row ? (int) $row['id'] : null;
    }

    // ── Response helpers ──────────────────────────────────────────────────

    /**
     * @return array<string,mixed>
     */
    private function ephemeral(string $text): array
    {
        return ['response_type' => 'ephemeral', 'text' => $text];
    }

    /**
     * @return array<string,mixed>
     */
    private function replaceOriginal(string $text): array
    {
        return ['response_type' => 'in_channel', 'replace_original' => true, 'text' => $text];
    }
}
