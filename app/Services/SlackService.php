<?php

namespace App\Services;

/**
 * Posts messages to a connected organization's Slack workspace using either the
 * stored incoming-webhook URL or the bot token (chat.postMessage).
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
     * Send a plain-text (Markdown-flavored) message to the connected workspace.
     */
    public function send(int $organizationId, string $text): void
    {
        $text = trim($text);
        if ($text === '') {
            throw new \InvalidArgumentException('Message text is required.');
        }

        $conn = $this->integrations->get($organizationId, 'slack');
        if (!$conn || !$conn['is_enabled']) {
            throw new \RuntimeException('Slack is not connected for this organization.');
        }

        $secrets = $conn['secrets'];
        $client = \Config\Services::curlrequest(['timeout' => 15, 'http_errors' => false]);

        // Prefer the incoming webhook (simplest, always posts to the chosen channel).
        if (!empty($secrets['webhook_url'])) {
            $response = $client->post((string) $secrets['webhook_url'], [
                'headers' => ['Content-Type' => 'application/json'],
                'body' => json_encode(['text' => $text]),
            ]);
            if ($response->getStatusCode() >= 300) {
                throw new \RuntimeException('Slack rejected the message: ' . trim((string) $response->getBody()));
            }
            return;
        }

        // Fallback: bot token + chat.postMessage to the stored channel.
        $channel = $conn['settings']['channel_id'] ?? null;
        if (empty($secrets['access_token']) || !$channel) {
            throw new \RuntimeException('Slack connection is missing a delivery channel. Please reconnect Slack.');
        }

        $response = $client->post('https://slack.com/api/chat.postMessage', [
            'headers' => [
                'Authorization' => 'Bearer ' . $secrets['access_token'],
                'Content-Type'  => 'application/json; charset=utf-8',
            ],
            'body' => json_encode(['channel' => $channel, 'text' => $text]),
        ]);

        $body = json_decode((string) $response->getBody(), true);
        if (!is_array($body) || empty($body['ok'])) {
            $err = is_array($body) ? ($body['error'] ?? null) : null;
            throw new \RuntimeException('Slack rejected the message' . ($err ? ': ' . $err : '.'));
        }
    }
}
