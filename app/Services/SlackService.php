<?php

namespace App\Services;

/**
 * Posts messages to a connected organization's Slack workspace using either the
 * stored incoming-webhook URL or the bot token (chat.postMessage).
 * Also supports listing channels and reading/posting channel messages in-app.
 */
class SlackService
{
    protected IntegrationService $integrations;

    public function __construct()
    {
        $this->integrations = new IntegrationService();
    }

    public function isConnected(int $organizationId): bool
    {
        $conn = $this->integrations->get($organizationId, 'slack');
        if (!$conn || !$conn['is_enabled']) {
            return false;
        }
        return !empty($conn['secrets']['webhook_url']) || !empty($conn['secrets']['access_token']);
    }

    /**
     * Whether the bot token can list channels and read history (needs reconnect after scope upgrade).
     */
    public function canUseWorkspace(int $organizationId): bool
    {
        $conn = $this->integrations->get($organizationId, 'slack');
        return $conn !== null && $conn['is_enabled'] && !empty($conn['secrets']['access_token']);
    }

    /**
     * @return array{connected:bool, team_name:?string, can_read:bool, default_channel:?string, default_channel_id:?string}
     */
    public function workspaceMeta(int $organizationId): array
    {
        $conn = $this->integrations->get($organizationId, 'slack');
        if (!$conn || !$conn['is_enabled']) {
            return [
                'connected'          => false,
                'team_name'          => null,
                'can_read'           => false,
                'default_channel'    => null,
                'default_channel_id' => null,
            ];
        }

        return [
            'connected'          => true,
            'team_name'          => (string) ($conn['settings']['team_name'] ?? $conn['settings']['account_name'] ?? 'Slack'),
            'can_read'           => $this->canUseWorkspace($organizationId),
            'default_channel'    => isset($conn['settings']['channel']) ? (string) $conn['settings']['channel'] : null,
            'default_channel_id' => isset($conn['settings']['channel_id']) ? (string) $conn['settings']['channel_id'] : null,
        ];
    }

    /**
     * @return array{channels:array<int,array>, next_cursor:?string, has_more:bool}
     */
    public function listChannels(int $organizationId, ?string $cursor = null, int $limit = 50): array
    {
        $token = $this->requireBotToken($organizationId);
        $limit = max(1, min(200, $limit));

        $params = [
            'types'           => 'public_channel,private_channel',
            'exclude_archived'=> true,
            'limit'           => $limit,
        ];
        if ($cursor !== null && $cursor !== '') {
            $params['cursor'] = $cursor;
        }

        $body = $this->apiCall($token, 'conversations.list', $params);
        $channels = [];
        foreach ($body['channels'] ?? [] as $ch) {
            if (!is_array($ch)) {
                continue;
            }
            $channels[] = [
                'id'       => (string) ($ch['id'] ?? ''),
                'name'     => (string) ($ch['name'] ?? ''),
                'is_private' => !empty($ch['is_private']),
                'num_members'=> (int) ($ch['num_members'] ?? 0),
                'topic'    => (string) ($ch['topic']['value'] ?? ''),
            ];
        }

        $next = isset($body['response_metadata']['next_cursor']) && $body['response_metadata']['next_cursor'] !== ''
            ? (string) $body['response_metadata']['next_cursor']
            : null;

        return [
            'channels'    => $channels,
            'next_cursor' => $next,
            'has_more'    => $next !== null,
        ];
    }

    /**
     * @return array{messages:array<int,array>, next_cursor:?string, has_more:bool}
     */
    public function getMessages(int $organizationId, string $channelId, ?string $cursor = null, int $limit = 30): array
    {
        $token = $this->requireBotToken($organizationId);
        $channelId = trim($channelId);
        if ($channelId === '') {
            throw new \InvalidArgumentException('Channel id is required.');
        }

        $limit = max(1, min(100, $limit));
        $params = ['channel' => $channelId, 'limit' => $limit];
        if ($cursor !== null && $cursor !== '') {
            $params['cursor'] = $cursor;
        }

        $body = $this->apiCall($token, 'conversations.history', $params);
        $userCache = [];
        $messages = [];

        foreach ($body['messages'] ?? [] as $msg) {
            if (!is_array($msg)) {
                continue;
            }
            $type = (string) ($msg['type'] ?? 'message');
            if ($type !== 'message') {
                continue;
            }
            $subtype = $msg['subtype'] ?? null;
            if ($subtype !== null && !in_array($subtype, ['thread_broadcast', 'file_share'], true)) {
                continue;
            }
            $userId = (string) ($msg['user'] ?? $msg['bot_id'] ?? '');
            $author = $userId;
            if ($userId !== '' && !str_starts_with($userId, 'B')) {
                $author = $this->resolveUserName($token, $userId, $userCache);
            } elseif (!empty($msg['username'])) {
                $author = (string) $msg['username'];
            } elseif ($userId !== '') {
                $author = 'Bot';
            }

            $messages[] = [
                'ts'         => (string) ($msg['ts'] ?? ''),
                'author'     => $author,
                'text'       => (string) ($msg['text'] ?? ''),
                'thread_ts'  => isset($msg['thread_ts']) ? (string) $msg['thread_ts'] : null,
                'created_at' => $this->slackTsToIso((string) ($msg['ts'] ?? '')),
            ];
        }

        $next = isset($body['response_metadata']['next_cursor']) && $body['response_metadata']['next_cursor'] !== ''
            ? (string) $body['response_metadata']['next_cursor']
            : null;

        return [
            'messages'    => array_reverse($messages),
            'next_cursor' => $next,
            'has_more'    => $next !== null,
        ];
    }

    /**
     * Post a message to a specific channel.
     */
    public function sendToChannel(int $organizationId, string $channelId, string $text): void
    {
        $text = trim($text);
        if ($text === '') {
            throw new \InvalidArgumentException('Message text is required.');
        }

        $channelId = trim($channelId);
        if ($channelId === '') {
            throw new \InvalidArgumentException('Channel id is required.');
        }

        $conn = $this->integrations->get($organizationId, 'slack');
        if (!$conn || !$conn['is_enabled']) {
            throw new \RuntimeException('Slack is not connected for this organization.');
        }

        if (!empty($conn['secrets']['access_token'])) {
            $this->apiCall((string) $conn['secrets']['access_token'], 'chat.postMessage', [
                'channel' => $channelId,
                'text'    => $text,
            ]);
            return;
        }

        // Webhook-only installs can only post to the default channel.
        $defaultId = (string) ($conn['settings']['channel_id'] ?? '');
        if ($defaultId !== '' && $defaultId === $channelId && !empty($conn['secrets']['webhook_url'])) {
            $this->sendViaWebhook((string) $conn['secrets']['webhook_url'], $text);
            return;
        }

        throw new \RuntimeException('Reconnect Slack with full permissions to post to this channel.');
    }

    /**
     * Send a plain-text (Markdown-flavored) message to the connected workspace.
     */
    public function send(int $organizationId, string $text, ?string $channelId = null): void
    {
        $text = trim($text);
        if ($text === '') {
            throw new \InvalidArgumentException('Message text is required.');
        }

        if ($channelId !== null && trim($channelId) !== '') {
            $this->sendToChannel($organizationId, $channelId, $text);
            return;
        }

        $conn = $this->integrations->get($organizationId, 'slack');
        if (!$conn || !$conn['is_enabled']) {
            throw new \RuntimeException('Slack is not connected for this organization.');
        }

        $secrets = $conn['secrets'];

        if (!empty($secrets['webhook_url'])) {
            $this->sendViaWebhook((string) $secrets['webhook_url'], $text);
            return;
        }

        $channel = $conn['settings']['channel_id'] ?? null;
        if (empty($secrets['access_token']) || !$channel) {
            throw new \RuntimeException('Slack connection is missing a delivery channel. Please reconnect Slack.');
        }

        $this->apiCall((string) $secrets['access_token'], 'chat.postMessage', [
            'channel' => $channel,
            'text'    => $text,
        ]);
    }

    private function sendViaWebhook(string $url, string $text): void
    {
        $client = \Config\Services::curlrequest(['timeout' => 15, 'http_errors' => false]);
        $response = $client->post($url, [
            'headers' => ['Content-Type' => 'application/json'],
            'body' => json_encode(['text' => $text]),
        ]);
        if ($response->getStatusCode() >= 300) {
            throw new \RuntimeException('Slack rejected the message: ' . trim((string) $response->getBody()));
        }
    }

    private function requireBotToken(int $organizationId): string
    {
        $conn = $this->integrations->get($organizationId, 'slack');
        if (!$conn || !$conn['is_enabled'] || empty($conn['secrets']['access_token'])) {
            throw new \RuntimeException(
                'Slack bot token is required to browse channels. Please reconnect Slack in Integrations to grant channel read access.'
            );
        }
        return (string) $conn['secrets']['access_token'];
    }

    /**
     * @param array<string,mixed> $params
     * @return array<string,mixed>
     */
    private function apiCall(string $token, string $method, array $params = []): array
    {
        $client = \Config\Services::curlrequest(['timeout' => 25, 'http_errors' => false]);
        $response = $client->post('https://slack.com/api/' . $method, [
            'headers' => [
                'Authorization' => 'Bearer ' . $token,
                'Content-Type'  => 'application/x-www-form-urlencoded',
            ],
            'form_params' => $params,
        ]);

        $body = json_decode((string) $response->getBody(), true);
        if (!is_array($body) || empty($body['ok'])) {
            $err = is_array($body) ? ($body['error'] ?? null) : null;
            $hint = match ($err) {
                'missing_scope'     => ' Reconnect Slack in Integrations to grant the required permissions.',
                'not_in_channel'    => ' Invite the FlowTrack bot to this channel in Slack, then try again.',
                'channel_not_found' => ' Channel not found or the bot cannot access it.',
                default             => '',
            };
            throw new \RuntimeException('Slack API error' . ($err ? (': ' . $err) : '.') . $hint);
        }

        return $body;
    }

    /**
     * @param array<string,string> $cache
     */
    private function resolveUserName(string $token, string $userId, array &$cache): string
    {
        if (isset($cache[$userId])) {
            return $cache[$userId];
        }

        try {
            $body = $this->apiCall($token, 'users.info', ['user' => $userId]);
            $user = $body['user'] ?? [];
            $name = (string) ($user['profile']['display_name'] ?? $user['profile']['real_name'] ?? $user['name'] ?? $userId);
            $cache[$userId] = $name !== '' ? $name : $userId;
        } catch (\Throwable $e) {
            $cache[$userId] = $userId;
        }

        return $cache[$userId];
    }

    private function slackTsToIso(string $ts): ?string
    {
        if ($ts === '' || !is_numeric($ts)) {
            return null;
        }
        $seconds = (int) floor((float) $ts);
        return gmdate('Y-m-d\TH:i:s\Z', $seconds);
    }
}
