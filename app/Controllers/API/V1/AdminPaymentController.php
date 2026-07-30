<?php

namespace App\Controllers\API\V1;

use App\Services\Admin\AdminPaymentService;

/**
 * Platform payment ledger: logs, dunning queue, revenue reports and refunds.
 */
class AdminPaymentController extends AdminBaseController
{
    protected AdminPaymentService $payments;

    public function __construct()
    {
        $this->payments = new AdminPaymentService();
    }

    public function index()
    {
        $filters = $this->queryFilters([
            'page', 'per_page', 'status', 'organization_id', 'plan_id',
            'billing_reason', 'coupon_code', 'from', 'to', 'min_amount', 'search',
        ]);

        return $this->attempt(fn () => $this->payments->list($filters));
    }

    public function summary()
    {
        $filters = $this->queryFilters(['from', 'to']);

        return $this->attempt(fn () => $this->payments->summary($filters));
    }

    public function revenue()
    {
        $months = (int) ($this->request->getGet('months') ?? 12);

        return $this->attempt(fn () => $this->payments->revenueReport($months));
    }

    public function dunning()
    {
        return $this->attempt(fn () => $this->payments->dunningQueue());
    }

    public function forOrganization(int $organizationId)
    {
        $limit = (int) ($this->request->getGet('limit') ?? 50);

        return $this->attempt(fn () => $this->payments->forOrganization($organizationId, $limit));
    }

    public function retry(int $paymentId)
    {
        return $this->attempt(
            fn () => $this->payments->retryInvoice($paymentId, $this->adminId()),
            'Payment retry submitted to Stripe'
        );
    }

    public function refund(int $paymentId)
    {
        $data = $this->payload();
        $amount = isset($data['amount']) && $data['amount'] !== '' ? (float) $data['amount'] : null;
        $reason = (string) ($data['reason'] ?? 'Refunded by platform admin');

        return $this->attempt(
            fn () => $this->payments->refund($paymentId, $amount, $reason, $this->adminId()),
            'Refund issued'
        );
    }

    public function recordManual()
    {
        $data = $this->payload();

        return $this->attempt(
            fn () => $this->payments->recordManual($data, $this->adminId()),
            'Payment recorded'
        );
    }

    /**
     * CSV export of the filtered ledger.
     */
    public function export()
    {
        $filters = $this->queryFilters([
            'status', 'organization_id', 'plan_id', 'billing_reason',
            'coupon_code', 'from', 'to', 'min_amount', 'search',
        ]);

        $rows = $this->payments->exportRows($filters);
        $handle = fopen('php://temp', 'r+');

        fputcsv($handle, [
            'ID', 'Organization', 'Plan', 'Status', 'Amount', 'Refunded', 'Discount',
            'Currency', 'Reason', 'Coupon', 'Invoice #', 'Stripe Invoice', 'Paid At', 'Failed At', 'Created At',
        ]);

        foreach ($rows as $row) {
            fputcsv($handle, array_values($row));
        }

        rewind($handle);
        $csv = (string) stream_get_contents($handle);
        fclose($handle);

        return $this->response
            ->setHeader('Content-Type', 'text/csv')
            ->setHeader('Content-Disposition', 'attachment; filename="platform-payments-' . date('Y-m-d') . '.csv"')
            ->setBody($csv);
    }
}
