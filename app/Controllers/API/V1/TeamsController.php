<?php

namespace App\Controllers\API\V1;

use App\Services\TeamsService;
use CodeIgniter\RESTful\ResourceController;

/**
 * Phase 12 — Microsoft Teams channel.
 *
 * Authenticated endpoints (via the normal auth filter) to test / send messages
 * to the connected Teams channel, plus a public outgoing-webhook command
 * endpoint that Teams calls (verified by HMAC).
 */
class TeamsController extends ResourceController
{
    protected $format = 'json';
    protected TeamsService $teams;

    public function __construct()
    {
        $this->teams = new TeamsService();
    }

    /** POST /api/v1/integrations/teams/test */
    public function test()
    {
        try {
            $this->teams->send($this->orgId(), 'FlowTrack is connected to this Microsoft Teams channel. :tada:', 'FlowTrack');
            return $this->respond(['success' => true, 'message' => 'Test message sent to Teams.']);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /** POST /api/v1/integrations/teams/send  { text, title? } */
    public function send()
    {
        try {
            $body = $this->request->getJSON(true) ?? [];
            $this->teams->send($this->orgId(), (string) ($body['text'] ?? ''), isset($body['title']) ? (string) $body['title'] : null);
            return $this->respond(['success' => true, 'message' => 'Sent to Teams.']);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/teams/commands  (public, called by a Teams outgoing webhook)
     * Teams sends { type:'message', text:'<at>Bot</at> help', from:{...} }.
     */
    public function commands()
    {
        $raw = $this->request->getBody() ?? '';
        if (!$this->teams->verifyOutgoing($raw, $this->request->getHeaderLine('Authorization') ?: null)) {
            return $this->respond(['type' => 'message', 'text' => 'Invalid signature.'], 401);
        }

        $payload = json_decode($raw, true) ?: [];
        $text = strtolower(trim(strip_tags((string) ($payload['text'] ?? ''))));

        $help = "**FlowTrack for Teams**\n\n"
            . "This channel receives FlowTrack alerts (timesheets, budgets, standups) via automations.\n"
            . "Manage timers with the FlowTrack app or the Slack `/flowtrack` commands.";

        $reply = str_contains($text, 'help') || $text === ''
            ? $help
            : "Got it. FlowTrack posts alerts here automatically. Type *help* for options.";

        return $this->respond(['type' => 'message', 'text' => $reply]);
    }

    private function orgId(): int
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if (!$orgId) {
            throw new \RuntimeException('Unauthorized');
        }
        return $orgId;
    }
}
