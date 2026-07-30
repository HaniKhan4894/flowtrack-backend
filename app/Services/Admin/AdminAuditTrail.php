<?php

namespace App\Services\Admin;

use App\Services\AuditService;

/**
 * Shared audit helper for platform-admin services.
 *
 * Platform actions are stored in the same `audit_logs` table used by
 * organizations, prefixed with `platform.` so they can be filtered apart.
 */
trait AdminAuditTrail
{
    protected function auditTrail(): AuditService
    {
        static $service = null;
        if ($service === null) {
            $service = new AuditService();
        }

        return $service;
    }

    /**
     * @param array<string, mixed>|null $changes
     */
    protected function recordAdminAction(
        int $adminUserId,
        string $action,
        ?string $entityType = null,
        ?int $entityId = null,
        ?array $changes = null,
        ?int $organizationId = null
    ): void {
        try {
            $this->auditTrail()->log(
                $organizationId,
                $adminUserId,
                'platform.' . $action,
                $entityType,
                $entityId,
                $changes,
                $this->currentIpAddress()
            );
        } catch (\Throwable $e) {
            // Never let audit failures break the admin action itself.
            log_message('error', 'Platform audit log failed: ' . $e->getMessage());
        }
    }

    protected function currentIpAddress(): ?string
    {
        try {
            return service('request')->getIPAddress();
        } catch (\Throwable $e) {
            return null;
        }
    }
}
