<?php

namespace App\Controllers\API\V1;

use App\Services\SlackCommandService;
use CodeIgniter\RESTful\ResourceController;

/**
 * Phase 12 — Inbound Slack endpoints (slash commands + interactive actions).
 *
 * These are called by Slack (not the FlowTrack frontend), so they are public
 * and authenticated by verifying Slack's request signature instead of a JWT.
 */
class SlackCommandController extends ResourceController
{
    protected $format = 'json';
    protected SlackCommandService $service;

    public function __construct()
    {
        $this->service = new SlackCommandService();
    }

    /** POST /api/v1/slack/commands */
    public function commands()
    {
        $raw = $this->request->getBody() ?? '';
        if (!$this->verify($raw)) {
            return $this->respond(['text' => 'Invalid Slack signature.'], 401);
        }

        // Slack sends application/x-www-form-urlencoded.
        parse_str($raw, $params);
        $result = $this->service->handleCommand(is_array($params) ? $params : []);
        return $this->respond($result);
    }

    /** POST /api/v1/slack/interactions */
    public function interactions()
    {
        $raw = $this->request->getBody() ?? '';
        if (!$this->verify($raw)) {
            return $this->respond(['text' => 'Invalid Slack signature.'], 401);
        }

        parse_str($raw, $params);
        $payload = [];
        if (isset($params['payload'])) {
            $payload = json_decode((string) $params['payload'], true) ?: [];
        }
        $result = $this->service->handleInteraction($payload);
        return $this->respond($result);
    }

    private function verify(string $raw): bool
    {
        return $this->service->verifySignature(
            $raw,
            $this->request->getHeaderLine('X-Slack-Request-Timestamp') ?: null,
            $this->request->getHeaderLine('X-Slack-Signature') ?: null,
        );
    }
}
