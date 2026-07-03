<?php

namespace App\Services;

/**
 * Phase 10 — Central event bus.
 *
 * A single choke-point that fans FlowTrack domain events out to the platform's
 * outbound integrations: signed webhooks and the automations engine. Always
 * best-effort so a failing subscriber can never break the core action that
 * emitted the event.
 */
class EventBus
{
    /**
     * @param array<string,mixed> $payload
     */
    public static function emit(int $organizationId, string $event, array $payload): void
    {
        if ($organizationId <= 0) {
            return;
        }

        try {
            (new WebhookService())->dispatch($organizationId, $event, $payload);
        } catch (\Throwable $e) {
            log_message('error', 'EventBus webhook dispatch failed: ' . $e->getMessage());
        }

        try {
            (new AutomationService())->handle($organizationId, $event, $payload);
        } catch (\Throwable $e) {
            log_message('error', 'EventBus automation handling failed: ' . $e->getMessage());
        }
    }
}
