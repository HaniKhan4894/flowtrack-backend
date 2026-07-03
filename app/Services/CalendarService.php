<?php

namespace App\Services;

use Config\OAuth as OAuthConfig;

/**
 * Phase 8 — Calendar integration.
 *
 * Reads a connected organization's calendar (Google Calendar or Microsoft 365 /
 * Outlook via Graph) so meetings can be turned into billable time entries and
 * fed to Autopilot. Handles automatic access-token refresh for both providers.
 */
class CalendarService
{
    /** Preferred order when more than one calendar is connected. */
    private const PROVIDERS = ['google_calendar', 'microsoft'];

    protected IntegrationService $integrations;
    protected TimezoneService $tz;
    protected OAuthConfig $oauth;

    public function __construct()
    {
        $this->integrations = new IntegrationService();
        $this->tz = new TimezoneService();
        $this->oauth = new OAuthConfig();
    }

    /**
     * Which calendar provider is connected & enabled (if any).
     */
    public function connectedProvider(int $organizationId): ?string
    {
        foreach (self::PROVIDERS as $provider) {
            $conn = $this->integrations->get($organizationId, $provider);
            if ($conn && $conn['is_enabled'] && !empty($conn['secrets']['access_token'])) {
                return $provider;
            }
        }
        return null;
    }

    public function isConnected(int $organizationId): bool
    {
        return $this->connectedProvider($organizationId) !== null;
    }

    /**
     * Calendar events for a given local day.
     *
     * @return array{provider:string, account:?string, events:array<int,array>}
     */
    public function eventsForDay(int $organizationId, string $date): array
    {
        $provider = $this->connectedProvider($organizationId);
        if ($provider === null) {
            return ['provider' => '', 'account' => null, 'events' => []];
        }

        $phpTz = $this->tz->getOrgTimezone($organizationId);
        [$startUtc, $endUtc] = $this->tz->dateRangeUtc($date, $date, $phpTz);
        $startIso = gmdate('Y-m-d\TH:i:s\Z', strtotime($startUtc));
        $endIso = gmdate('Y-m-d\TH:i:s\Z', strtotime($endUtc));

        $conn = $this->integrations->get($organizationId, $provider);
        $account = $conn['settings']['account_email'] ?? ($conn['settings']['account_name'] ?? null);

        $events = $provider === 'google_calendar'
            ? $this->googleEvents($organizationId, $startIso, $endIso, $phpTz)
            : $this->microsoftEvents($organizationId, $startIso, $endIso, $phpTz);

        return ['provider' => $provider, 'account' => $account, 'events' => $events];
    }

    /**
     * @return array<int, array{id:string, title:string, start_local:?string, end_local:?string, started_at:?string, ended_at:?string, minutes:int, attendees:int, organizer:?string, all_day:bool}>
     */
    private function googleEvents(int $organizationId, string $startIso, string $endIso, string $phpTz): array
    {
        $body = $this->request($organizationId, 'google_calendar', 'get', '/calendars/primary/events', [
            'query' => [
                'timeMin'      => $startIso,
                'timeMax'      => $endIso,
                'singleEvents' => 'true',
                'orderBy'      => 'startTime',
                'maxResults'   => 50,
            ],
        ]);

        $out = [];
        foreach ($body['items'] ?? [] as $item) {
            if (($item['status'] ?? '') === 'cancelled') {
                continue;
            }
            $allDay = isset($item['start']['date']) && !isset($item['start']['dateTime']);
            $startUtc = $this->toUtcString($item['start']['dateTime'] ?? ($item['start']['date'] ?? null));
            $endUtc = $this->toUtcString($item['end']['dateTime'] ?? ($item['end']['date'] ?? null));

            $out[] = $this->normalizeEvent(
                (string) ($item['id'] ?? ''),
                (string) ($item['summary'] ?? '(no title)'),
                $startUtc,
                $endUtc,
                is_array($item['attendees'] ?? null) ? count($item['attendees']) : 0,
                $item['organizer']['email'] ?? null,
                $allDay,
                $phpTz
            );
        }
        return $out;
    }

    /**
     * @return array<int, array>
     */
    private function microsoftEvents(int $organizationId, string $startIso, string $endIso, string $phpTz): array
    {
        $body = $this->request($organizationId, 'microsoft', 'get', '/me/calendarView', [
            'headers' => ['Prefer' => 'outlook.timezone="UTC"'],
            'query' => [
                'startDateTime' => $startIso,
                'endDateTime'   => $endIso,
                '$orderby'      => 'start/dateTime',
                '$top'          => 50,
            ],
        ]);

        $out = [];
        foreach ($body['value'] ?? [] as $item) {
            $startUtc = $this->toUtcString($item['start']['dateTime'] ?? null);
            $endUtc = $this->toUtcString($item['end']['dateTime'] ?? null);

            $out[] = $this->normalizeEvent(
                (string) ($item['id'] ?? ''),
                (string) ($item['subject'] ?? '(no title)'),
                $startUtc,
                $endUtc,
                is_array($item['attendees'] ?? null) ? count($item['attendees']) : 0,
                $item['organizer']['emailAddress']['address'] ?? null,
                (bool) ($item['isAllDay'] ?? false),
                $phpTz
            );
        }
        return $out;
    }

    /**
     * @return array<string,mixed>
     */
    private function normalizeEvent(string $id, string $title, ?string $startUtc, ?string $endUtc, int $attendees, ?string $organizer, bool $allDay, string $phpTz): array
    {
        $minutes = 0;
        if ($startUtc && $endUtc) {
            $minutes = (int) round((strtotime($endUtc) - strtotime($startUtc)) / 60);
            $minutes = max(0, $minutes);
        }

        return [
            'id'          => $id,
            'title'       => mb_substr($title, 0, 300),
            'start_local' => $startUtc ? $this->tz->toOrgLocal($startUtc, $phpTz) : null,
            'end_local'   => $endUtc ? $this->tz->toOrgLocal($endUtc, $phpTz) : null,
            'started_at'  => $startUtc,
            'ended_at'    => $endUtc,
            'minutes'     => $minutes,
            'attendees'   => $attendees,
            'organizer'   => $organizer,
            'all_day'     => $allDay,
        ];
    }

    private function toUtcString(?string $iso): ?string
    {
        if (!$iso) {
            return null;
        }
        $ts = strtotime($iso);
        return $ts ? gmdate('Y-m-d H:i:s', $ts) : null;
    }

    /**
     * Authenticated Graph/Google API call, refreshing the token on 401.
     *
     * @param array<string,mixed> $options
     * @return array<string,mixed>
     */
    private function request(int $organizationId, string $provider, string $method, string $path, array $options = [], bool $retry = true): array
    {
        $token = $this->accessToken($organizationId, $provider);
        $cfg = $this->oauth->provider($provider);
        $url = rtrim((string) $cfg['api_base'], '/') . $path;

        $client = \Config\Services::curlrequest(['timeout' => 25, 'http_errors' => false]);
        $options['headers'] = array_merge([
            'Authorization' => 'Bearer ' . $token,
            'Accept'        => 'application/json',
        ], $options['headers'] ?? []);

        $response = $client->request(strtoupper($method), $url, $options);
        $status = $response->getStatusCode();

        if ($status === 401 && $retry) {
            $this->refresh($organizationId, $provider);
            return $this->request($organizationId, $provider, $method, $path, $options, false);
        }

        $raw = (string) $response->getBody();
        $body = $raw !== '' ? json_decode($raw, true) : [];

        if ($status >= 400) {
            $msg = is_array($body) ? ($body['error']['message'] ?? ($body['error_description'] ?? null)) : null;
            throw new \RuntimeException($msg ? ('Calendar error: ' . $msg) : 'Calendar request failed (' . $status . ').');
        }

        return is_array($body) ? $body : [];
    }

    private function accessToken(int $organizationId, string $provider): string
    {
        $conn = $this->requireConnection($organizationId, $provider);
        $expiresAt = $conn['settings']['expires_at'] ?? null;

        if ($expiresAt && strtotime((string) $expiresAt) <= time() + 60 && !empty($conn['secrets']['refresh_token'])) {
            return $this->refresh($organizationId, $provider);
        }

        return (string) $conn['secrets']['access_token'];
    }

    private function refresh(int $organizationId, string $provider): string
    {
        $conn = $this->requireConnection($organizationId, $provider);
        $refreshToken = $conn['secrets']['refresh_token'] ?? null;
        if (!$refreshToken) {
            throw new \RuntimeException('Calendar session expired. Please reconnect in Settings → Integrations.');
        }

        $cfg = $this->oauth->provider($provider);
        $client = \Config\Services::curlrequest(['timeout' => 20, 'http_errors' => false]);

        $response = $client->post($cfg['token_url'], [
            'headers' => ['Accept' => 'application/json'],
            'form_params' => array_filter([
                'grant_type'    => 'refresh_token',
                'client_id'     => $cfg['client_id'],
                'client_secret' => $cfg['client_secret'],
                'refresh_token' => $refreshToken,
                'scope'         => $provider === 'microsoft' ? $cfg['scope'] : null,
            ], fn ($v) => $v !== null),
        ]);

        $body = json_decode((string) $response->getBody(), true);
        if (!is_array($body) || empty($body['access_token'])) {
            throw new \RuntimeException('Calendar session expired. Please reconnect in Settings → Integrations.');
        }

        $access = (string) $body['access_token'];
        $expiresIn = (int) ($body['expires_in'] ?? 3600);

        $this->integrations->saveOAuth(
            $organizationId,
            $provider,
            $conn['external_account_id'],
            array_filter([
                'access_token'  => $access,
                'refresh_token' => $body['refresh_token'] ?? $refreshToken,
            ]),
            ['expires_at' => date('Y-m-d H:i:s', time() + $expiresIn)],
            null
        );

        return $access;
    }

    private function requireConnection(int $organizationId, string $provider): array
    {
        $conn = $this->integrations->get($organizationId, $provider);
        if (!$conn || !$conn['is_enabled'] || empty($conn['secrets']['access_token'])) {
            throw new \RuntimeException('Calendar is not connected for this organization.');
        }
        return $conn;
    }
}
