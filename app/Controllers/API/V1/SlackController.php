<?php

namespace App\Controllers\API\V1;

use App\Services\SlackService;
use CodeIgniter\RESTful\ResourceController;

/**
 * Slack integration actions (send messages to the connected workspace).
 */
class SlackController extends ResourceController
{
    protected $format = 'json';
    protected SlackService $slack;

    public function __construct()
    {
        $this->slack = new SlackService();
    }

    /**
     * POST /api/v1/integrations/slack/test
     */
    public function test()
    {
        try {
            $orgId = $this->orgId();
            $this->slack->send($orgId, ":white_check_mark: *FlowTrack* is connected to this Slack workspace.");
            return $this->respond(['success' => true, 'message' => 'Test message sent to Slack.']);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/integrations/slack/send  { text }
     */
    public function send()
    {
        try {
            $orgId = $this->orgId();
            $body = $this->request->getJSON(true) ?? [];
            $text = (string) ($body['text'] ?? '');
            $this->slack->send($orgId, $text);
            return $this->respond(['success' => true, 'message' => 'Sent to Slack.']);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
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
