<?php

namespace App\Services;

use App\Models\WebhookEndpointModel;
use App\Models\WebhookDeliveryModel;

/**
 * Phase 10 — Outbound signed webhooks.
 *
 * Registers subscriber endpoints and delivers signed JSON payloads when
 * FlowTrack events fire. Each request carries an HMAC-SHA256 signature over the
 * raw body in the `X-FlowTrack-Signature` header so receivers can verify it.
 */
class WebhookService
{
    /** Events an org can subscribe to. */
    public const EVENTS = [
        'time_entry.completed',
        'time_entry.updated',
        'time_entry.deleted',
        'timesheet.submitted',
        'timesheet.approved',
        'invoice.sent',
        'invoice.paid',
    ];

    protected WebhookEndpointModel $endpoints;
    protected WebhookDeliveryModel $deliveries;

    public function __construct()
    {
        $this->endpoints = new WebhookEndpointModel();
        $this->deliveries = new WebhookDeliveryModel();
    }

    /**
     * @return array<int, array<string,mixed>>
     */
    public function list(int $organizationId): array
    {
        $rows = $this->endpoints
            ->where('organization_id', $organizationId)
            ->orderBy('created_at', 'DESC')
            ->findAll();

        return array_map(fn ($r) => [
            'id'                => (int) $r['id'],
            'url'               => $r['url'],
            'events'            => $this->decode($r['events']),
            'is_active'         => (bool) $r['is_active'],
            'secret_hint'       => '…' . substr((string) $r['secret'], -4),
            'last_status'       => $r['last_status'] !== null ? (int) $r['last_status'] : null,
            'last_delivered_at' => $r['last_delivered_at'],
            'created_at'        => $r['created_at'],
        ], $rows);
    }

    /**
     * @param array<int,string> $events
     * @return array{id:int, url:string, events:array, secret:string}
     */
    public function create(int $organizationId, int $userId, string $url, array $events): array
    {
        $url = trim($url);
        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            throw new \InvalidArgumentException('A valid https URL is required.');
        }

        $events = array_values(array_intersect($events, self::EVENTS));
        if ($events === []) {
            $events = ['*'];
        }

        $secret = 'whsec_' . bin2hex(random_bytes(16));
        $id = $this->endpoints->insert([
            'organization_id' => $organizationId,
            'url'             => $url,
            'secret'          => $secret,
            'events'          => json_encode($events),
            'is_active'       => 1,
            'created_by'      => $userId,
        ]);

        return ['id' => (int) $id, 'url' => $url, 'events' => $events, 'secret' => $secret];
    }

    public function delete(int $organizationId, int $id): void
    {
        $row = $this->endpoints->find($id);
        if ($row && (int) $row['organization_id'] === $organizationId) {
            $this->endpoints->delete($id);
        }
    }

    /**
     * Send a test event to a single endpoint.
     */
    public function test(int $organizationId, int $id): array
    {
        $row = $this->endpoints->find($id);
        if (!$row || (int) $row['organization_id'] !== $organizationId) {
            throw new \RuntimeException('Webhook endpoint not found.');
        }

        return $this->deliver($row, 'ping', [
            'message'   => 'FlowTrack webhook test',
            'timestamp' => gmdate('c'),
        ]);
    }

    /**
     * Fan a fired event out to every subscribed, active endpoint.
     *
     * @param array<string,mixed> $payload
     */
    public function dispatch(int $organizationId, string $event, array $payload): void
    {
        $rows = $this->endpoints
            ->where('organization_id', $organizationId)
            ->where('is_active', 1)
            ->findAll();

        foreach ($rows as $row) {
            $events = $this->decode($row['events']);
            if (!in_array('*', $events, true) && !in_array($event, $events, true)) {
                continue;
            }
            try {
                $this->deliver($row, $event, $payload);
            } catch (\Throwable $e) {
                log_message('error', 'Webhook delivery failed: ' . $e->getMessage());
            }
        }
    }

    /**
     * @param array<string,mixed> $row
     * @param array<string,mixed> $payload
     * @return array{success:bool, status_code:?int}
     */
    private function deliver(array $row, string $event, array $payload): array
    {
        $body = json_encode([
            'event'           => $event,
            'organization_id' => (int) $row['organization_id'],
            'data'            => $payload,
            'sent_at'         => gmdate('c'),
        ], JSON_UNESCAPED_SLASHES);

        $signature = hash_hmac('sha256', $body, (string) $row['secret']);

        $client = \Config\Services::curlrequest(['timeout' => 12, 'http_errors' => false]);
        $statusCode = null;
        $success = false;
        $snippet = '';

        try {
            $response = $client->post((string) $row['url'], [
                'headers' => [
                    'Content-Type'           => 'application/json',
                    'X-FlowTrack-Event'      => $event,
                    'X-FlowTrack-Signature'  => 'sha256=' . $signature,
                    'User-Agent'             => 'FlowTrack-Webhooks/1.0',
                ],
                'body' => $body,
            ]);
            $statusCode = $response->getStatusCode();
            $success = $statusCode >= 200 && $statusCode < 300;
            $snippet = mb_substr((string) $response->getBody(), 0, 500);
        } catch (\Throwable $e) {
            $snippet = $e->getMessage();
        }

        $this->deliveries->insert([
            'organization_id'  => (int) $row['organization_id'],
            'endpoint_id'      => (int) $row['id'],
            'event'            => $event,
            'payload'          => $body,
            'status_code'      => $statusCode,
            'success'          => $success ? 1 : 0,
            'attempts'         => 1,
            'response_snippet' => $snippet,
        ]);

        $this->endpoints->update((int) $row['id'], [
            'last_status'       => $statusCode,
            'last_delivered_at' => date('Y-m-d H:i:s'),
        ]);

        return ['success' => $success, 'status_code' => $statusCode];
    }

    /**
     * Retry failed deliveries (used by the webhooks:dispatch CLI command).
     */
    public function retryFailed(int $limit = 50): int
    {
        $rows = $this->deliveries
            ->where('success', 0)
            ->where('attempts <', 5)
            ->orderBy('id', 'ASC')
            ->findAll($limit);

        $retried = 0;
        foreach ($rows as $delivery) {
            $endpoint = $this->endpoints->find((int) $delivery['endpoint_id']);
            if (!$endpoint || !$endpoint['is_active']) {
                continue;
            }
            $payload = json_decode((string) $delivery['payload'], true);
            $data = is_array($payload) ? ($payload['data'] ?? []) : [];
            $result = $this->deliver($endpoint, (string) $delivery['event'], is_array($data) ? $data : []);
            $this->deliveries->update((int) $delivery['id'], [
                'attempts' => (int) $delivery['attempts'] + 1,
                'success'  => $result['success'] ? 1 : 0,
            ]);
            $retried++;
        }

        return $retried;
    }

    /**
     * @return array<int,string>
     */
    private function decode(?string $json): array
    {
        $d = $json ? json_decode($json, true) : [];
        return is_array($d) ? $d : [];
    }
}
