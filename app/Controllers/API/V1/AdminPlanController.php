<?php

namespace App\Controllers\API\V1;

use App\Services\Admin\AdminPlanService;

/**
 * Plan catalogue, feature flags, and billing settings (super-admin only).
 */
class AdminPlanController extends AdminBaseController
{
    protected AdminPlanService $service;

    public function __construct()
    {
        $this->service = new AdminPlanService();
    }

    /** GET /api/v1/admin/plans */
    public function index()
    {
        return $this->ok([
            'plans' => $this->service->listPlans(),
            'feature_keys' => $this->service->featureKeys(),
            'billing_settings' => $this->service->getBillingSettings(),
        ]);
    }

    /** POST /api/v1/admin/plans */
    public function create()
    {
        $data = $this->payload();

        return $this->attempt(fn () => $this->service->createPlan($data, $this->adminId()), 'Plan created');
    }

    /** PUT /api/v1/admin/plans/{id} */
    public function update($id = null)
    {
        $data = $this->payload();

        return $this->attempt(fn () => $this->service->updatePlan((int) $id, $data, $this->adminId()), 'Plan updated');
    }

    /** DELETE /api/v1/admin/plans/{id} */
    public function delete($id = null)
    {
        return $this->attempt(function () use ($id) {
            $this->service->deletePlan((int) $id, $this->adminId());

            return ['id' => (int) $id, 'deleted' => true];
        }, 'Plan deleted');
    }

    /** PUT /api/v1/admin/plans/{id}/features */
    public function upsertFeature($id = null)
    {
        $data = $this->payload();

        return $this->attempt(
            fn () => $this->service->upsertFeature((int) $id, $data, $this->adminId()),
            'Feature saved'
        );
    }

    /** DELETE /api/v1/admin/plans/{id}/features/{featureId} */
    public function deleteFeature($id = null, $featureId = null)
    {
        return $this->attempt(function () use ($id, $featureId) {
            $this->service->deleteFeature((int) $id, (int) $featureId, $this->adminId());

            return ['id' => (int) $featureId, 'deleted' => true];
        }, 'Feature removed');
    }

    /** PUT /api/v1/admin/billing-settings */
    public function updateBillingSettings()
    {
        $data = $this->payload();

        return $this->attempt(
            fn () => $this->service->updateBillingSettings($data, $this->adminId()),
            'Billing settings updated'
        );
    }
}
