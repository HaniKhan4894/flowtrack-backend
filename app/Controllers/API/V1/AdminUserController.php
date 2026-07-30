<?php

namespace App\Controllers\API\V1;

use App\Services\Admin\AdminUserService;
use App\Services\Admin\ImpersonationService;

/**
 * Global user administration and support impersonation (super-admin only).
 */
class AdminUserController extends AdminBaseController
{
    protected AdminUserService $service;

    public function __construct()
    {
        $this->service = new AdminUserService();
    }

    /** GET /api/v1/admin/users */
    public function index()
    {
        $filters = $this->queryFilters([
            'search', 'status', 'role', 'super_admin', 'organization_id', 'sort', 'direction', 'page', 'per_page',
        ]);

        $result = $this->service->list($filters);

        return $this->respond([
            'success' => true,
            'data' => $result['data'],
            'pagination' => $result['pagination'],
        ]);
    }

    /** GET /api/v1/admin/users/{id} */
    public function show($id = null)
    {
        $detail = $this->service->detail((int) $id);
        if (!$detail) {
            return $this->failNotFound('User not found');
        }

        return $this->ok($detail);
    }

    /** POST /api/v1/admin/users/{id}/activate */
    public function activate($id = null)
    {
        return $this->attempt(
            fn () => $this->service->setActive((int) $id, true, $this->adminId()),
            'User activated'
        );
    }

    /** POST /api/v1/admin/users/{id}/deactivate */
    public function deactivate($id = null)
    {
        return $this->attempt(
            fn () => $this->service->setActive((int) $id, false, $this->adminId()),
            'User deactivated'
        );
    }

    /** PUT /api/v1/admin/users/{id}/super-admin */
    public function setSuperAdmin($id = null)
    {
        $enabled = (bool) ($this->payload()['is_super_admin'] ?? false);

        return $this->attempt(
            fn () => $this->service->setSuperAdmin((int) $id, $enabled, $this->adminId()),
            $enabled ? 'Super-admin access granted' : 'Super-admin access revoked'
        );
    }

    /** POST /api/v1/admin/users/{id}/verify-email */
    public function verifyEmail($id = null)
    {
        return $this->attempt(
            fn () => $this->service->verifyEmail((int) $id, $this->adminId()),
            'Email marked as verified'
        );
    }

    /** POST /api/v1/admin/users/{id}/password-reset */
    public function sendPasswordReset($id = null)
    {
        return $this->attempt(
            fn () => $this->service->sendPasswordReset((int) $id, $this->adminId()),
            'Password reset email sent'
        );
    }

    /** POST /api/v1/admin/users/{id}/revoke-sessions */
    public function revokeSessions($id = null)
    {
        return $this->attempt(
            fn () => $this->service->revokeSessions((int) $id, $this->adminId()),
            'Sessions revoked'
        );
    }

    /** DELETE /api/v1/admin/users/{id} */
    public function delete($id = null)
    {
        $reason = $this->request->getGet('reason');

        return $this->attempt(function () use ($id, $reason) {
            $this->service->delete((int) $id, $this->adminId(), $reason ? (string) $reason : null);

            return ['id' => (int) $id, 'deleted' => true];
        }, 'User deleted');
    }

    /** POST /api/v1/admin/users/{id}/impersonate */
    public function impersonate($id = null)
    {
        $data = $this->payload();

        return $this->attempt(
            fn () => (new ImpersonationService())->start(
                $this->adminId(),
                (int) $id,
                isset($data['organization_id']) ? (int) $data['organization_id'] : null,
                isset($data['reason']) ? (string) $data['reason'] : null
            ),
            'Impersonation session started'
        );
    }

    /** POST /api/v1/admin/impersonation/{sessionId}/stop */
    public function stopImpersonation($sessionId = null)
    {
        return $this->attempt(
            fn () => (new ImpersonationService())->stop((int) $sessionId, $this->adminId()),
            'Impersonation session ended'
        );
    }

    /** GET /api/v1/admin/impersonation */
    public function impersonationHistory()
    {
        return $this->ok((new ImpersonationService())->history((int) ($this->request->getGet('limit') ?? 50)));
    }
}
