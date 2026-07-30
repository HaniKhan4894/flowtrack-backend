<?php

namespace App\Services\Admin;

use App\Models\PlatformPaymentModel;
use App\Services\PaymentLedgerService;
use CodeIgniter\Database\BaseConnection;
use Stripe\StripeClient;

/**
 * Payment log, dunning queue and revenue reporting built on the local
 * `platform_payments` ledger.
 */
class AdminPaymentService
{
    use AdminAuditTrail;

    protected BaseConnection $db;
    protected PlatformPaymentModel $payments;
    protected ?StripeClient $stripe = null;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
        $this->payments = new PlatformPaymentModel();
    }

    /**
     * @param array<string, mixed> $filters
     */
    public function list(array $filters = []): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = min(100, max(5, (int) ($filters['per_page'] ?? 25)));

        $builder = $this->db->table('platform_payments p')
            ->select('
                p.id, p.organization_id, p.status, p.amount, p.amount_refunded, p.discount_amount,
                p.currency, p.billing_reason, p.billing_cycle, p.seats, p.coupon_code, p.attempt_count,
                p.failure_code, p.failure_message, p.invoice_number, p.stripe_invoice_id,
                p.stripe_payment_intent_id, p.hosted_invoice_url, p.invoice_pdf_url,
                p.period_start, p.period_end, p.paid_at, p.failed_at, p.refunded_at, p.source,
                p.created_at, o.name AS organization_name, pl.name AS plan_name
            ', false)
            ->join('organizations o', 'o.id = p.organization_id', 'left')
            ->join('plans pl', 'pl.id = p.plan_id', 'left');

        $this->applyFilters($builder, $filters);

        $total = (clone $builder)->countAllResults(false);

        $rows = $builder
            ->orderBy('COALESCE(p.paid_at, p.failed_at, p.created_at)', 'DESC', false)
            ->limit($perPage, ($page - 1) * $perPage)
            ->get()
            ->getResultArray();

        return [
            'data' => array_map([$this, 'present'], $rows),
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / $perPage),
            ],
        ];
    }

    /**
     * @param array<string, mixed> $filters
     */
    public function summary(array $filters = []): array
    {
        $where = '1=1';
        $params = [];

        if (!empty($filters['from'])) {
            $where .= ' AND COALESCE(paid_at, failed_at, created_at) >= ?';
            $params[] = date('Y-m-d 00:00:00', strtotime((string) $filters['from']));
        }

        if (!empty($filters['to'])) {
            $where .= ' AND COALESCE(paid_at, failed_at, created_at) <= ?';
            $params[] = date('Y-m-d 23:59:59', strtotime((string) $filters['to']));
        }

        $row = $this->db->query("
            SELECT
                COALESCE(SUM(CASE WHEN status IN ('paid','partially_refunded') THEN amount ELSE 0 END), 0) AS collected,
                COALESCE(SUM(amount_refunded), 0) AS refunded,
                COALESCE(SUM(CASE WHEN status = 'failed' THEN amount ELSE 0 END), 0) AS failed_amount,
                COALESCE(SUM(discount_amount), 0) AS discounts,
                SUM(CASE WHEN status IN ('paid','partially_refunded') THEN 1 ELSE 0 END) AS paid_count,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
                SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
                COUNT(DISTINCT organization_id) AS paying_orgs
            FROM platform_payments
            WHERE {$where}
        ", $params)->getRowArray() ?: [];

        $collected = round((float) ($row['collected'] ?? 0), 2);
        $refunded = round((float) ($row['refunded'] ?? 0), 2);
        $paidCount = (int) ($row['paid_count'] ?? 0);
        $failedCount = (int) ($row['failed_count'] ?? 0);
        $attempts = $paidCount + $failedCount;

        $lifetime = $this->db->query("
            SELECT COALESCE(SUM(amount - amount_refunded), 0) AS net,
                   COUNT(DISTINCT organization_id) AS orgs
            FROM platform_payments
            WHERE status IN ('paid','partially_refunded')
        ")->getRowArray() ?: [];

        $netLifetime = round((float) ($lifetime['net'] ?? 0), 2);
        $lifetimeOrgs = max(1, (int) ($lifetime['orgs'] ?? 0));

        return [
            'collected' => $collected,
            'refunded' => $refunded,
            'net' => round($collected - $refunded, 2),
            'failed_amount' => round((float) ($row['failed_amount'] ?? 0), 2),
            'discounts' => round((float) ($row['discounts'] ?? 0), 2),
            'paid_count' => $paidCount,
            'failed_count' => $failedCount,
            'open_count' => (int) ($row['open_count'] ?? 0),
            'paying_organizations' => (int) ($row['paying_orgs'] ?? 0),
            'average_invoice' => $paidCount > 0 ? round($collected / $paidCount, 2) : 0.0,
            'payment_success_rate' => $attempts > 0 ? round(($paidCount / $attempts) * 100, 1) : 100.0,
            'lifetime_net' => $netLifetime,
            'average_lifetime_value' => round($netLifetime / $lifetimeOrgs, 2),
        ];
    }

    /**
     * Monthly collected/refunded/net split by new business vs renewals.
     */
    public function revenueReport(int $months = 12): array
    {
        $months = max(3, min(36, $months));

        $trend = $this->db->query("
            SELECT
                DATE_FORMAT(paid_at, '%Y-%m') AS month,
                COALESCE(SUM(amount), 0) AS collected,
                COALESCE(SUM(amount_refunded), 0) AS refunded,
                COALESCE(SUM(discount_amount), 0) AS discounts,
                COALESCE(SUM(CASE WHEN billing_reason IN ('subscription_create','manual') THEN amount ELSE 0 END), 0) AS new_business,
                COALESCE(SUM(CASE WHEN billing_reason = 'subscription_cycle' THEN amount ELSE 0 END), 0) AS renewals,
                COALESCE(SUM(CASE WHEN billing_reason = 'subscription_update' THEN amount ELSE 0 END), 0) AS expansion,
                COUNT(*) AS invoices,
                COUNT(DISTINCT organization_id) AS organizations
            FROM platform_payments
            WHERE status IN ('paid','partially_refunded')
              AND paid_at >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL ? MONTH)
            GROUP BY month
            ORDER BY month ASC
        ", [$months - 1])->getResultArray();

        $failedTrend = $this->db->query("
            SELECT DATE_FORMAT(failed_at, '%Y-%m') AS month,
                   COALESCE(SUM(amount), 0) AS failed_amount,
                   COUNT(*) AS failed_count
            FROM platform_payments
            WHERE status = 'failed'
              AND failed_at >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL ? MONTH)
            GROUP BY month
        ", [$months - 1])->getResultArray();

        $failedByMonth = [];
        foreach ($failedTrend as $row) {
            $failedByMonth[$row['month']] = [
                'failed_amount' => round((float) $row['failed_amount'], 2),
                'failed_count' => (int) $row['failed_count'],
            ];
        }

        $byPlan = $this->db->query("
            SELECT COALESCE(pl.name, 'Unknown') AS plan_name,
                   COALESCE(SUM(p.amount - p.amount_refunded), 0) AS revenue,
                   COUNT(*) AS invoices,
                   COUNT(DISTINCT p.organization_id) AS organizations
            FROM platform_payments p
            LEFT JOIN plans pl ON pl.id = p.plan_id
            WHERE p.status IN ('paid','partially_refunded')
            GROUP BY pl.name
            ORDER BY revenue DESC
        ")->getResultArray();

        $topOrgs = $this->db->query("
            SELECT p.organization_id, o.name AS organization_name,
                   COALESCE(SUM(p.amount - p.amount_refunded), 0) AS lifetime_value,
                   COUNT(*) AS invoices,
                   MAX(p.paid_at) AS last_payment_at
            FROM platform_payments p
            LEFT JOIN organizations o ON o.id = p.organization_id
            WHERE p.status IN ('paid','partially_refunded')
            GROUP BY p.organization_id, o.name
            ORDER BY lifetime_value DESC
            LIMIT 10
        ")->getResultArray();

        $byCurrency = $this->db->query("
            SELECT currency, COALESCE(SUM(amount - amount_refunded), 0) AS revenue, COUNT(*) AS invoices
            FROM platform_payments
            WHERE status IN ('paid','partially_refunded')
            GROUP BY currency
            ORDER BY revenue DESC
        ")->getResultArray();

        return [
            'trend' => array_map(static function (array $row) use ($failedByMonth): array {
                $collected = round((float) $row['collected'], 2);
                $refunded = round((float) $row['refunded'], 2);
                $failed = $failedByMonth[$row['month']] ?? ['failed_amount' => 0.0, 'failed_count' => 0];

                return [
                    'month' => $row['month'],
                    'collected' => $collected,
                    'refunded' => $refunded,
                    'net' => round($collected - $refunded, 2),
                    'discounts' => round((float) $row['discounts'], 2),
                    'new_business' => round((float) $row['new_business'], 2),
                    'renewals' => round((float) $row['renewals'], 2),
                    'expansion' => round((float) $row['expansion'], 2),
                    'invoices' => (int) $row['invoices'],
                    'organizations' => (int) $row['organizations'],
                    'failed_amount' => $failed['failed_amount'],
                    'failed_count' => $failed['failed_count'],
                ];
            }, $trend),
            'by_plan' => array_map(static fn (array $row): array => [
                'plan_name' => $row['plan_name'],
                'revenue' => round((float) $row['revenue'], 2),
                'invoices' => (int) $row['invoices'],
                'organizations' => (int) $row['organizations'],
            ], $byPlan),
            'top_organizations' => array_map(static fn (array $row): array => [
                'organization_id' => $row['organization_id'] === null ? null : (int) $row['organization_id'],
                'organization_name' => $row['organization_name'],
                'lifetime_value' => round((float) $row['lifetime_value'], 2),
                'invoices' => (int) $row['invoices'],
                'last_payment_at' => $row['last_payment_at'],
            ], $topOrgs),
            'by_currency' => array_map(static fn (array $row): array => [
                'currency' => strtoupper((string) $row['currency']),
                'revenue' => round((float) $row['revenue'], 2),
                'invoices' => (int) $row['invoices'],
            ], $byCurrency),
        ];
    }

    /**
     * Accounts with money stuck: failed invoices and past-due subscriptions.
     */
    public function dunningQueue(): array
    {
        $failed = $this->db->query("
            SELECT p.id, p.organization_id, o.name AS organization_name, pl.name AS plan_name,
                   p.amount, p.currency, p.attempt_count, p.failure_message, p.failed_at,
                   p.hosted_invoice_url, p.stripe_invoice_id, os.status AS subscription_status,
                   os.current_period_end,
                   DATEDIFF(NOW(), p.failed_at) AS days_overdue,
                   (SELECT u.email FROM users u WHERE u.id = o.owner_id) AS owner_email
            FROM platform_payments p
            LEFT JOIN organizations o ON o.id = p.organization_id
            LEFT JOIN plans pl ON pl.id = p.plan_id
            LEFT JOIN organization_subscriptions os ON os.organization_id = p.organization_id
            WHERE p.status = 'failed'
              AND NOT EXISTS (
                  SELECT 1 FROM platform_payments later
                  WHERE later.organization_id = p.organization_id
                    AND later.status IN ('paid','partially_refunded')
                    AND later.paid_at > p.failed_at
              )
            ORDER BY p.failed_at DESC
            LIMIT 100
        ")->getResultArray();

        $pastDue = $this->db->query("
            SELECT os.organization_id, o.name AS organization_name, pl.name AS plan_name,
                   os.amount, os.billing_cycle, os.current_period_end,
                   DATEDIFF(NOW(), os.current_period_end) AS days_overdue,
                   (SELECT u.email FROM users u WHERE u.id = o.owner_id) AS owner_email
            FROM organization_subscriptions os
            LEFT JOIN organizations o ON o.id = os.organization_id
            LEFT JOIN plans pl ON pl.id = os.plan_id
            WHERE os.status = 'past_due'
            ORDER BY os.current_period_end ASC
            LIMIT 100
        ")->getResultArray();

        $atRisk = 0.0;
        foreach ($pastDue as $row) {
            $atRisk += ($row['billing_cycle'] ?? 'monthly') === 'yearly'
                ? ((float) $row['amount']) / 12
                : (float) $row['amount'];
        }

        return [
            'failed_invoices' => array_map(static fn (array $row): array => [
                'id' => (int) $row['id'],
                'organization_id' => $row['organization_id'] === null ? null : (int) $row['organization_id'],
                'organization_name' => $row['organization_name'],
                'plan_name' => $row['plan_name'],
                'owner_email' => $row['owner_email'],
                'amount' => round((float) $row['amount'], 2),
                'currency' => strtoupper((string) $row['currency']),
                'attempt_count' => (int) $row['attempt_count'],
                'failure_message' => $row['failure_message'],
                'failed_at' => $row['failed_at'],
                'days_overdue' => (int) $row['days_overdue'],
                'subscription_status' => $row['subscription_status'],
                'hosted_invoice_url' => $row['hosted_invoice_url'],
                'can_retry' => !empty($row['stripe_invoice_id']),
            ], $failed),
            'past_due_subscriptions' => array_map(static fn (array $row): array => [
                'organization_id' => (int) $row['organization_id'],
                'organization_name' => $row['organization_name'],
                'plan_name' => $row['plan_name'],
                'owner_email' => $row['owner_email'],
                'amount' => round((float) $row['amount'], 2),
                'billing_cycle' => $row['billing_cycle'],
                'current_period_end' => $row['current_period_end'],
                'days_overdue' => max(0, (int) $row['days_overdue']),
            ], $pastDue),
            'mrr_at_risk' => round($atRisk, 2),
            'failed_count' => count($failed),
            'past_due_count' => count($pastDue),
        ];
    }

    public function forOrganization(int $organizationId, int $limit = 50): array
    {
        $rows = $this->db->table('platform_payments p')
            ->select('p.*, pl.name AS plan_name', false)
            ->join('plans pl', 'pl.id = p.plan_id', 'left')
            ->where('p.organization_id', $organizationId)
            ->orderBy('COALESCE(p.paid_at, p.failed_at, p.created_at)', 'DESC', false)
            ->limit(max(1, min(200, $limit)))
            ->get()
            ->getResultArray();

        $totals = $this->db->query("
            SELECT COALESCE(SUM(CASE WHEN status IN ('paid','partially_refunded') THEN amount - amount_refunded ELSE 0 END), 0) AS lifetime_value,
                   COALESCE(SUM(amount_refunded), 0) AS refunded,
                   SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
                   MIN(paid_at) AS first_payment_at,
                   MAX(paid_at) AS last_payment_at
            FROM platform_payments
            WHERE organization_id = ?
        ", [$organizationId])->getRowArray() ?: [];

        return [
            'payments' => array_map([$this, 'present'], $rows),
            'totals' => [
                'lifetime_value' => round((float) ($totals['lifetime_value'] ?? 0), 2),
                'refunded' => round((float) ($totals['refunded'] ?? 0), 2),
                'failed_count' => (int) ($totals['failed_count'] ?? 0),
                'first_payment_at' => $totals['first_payment_at'] ?? null,
                'last_payment_at' => $totals['last_payment_at'] ?? null,
            ],
        ];
    }

    /**
     * Ask Stripe to charge a failed invoice again.
     */
    public function retryInvoice(int $paymentId, int $adminUserId): array
    {
        $payment = $this->payments->find($paymentId);
        if (!$payment) {
            throw new \RuntimeException('Payment not found');
        }

        if (empty($payment['stripe_invoice_id'])) {
            throw new \RuntimeException('This payment has no Stripe invoice to retry');
        }

        $invoice = $this->stripe()->invoices->pay((string) $payment['stripe_invoice_id'], []);
        $ledger = new PaymentLedgerService();
        $ledger->recordStripeInvoice($invoice, (int) ($payment['organization_id'] ?? 0) ?: null);

        $this->recordAdminAction(
            $adminUserId,
            'payment.retry',
            'platform_payment',
            $paymentId,
            ['stripe_invoice_id' => $payment['stripe_invoice_id'], 'result' => $invoice->status ?? null],
            $payment['organization_id'] === null ? null : (int) $payment['organization_id']
        );

        return $this->present($this->payments->find($paymentId) ?? $payment);
    }

    /**
     * Refund a captured payment (full or partial) through Stripe.
     */
    public function refund(int $paymentId, ?float $amount, string $reason, int $adminUserId): array
    {
        $payment = $this->payments->find($paymentId);
        if (!$payment) {
            throw new \RuntimeException('Payment not found');
        }

        if (empty($payment['stripe_payment_intent_id'])) {
            throw new \RuntimeException('This payment has no Stripe payment intent to refund');
        }

        $remaining = round((float) $payment['amount'] - (float) $payment['amount_refunded'], 2);
        if ($remaining <= 0) {
            throw new \RuntimeException('This payment is already fully refunded');
        }

        $refundAmount = $amount === null ? $remaining : round(min($amount, $remaining), 2);
        if ($refundAmount <= 0) {
            throw new \RuntimeException('Refund amount must be greater than zero');
        }

        $this->stripe()->refunds->create([
            'payment_intent' => (string) $payment['stripe_payment_intent_id'],
            'amount' => (int) round($refundAmount * 100),
            'metadata' => ['reason' => substr($reason, 0, 200), 'admin_user_id' => (string) $adminUserId],
        ]);

        $totalRefunded = round((float) $payment['amount_refunded'] + $refundAmount, 2);
        $this->payments->update($paymentId, [
            'amount_refunded' => $totalRefunded,
            'status' => $totalRefunded >= (float) $payment['amount'] ? 'refunded' : 'partially_refunded',
            'refunded_at' => date('Y-m-d H:i:s'),
            'notes' => substr($reason, 0, 500),
        ]);

        $this->recordAdminAction(
            $adminUserId,
            'payment.refund',
            'platform_payment',
            $paymentId,
            ['amount' => $refundAmount, 'reason' => $reason],
            $payment['organization_id'] === null ? null : (int) $payment['organization_id']
        );

        return $this->present($this->payments->find($paymentId) ?? $payment);
    }

    /**
     * @param array<string, mixed> $data
     */
    public function recordManual(array $data, int $adminUserId): array
    {
        if ((float) ($data['amount'] ?? 0) <= 0) {
            throw new \RuntimeException('Amount must be greater than zero');
        }

        $ledger = new PaymentLedgerService();
        $paymentId = $ledger->recordManualPayment($data);

        $this->recordAdminAction(
            $adminUserId,
            'payment.manual_record',
            'platform_payment',
            $paymentId,
            ['amount' => (float) $data['amount'], 'reference' => $data['reference'] ?? null],
            isset($data['organization_id']) ? (int) $data['organization_id'] : null
        );

        return $this->present($this->payments->find($paymentId));
    }

    /**
     * @param array<string, mixed> $filters
     * @return list<array<string, mixed>>
     */
    public function exportRows(array $filters = []): array
    {
        $builder = $this->db->table('platform_payments p')
            ->select('
                p.id, o.name AS organization_name, pl.name AS plan_name, p.status, p.amount,
                p.amount_refunded, p.discount_amount, p.currency, p.billing_reason, p.coupon_code,
                p.invoice_number, p.stripe_invoice_id, p.paid_at, p.failed_at, p.created_at
            ', false)
            ->join('organizations o', 'o.id = p.organization_id', 'left')
            ->join('plans pl', 'pl.id = p.plan_id', 'left');

        $this->applyFilters($builder, $filters);

        return $builder
            ->orderBy('COALESCE(p.paid_at, p.failed_at, p.created_at)', 'DESC', false)
            ->limit(5000)
            ->get()
            ->getResultArray();
    }

    private function applyFilters(object $builder, array $filters): void
    {
        if (!empty($filters['status'])) {
            $statuses = is_array($filters['status']) ? $filters['status'] : explode(',', (string) $filters['status']);
            $builder->whereIn('p.status', array_map('trim', $statuses));
        }

        if (!empty($filters['organization_id'])) {
            $builder->where('p.organization_id', (int) $filters['organization_id']);
        }

        if (!empty($filters['plan_id'])) {
            $builder->where('p.plan_id', (int) $filters['plan_id']);
        }

        if (!empty($filters['billing_reason'])) {
            $builder->where('p.billing_reason', (string) $filters['billing_reason']);
        }

        if (!empty($filters['coupon_code'])) {
            $builder->where('p.coupon_code', strtoupper((string) $filters['coupon_code']));
        }

        if (!empty($filters['from'])) {
            $builder->where('COALESCE(p.paid_at, p.failed_at, p.created_at) >=', date('Y-m-d 00:00:00', strtotime((string) $filters['from'])));
        }

        if (!empty($filters['to'])) {
            $builder->where('COALESCE(p.paid_at, p.failed_at, p.created_at) <=', date('Y-m-d 23:59:59', strtotime((string) $filters['to'])));
        }

        if (!empty($filters['min_amount'])) {
            $builder->where('p.amount >=', (float) $filters['min_amount']);
        }

        if (!empty($filters['search'])) {
            $search = trim((string) $filters['search']);
            $builder->groupStart()
                ->like('o.name', $search)
                ->orLike('p.invoice_number', $search)
                ->orLike('p.stripe_invoice_id', $search)
                ->orLike('p.coupon_code', $search)
                ->groupEnd();
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function present(array $row): array
    {
        $amount = round((float) ($row['amount'] ?? 0), 2);
        $refunded = round((float) ($row['amount_refunded'] ?? 0), 2);

        return [
            'id' => (int) $row['id'],
            'organization_id' => isset($row['organization_id']) && $row['organization_id'] !== null ? (int) $row['organization_id'] : null,
            'organization_name' => $row['organization_name'] ?? null,
            'plan_name' => $row['plan_name'] ?? null,
            'status' => $row['status'],
            'amount' => $amount,
            'amount_refunded' => $refunded,
            'net_amount' => round($amount - $refunded, 2),
            'discount_amount' => round((float) ($row['discount_amount'] ?? 0), 2),
            'currency' => strtoupper((string) ($row['currency'] ?? 'usd')),
            'billing_reason' => $row['billing_reason'] ?? null,
            'billing_cycle' => $row['billing_cycle'] ?? null,
            'seats' => isset($row['seats']) && $row['seats'] !== null ? (int) $row['seats'] : null,
            'coupon_code' => $row['coupon_code'] ?? null,
            'attempt_count' => (int) ($row['attempt_count'] ?? 0),
            'failure_code' => $row['failure_code'] ?? null,
            'failure_message' => $row['failure_message'] ?? null,
            'invoice_number' => $row['invoice_number'] ?? null,
            'stripe_invoice_id' => $row['stripe_invoice_id'] ?? null,
            'hosted_invoice_url' => $row['hosted_invoice_url'] ?? null,
            'invoice_pdf_url' => $row['invoice_pdf_url'] ?? null,
            'period_start' => $row['period_start'] ?? null,
            'period_end' => $row['period_end'] ?? null,
            'paid_at' => $row['paid_at'] ?? null,
            'failed_at' => $row['failed_at'] ?? null,
            'refunded_at' => $row['refunded_at'] ?? null,
            'source' => $row['source'] ?? null,
            'can_refund' => !empty($row['stripe_payment_intent_id']) && $amount - $refunded > 0,
            'created_at' => $row['created_at'] ?? null,
        ];
    }

    private function stripe(): StripeClient
    {
        if ($this->stripe === null) {
            $secret = trim((string) (
                env('STRIPE_SECRET_KEY')
                ?? getenv('STRIPE_SECRET_KEY')
                ?? ($_ENV['STRIPE_SECRET_KEY'] ?? '')
            ));

            if ($secret === '') {
                throw new \RuntimeException('Stripe is not configured (STRIPE_SECRET_KEY missing)');
            }

            $this->stripe = new StripeClient($secret);
        }

        return $this->stripe;
    }
}
