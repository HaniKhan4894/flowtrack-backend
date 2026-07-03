<?php

namespace App\Services;

/**
 * Phase 12 — Microsoft Teams as a second command/notification channel.
 *
 * Uses an Incoming Webhook URL (stored as the org's `teams` integration
 * "api key") to post MessageCard payloads into a Teams channel. Also verifies
 * inbound Teams outgoing-webhook requests via HMAC for slash-style commands.
 */
class TeamsService
{
    protected IntegrationService $integrations;

    public function __construct()
    {
        $this->integrations = new IntegrationService();
    }

    public function isConnected(int $organizationId): bool
    {
        $conn = $this->integrations->get($organizationId, 'teams');
        return $conn && $conn['is_enabled'] && !empty($conn['secrets']['api_key']);
    }

    /**
     * Post a simple message (rendered as a Teams MessageCard) to the channel.
     */
    public function send(int $organizationId, string $text, ?string $title = null): void
    {
        $text = trim($text);
        if ($text === '') {
            throw new \InvalidArgumentException('Message text is required.');
        }

        $conn = $this->integrations->get($organizationId, 'teams');
        $webhook = $conn['secrets']['api_key'] ?? null;
        if (!$conn || !$conn['is_enabled'] || !$webhook) {
            throw new \RuntimeException('Microsoft Teams is not connected for this organization.');
        }

        $card = [
            '@type'      => 'MessageCard',
            '@context'   => 'https://schema.org/extensions',
            'themeColor' => '7C3AED',
            'summary'    => $title ?: 'FlowTrack',
            'sections'   => [[
                'activityTitle' => $title ?: 'FlowTrack',
                'text'          => $text,
            ]],
        ];

        $client = \Config\Services::curlrequest(['timeout' => 15, 'http_errors' => false]);
        $response = $client->post((string) $webhook, [
            'headers' => ['Content-Type' => 'application/json'],
            'body'    => json_encode($card),
        ]);

        if ($response->getStatusCode() >= 300) {
            throw new \RuntimeException('Teams rejected the message: ' . trim((string) $response->getBody()));
        }
    }

    /**
     * Verify an inbound Teams outgoing-webhook HMAC signature.
     *
     * Teams signs the raw body with a base64 secret using HMAC-SHA256 and sends
     * "Authorization: HMAC <base64sig>". Falls back to open when no secret set.
     */
    public function verifyOutgoing(string $rawBody, ?string $authHeader): bool
    {
        $secret = (string) (env('TEAMS_OUTGOING_SECRET') ?? '');
        if ($secret === '') {
            log_message('warning', 'TEAMS_OUTGOING_SECRET not set — skipping Teams signature verification.');
            return true;
        }
        if (!$authHeader || stripos($authHeader, 'HMAC ') !== 0) {
            return false;
        }
        $provided = trim(substr($authHeader, 5));
        $computed = base64_encode(hash_hmac('sha256', $rawBody, base64_decode($secret), true));
        return hash_equals($computed, $provided);
    }
}
