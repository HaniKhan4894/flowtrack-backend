<?php

namespace App\Controllers\API\V1;

use App\Services\SlackService;
use CodeIgniter\RESTful\ResourceController;

/**
 * Slack integration: workspace browse, channel messages, send.
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
     * GET /api/v1/integrations/slack/meta
     */
    public function meta()
    {
        try {
            $orgId = $this->orgId();
            return $this->respond(['success' => true, 'data' => $this->slack->workspaceMeta($orgId)]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/integrations/slack/channels?cursor=
     */
    public function channels()
    {
        try {
            $orgId = $this->orgId();
            if (!$this->slack->isConnected($orgId)) {
                return $this->respond(['success' => true, 'data' => ['connected' => false, 'channels' => [], 'has_more' => false]]);
            }
            if (!$this->slack->canUseWorkspace($orgId)) {
                return $this->fail(
                    'Reconnect Slack in Integrations to browse channels (channel read permission required).',
                    400
                );
            }

            $cursor = $this->request->getGet('cursor');
            $limit = (int) ($this->request->getGet('limit') ?? 50);
            $result = $this->slack->listChannels($orgId, is_string($cursor) ? $cursor : null, $limit);
            $result['connected'] = true;

            return $this->respond(['success' => true, 'data' => $result]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/integrations/slack/channels/(:segment)/messages?cursor=
     */
    public function messages(string $channelId)
    {
        try {
            $orgId = $this->orgId();
            if (!$this->slack->canUseWorkspace($orgId)) {
                return $this->fail('Slack bot token required. Reconnect Slack in Integrations.', 400);
            }

            $cursor = $this->request->getGet('cursor');
            $limit = (int) ($this->request->getGet('limit') ?? 30);
            $result = $this->slack->getMessages(
                $orgId,
                $channelId,
                is_string($cursor) ? $cursor : null,
                $limit
            );

            return $this->respond(['success' => true, 'data' => $result]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/integrations/slack/channels/(:segment)/message  { text }
     */
    public function channelMessage(string $channelId)
    {
        try {
            $orgId = $this->orgId();
            $body = $this->request->getJSON(true) ?? [];
            $text = (string) ($body['text'] ?? '');
            $this->slack->sendToChannel($orgId, $channelId, $text);
            return $this->respondCreated(['success' => true, 'message' => 'Message sent.']);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
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
     * POST /api/v1/integrations/slack/send  { text, channel_id? }
     */
    public function send()
    {
        try {
            $orgId = $this->orgId();
            $body = $this->request->getJSON(true) ?? [];
            $text = (string) ($body['text'] ?? '');
            $channelId = isset($body['channel_id']) ? (string) $body['channel_id'] : null;
            $this->slack->send($orgId, $text, $channelId !== '' ? $channelId : null);
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
