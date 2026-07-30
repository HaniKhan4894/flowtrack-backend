<?php

namespace App\Controllers\API\V1;

use App\Services\Admin\AdminBillingService;

/**
 * Subscription, revenue, and invoice reporting (super-admin only).
 */
class AdminBillingController extends AdminBaseController
{
    protected AdminBillingService $service;

    public function __construct()
    {
        $this->service = new AdminBillingService();
    }

    /** GET /api/v1/admin/subscriptions */
    public function subscriptions()
    {
        $filters = $this->queryFilters([
            'search', 'status', 'plan_id', 'billing_cycle', 'stripe', 'sort', 'direction', 'page', 'per_page',
        ]);

        $result = $this->service->listSubscriptions($filters);

        return $this->respond([
            'success' => true,
            'data' => $result['data'],
            'pagination' => $result['pagination'],
            'summary' => $result['summary'],
        ]);
    }

    /** PUT /api/v1/admin/subscriptions/{id}/status */
    public function updateStatus($id = null)
    {
        $data = $this->payload();
        $status = (string) ($data['status'] ?? '');

        return $this->attempt(
            fn () => $this->service->updateSubscriptionStatus(
                (int) $id,
                $status,
                $this->adminId(),
                isset($data['reason']) ? (string) $data['reason'] : null
            ),
            'Subscription status updated'
        );
    }

    /** GET /api/v1/admin/revenue/trend?months=12 */
    public function revenueTrend()
    {
        return $this->ok($this->service->getRevenueTrend((int) ($this->request->getGet('months') ?? 12)));
    }

    /** GET /api/v1/admin/invoices */
    public function invoices()
    {
        $filters = $this->queryFilters(['search', 'status', 'organization_id', 'page', 'per_page']);
        $result = $this->service->listInvoices($filters);

        return $this->respond([
            'success' => true,
            'data' => $result['data'],
            'pagination' => $result['pagination'],
            'totals_by_status' => $result['totals_by_status'],
        ]);
    }
}
