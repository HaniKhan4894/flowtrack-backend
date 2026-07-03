<?php

namespace App\Services;

use Config\OAuth as OAuthConfig;

/**
 * Reads/writes a connected organization's Jira Cloud data via the Atlassian
 * OAuth 2.0 (3LO) token. Handles automatic access-token refresh (offline_access).
 */
class JiraService
{
    protected IntegrationService $integrations;
    protected OAuthConfig $oauth;

    public function __construct()
    {
        $this->integrations = new IntegrationService();
        $this->oauth = new OAuthConfig();
    }

    public function isConnected(int $organizationId): bool
    {
        $conn = $this->integrations->get($organizationId, 'jira');
        return $conn !== null && $conn['is_enabled']
            && !empty($conn['secrets']['access_token'])
            && !empty($conn['settings']['cloud_id']);
    }

    /**
     * Recent issues assigned to the connected user.
     *
     * @return array<int, array{key:string, summary:string, status:string, project:string, url:string, updated:?string}>
     */
    public function recentIssues(int $organizationId, int $max = 30): array
    {
        $conn = $this->requireConnection($organizationId);
        $siteUrl = rtrim((string) ($conn['settings']['site_url'] ?? ''), '/');

        // Jira removed the legacy GET /rest/api/3/search; use the enhanced
        // /rest/api/3/search/jql endpoint (POST) instead. See CHANGE-2046.
        $body = $this->request($organizationId, 'post', '/rest/api/3/search/jql', [
            'headers' => ['Content-Type' => 'application/json'],
            'body' => json_encode([
                'jql'        => 'assignee = currentUser() ORDER BY updated DESC',
                'maxResults' => max(1, min(50, $max)),
                'fields'     => ['summary', 'status', 'updated', 'project'],
            ]),
        ]);

        $out = [];
        foreach ($body['issues'] ?? [] as $issue) {
            $key = (string) ($issue['key'] ?? '');
            $fields = $issue['fields'] ?? [];
            $out[] = [
                'key'     => $key,
                'summary' => (string) ($fields['summary'] ?? ''),
                'status'  => (string) ($fields['status']['name'] ?? ''),
                'project' => (string) ($fields['project']['name'] ?? ''),
                'url'     => $siteUrl !== '' ? $siteUrl . '/browse/' . $key : '',
                'updated' => $fields['updated'] ?? null,
            ];
        }
        return $out;
    }

    /**
     * Push a worklog to a Jira issue. Best-effort; returns true on success.
     */
    public function addWorklog(int $organizationId, string $issueKey, int $seconds, string $startedAtUtc, string $comment = ''): bool
    {
        $seconds = max(60, $seconds);
        // Jira expects e.g. 2021-01-17T12:34:56.000+0000
        $started = date('Y-m-d\TH:i:s.000O', strtotime($startedAtUtc) ?: time());

        $payload = [
            'timeSpentSeconds' => $seconds,
            'started'          => $started,
        ];

        if ($comment !== '') {
            $payload['comment'] = [
                'type'    => 'doc',
                'version' => 1,
                'content' => [[
                    'type'    => 'paragraph',
                    'content' => [['type' => 'text', 'text' => mb_substr($comment, 0, 500)]],
                ]],
            ];
        }

        $this->request($organizationId, 'post', '/rest/api/3/issue/' . rawurlencode($issueKey) . '/worklog', [
            'headers' => ['Content-Type' => 'application/json'],
            'body' => json_encode($payload),
        ]);

        return true;
    }

    /**
     * Perform an authenticated Jira Cloud API call, refreshing the token on 401.
     *
     * @param array<string,mixed> $options
     * @return array<string,mixed>
     */
    private function request(int $organizationId, string $method, string $path, array $options = [], bool $retry = true): array
    {
        [$token, $cloudId] = $this->accessToken($organizationId);
        $cfg = $this->oauth->provider('jira');
        $url = rtrim((string) $cfg['api_base'], '/') . '/' . $cloudId . $path;

        $client = \Config\Services::curlrequest(['timeout' => 25, 'http_errors' => false]);
        $options['headers'] = array_merge([
            'Authorization' => 'Bearer ' . $token,
            'Accept'        => 'application/json',
        ], $options['headers'] ?? []);

        $response = $client->request(strtoupper($method), $url, $options);
        $status = $response->getStatusCode();

        if ($status === 401 && $retry) {
            $this->refresh($organizationId);
            return $this->request($organizationId, $method, $path, $options, false);
        }

        $raw = (string) $response->getBody();
        $body = $raw !== '' ? json_decode($raw, true) : [];

        if ($status >= 400) {
            $msg = is_array($body) ? ($body['errorMessages'][0] ?? ($body['error'] ?? null)) : null;
            throw new \RuntimeException($msg ? ('Jira error: ' . $msg) : 'Jira request failed (' . $status . ').');
        }

        return is_array($body) ? $body : [];
    }

    /**
     * Current access token + cloud id, refreshing proactively if near expiry.
     *
     * @return array{0:string,1:string}
     */
    private function accessToken(int $organizationId): array
    {
        $conn = $this->requireConnection($organizationId);
        $expiresAt = $conn['settings']['expires_at'] ?? null;

        if ($expiresAt && strtotime((string) $expiresAt) <= time() + 60 && !empty($conn['secrets']['refresh_token'])) {
            return $this->refresh($organizationId);
        }

        return [(string) $conn['secrets']['access_token'], (string) $conn['settings']['cloud_id']];
    }

    /**
     * Exchange the stored refresh token for a fresh access token.
     *
     * @return array{0:string,1:string}
     */
    private function refresh(int $organizationId): array
    {
        $conn = $this->requireConnection($organizationId);
        $refreshToken = $conn['secrets']['refresh_token'] ?? null;
        if (!$refreshToken) {
            throw new \RuntimeException('Jira session expired. Please reconnect Jira in Settings → Integrations.');
        }

        $cfg = $this->oauth->provider('jira');
        $client = \Config\Services::curlrequest(['timeout' => 20, 'http_errors' => false]);

        $response = $client->post($cfg['token_url'], [
            'headers' => ['Accept' => 'application/json', 'Content-Type' => 'application/json'],
            'body' => json_encode([
                'grant_type'    => 'refresh_token',
                'client_id'     => $cfg['client_id'],
                'client_secret' => $cfg['client_secret'],
                'refresh_token' => $refreshToken,
            ]),
        ]);

        $body = json_decode((string) $response->getBody(), true);
        if (!is_array($body) || empty($body['access_token'])) {
            throw new \RuntimeException('Jira session expired. Please reconnect Jira in Settings → Integrations.');
        }

        $access = (string) $body['access_token'];
        $expiresIn = (int) ($body['expires_in'] ?? 3600);
        $cloudId = (string) $conn['settings']['cloud_id'];

        $this->integrations->saveOAuth(
            $organizationId,
            'jira',
            $conn['external_account_id'],
            array_filter([
                'access_token'  => $access,
                'refresh_token' => $body['refresh_token'] ?? $refreshToken,
            ]),
            ['expires_at' => date('Y-m-d H:i:s', time() + $expiresIn)],
            null
        );

        return [$access, $cloudId];
    }

    private function requireConnection(int $organizationId): array
    {
        $conn = $this->integrations->get($organizationId, 'jira');
        if (!$conn || !$conn['is_enabled'] || empty($conn['secrets']['access_token']) || empty($conn['settings']['cloud_id'])) {
            throw new \RuntimeException('Jira is not connected for this organization.');
        }
        return $conn;
    }
}
