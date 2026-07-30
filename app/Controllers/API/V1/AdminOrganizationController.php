<?php

namespace App\Controllers\API\V1;

use App\Services\Admin\AdminOrganizationService;

/**
 * Cross-tenant organization management (super-admin only).
 */
class AdminOrganizationController extends AdminBaseController
{
    protected AdminOrganizationService $service;

    public function __construct()
    {
        $this->service = new AdminOrganizationService();
    }

    /** GET /api/v1/admin/orgs */
    public function index()
    {
        $filters = $this->queryFilters([
            'search', 'status', 'plan_id', 'subscription_status', 'sort', 'direction', 'page', 'per_page',
        ]);

        $result = $this->service->list($filters);

        return $this->respond([
            'success' => true,
            'data' => $result['data'],
            'pagination' => $result['pagination'],
        ]);
    }

    /** GET /api/v1/admin/orgs/{id} */
    public function show($id = null)
    {
        $detail = $this->service->detail((int) $id);
        if (!$detail) {
            return $this->failNotFound('Organization not found');
        }

        return $this->ok($detail);
    }

    /** PUT /api/v1/admin/orgs/{id} */
    public function update($id = null)
    {
        $data = $this->payload();

        return $this->attempt(
            fn () => $this->service->updateOrganization((int) $id, $data, $this->adminId()),
            'Organization updated'
        );
    }

    /** POST /api/v1/admin/orgs/{id}/suspend */
    public function suspend($id = null)
    {
        $reason = $this->payload()['reason'] ?? null;

        return $this->attempt(
            fn () => $this->service->setActive((int) $id, false, $this->adminId(), $reason),
            'Organization suspended'
        );
    }

    /** POST /api/v1/admin/orgs/{id}/activate */
    public function activate($id = null)
    {
        return $this->attempt(
            fn () => $this->service->setActive((int) $id, true, $this->adminId()),
            'Organization reactivated'
        );
    }

    /** PUT /api/v1/admin/orgs/{id}/plan */
    public function changePlan($id = null)
    {
        $data = $this->payload();
        $planId = (int) ($data['plan_id'] ?? 0);
        if ($planId <= 0) {
            return $this->fail('plan_id is required', 400);
        }

        return $this->attempt(
            fn () => $this->service->changePlan(
                (int) $id,
                $planId,
                $this->adminId(),
                (string) ($data['billing_cycle'] ?? 'monthly'),
                isset($data['status']) ? (string) $data['status'] : null,
                isset($data['reason']) ? (string) $data['reason'] : null
            ),
            'Plan updated'
        );
    }

    /** POST /api/v1/admin/orgs/{id}/extend-trial */
    public function extendTrial($id = null)
    {
        $days = (int) ($this->payload()['days'] ?? 14);

        return $this->attempt(
            fn () => $this->service->extendTrial((int) $id, $days, $this->adminId()),
            'Trial extended'
        );
    }

    /** DELETE /api/v1/admin/orgs/{id} */
    public function delete($id = null)
    {
        $reason = $this->request->getGet('reason') ?? ($this->payload()['reason'] ?? null);

        return $this->attempt(function () use ($id, $reason) {
            $this->service->delete((int) $id, $this->adminId(), $reason ? (string) $reason : null);

            return ['id' => (int) $id, 'deleted' => true];
        }, 'Organization deleted');
    }
}
