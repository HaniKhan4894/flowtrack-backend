<?php

namespace App\Services;

use App\Models\MarketingCampaignSendModel;
use App\Models\PlatformCouponModel;
use App\Models\PlatformPaymentModel;

/**
 * Keeps a local, queryable ledger of every platform charge.
 *
 * Stripe remains the source of truth; this table exists so the admin portal can
 * report on revenue, refunds and dunning without hitting the Stripe API on every
 * page load. Everything is keyed on the Stripe invoice id so webhook retries and
 * backfills converge on the same row.
 */
class PaymentLedgerService
{
    protected PlatformPaymentModel $payments;
    protected PlatformCouponModel $coupons;
    protected $db;

    public function __construct()
    {
        $this->payments = new PlatformPaymentModel();
        $this->coupons = new PlatformCouponModel();
        $this->db = \Config\Database::connect();
    }

    public function recordStripeInvoice(object $invoice, ?int $organizationId = null, string $source = 'stripe_webhook'): ?int
    {
        $invoiceId = (string) ($invoice->id ?? '');
        if ($invoiceId === '') {
            return null;
        }

        $subscriptionId = $this->extractSubscriptionId($invoice);
        $customerId = $this->extractCustomerId($invoice);
        $context = $this->resolveContext($organizationId, $subscriptionId, $customerId);

        $status = $this->mapInvoiceStatus($invoice);
        $paidAt = $this->timestampToDate($invoice->status_transitions->paid_at ?? null);
        $amountPaid = $this->fromMinorUnits($invoice->amount_paid ?? null);
        $total = $this->fromMinorUnits($invoice->total ?? null);

        $payload = [
            'organization_id' => $context['organization_id'],
            'plan_id' => $context['plan_id'],
            'stripe_subscription_id' => $subscriptionId,
            'stripe_customer_id' => $customerId,
            'stripe_payment_intent_id' => $this->stringOrNull($invoice->payment_intent ?? null),
            'invoice_number' => $this->stringOrNull($invoice->number ?? null),
            'status' => $status,
            'billing_reason' => $this->stringOrNull($invoice->billing_reason ?? null),
            'billing_cycle' => $context['billing_cycle'],
            'amount' => $status === 'paid' && $amountPaid > 0 ? $amountPaid : $total,
            'discount_amount' => $this->extractDiscountAmount($invoice),
            'tax_amount' => $this->fromMinorUnits($invoice->tax ?? null),
            'currency' => strtolower((string) ($invoice->currency ?? 'usd')),
            'seats' => $context['seats'],
            'coupon_code' => $this->extractCouponCode($invoice),
            'attempt_count' => (int) ($invoice->attempt_count ?? 0),
            'hosted_invoice_url' => $this->stringOrNull($invoice->hosted_invoice_url ?? null),
            'invoice_pdf_url' => $this->stringOrNull($invoice->invoice_pdf ?? null),
            'period_start' => $this->timestampToDate($invoice->period_start ?? null),
            'period_end' => $this->timestampToDate($invoice->period_end ?? null),
            'paid_at' => $paidAt,
            'source' => $source,
        ];

        $paymentId = $this->payments->upsertByStripeInvoice($invoiceId, $payload);

        if ($status === 'paid') {
            $this->recordCouponRedemption($invoiceId, $payload, $context);
            $this->attributeConversion(
                $context['organization_id'],
                (float) $payload['amount'],
                $paidAt ?? date('Y-m-d H:i:s')
            );
        }

        return $paymentId;
    }

    public function markInvoiceFailed(object $invoice, ?int $organizationId = null): ?int
    {
        $invoiceId = (string) ($invoice->id ?? '');
        if ($invoiceId === '') {
            return null;
        }

        $subscriptionId = $this->extractSubscriptionId($invoice);
        $customerId = $this->extractCustomerId($invoice);
        $context = $this->resolveContext($organizationId, $subscriptionId, $customerId);
        $failure = $this->extractFailure($invoice);

        return $this->payments->upsertByStripeInvoice($invoiceId, [
            'organization_id' => $context['organization_id'],
            'plan_id' => $context['plan_id'],
            'stripe_subscription_id' => $subscriptionId,
            'stripe_customer_id' => $customerId,
            'stripe_payment_intent_id' => $this->stringOrNull($invoice->payment_intent ?? null),
            'invoice_number' => $this->stringOrNull($invoice->number ?? null),
            'status' => 'failed',
            'billing_reason' => $this->stringOrNull($invoice->billing_reason ?? null),
            'billing_cycle' => $context['billing_cycle'],
            'amount' => $this->fromMinorUnits($invoice->amount_due ?? $invoice->total ?? null),
            'currency' => strtolower((string) ($invoice->currency ?? 'usd')),
            'attempt_count' => (int) ($invoice->attempt_count ?? 0),
            'failure_code' => $failure['code'],
            'failure_message' => $failure['message'],
            'hosted_invoice_url' => $this->stringOrNull($invoice->hosted_invoice_url ?? null),
            'period_start' => $this->timestampToDate($invoice->period_start ?? null),
            'period_end' => $this->timestampToDate($invoice->period_end ?? null),
            'failed_at' => date('Y-m-d H:i:s'),
        ]);
    }

    /**
     * `charge.refunded` carries the invoice id, so refunds land on the original ledger row.
     */
    public function recordRefundFromCharge(object $charge): ?int
    {
        $invoiceId = $this->stringOrNull($charge->invoice ?? null);
        if ($invoiceId === null) {
            return null;
        }

        $existing = $this->payments->findByStripeInvoice($invoiceId);
        if (!$existing) {
            return null;
        }

        $refunded = $this->fromMinorUnits($charge->amount_refunded ?? null);
        $amount = (float) $existing['amount'];
        $status = $refunded > 0 && $refunded < $amount ? 'partially_refunded' : 'refunded';

        $this->payments->update($existing['id'], [
            'amount_refunded' => $refunded,
            'status' => $status,
            'refunded_at' => date('Y-m-d H:i:s'),
            'card_brand' => $this->stringOrNull($charge->payment_method_details->card->brand ?? null),
            'card_last4' => $this->stringOrNull($charge->payment_method_details->card->last4 ?? null),
        ]);

        return (int) $existing['id'];
    }

    /**
     * Manual/offline payment entered by an admin (bank transfer, comped invoice, etc).
     */
    public function recordManualPayment(array $data): int
    {
        $organizationId = (int) ($data['organization_id'] ?? 0);
        $context = $this->resolveContext($organizationId, null, null);

        return (int) $this->payments->insert([
            'organization_id' => $organizationId ?: null,
            'plan_id' => $context['plan_id'],
            'stripe_invoice_id' => null,
            'invoice_number' => $data['reference'] ?? null,
            'status' => in_array($data['status'] ?? 'paid', ['paid', 'refunded', 'failed', 'void'], true)
                ? $data['status']
                : 'paid',
            'billing_reason' => 'manual',
            'billing_cycle' => $context['billing_cycle'],
            'amount' => round((float) ($data['amount'] ?? 0), 2),
            'currency' => strtolower((string) ($data['currency'] ?? 'usd')),
            'paid_at' => $data['paid_at'] ?? date('Y-m-d H:i:s'),
            'source' => 'manual',
            'notes' => $data['notes'] ?? null,
        ], true);
    }

    /**
     * Credit a payment back to any campaign that emailed this org inside its
     * attribution window and has not already been credited for that send.
     */
    public function attributeConversion(?int $organizationId, float $amount, string $when): void
    {
        if (!$organizationId || $amount <= 0) {
            return;
        }

        $sends = $this->db->table('marketing_campaign_sends s')
            ->select('s.id, s.campaign_id, c.attribution_days')
            ->join('marketing_campaigns c', 'c.id = s.campaign_id')
            ->where('s.organization_id', $organizationId)
            ->where('s.status', 'sent')
            ->where('s.converted_at IS NULL', null, false)
            ->where('s.sent_at IS NOT NULL', null, false)
            ->where('s.sent_at <=', $when)
            ->orderBy('s.sent_at', 'DESC')
            ->get()
            ->getResultArray();

        if (!$sends) {
            return;
        }

        $sendModel = new MarketingCampaignSendModel();

        foreach ($sends as $send) {
            $window = max(1, (int) ($send['attribution_days'] ?? 30));
            $deadline = date('Y-m-d H:i:s', strtotime($when) - ($window * 86400));

            $inWindow = $this->db->table('marketing_campaign_sends')
                ->where('id', $send['id'])
                ->where('sent_at >=', $deadline)
                ->countAllResults() > 0;

            if (!$inWindow) {
                continue;
            }

            $sendModel->update($send['id'], [
                'converted_at' => $when,
                'conversion_amount' => $amount,
            ]);

            $this->db->query(
                'UPDATE marketing_campaigns
                 SET total_converted = total_converted + 1,
                     converted_revenue = converted_revenue + ?
                 WHERE id = ?',
                [$amount, $send['campaign_id']]
            );

            // Credit the most recent touch only, so revenue is not double counted.
            break;
        }
    }

    private function recordCouponRedemption(string $invoiceId, array $payload, array $context): void
    {
        $code = $payload['coupon_code'] ?? null;
        $discount = (float) ($payload['discount_amount'] ?? 0);

        if ($code === null || $discount <= 0) {
            return;
        }

        $coupon = $this->coupons->findByCode($code);
        if (!$coupon) {
            return;
        }

        $already = $this->db->table('platform_coupon_redemptions')
            ->where('coupon_id', $coupon['id'])
            ->where('stripe_invoice_id', $invoiceId)
            ->countAllResults() > 0;

        if ($already) {
            return;
        }

        $this->db->table('platform_coupon_redemptions')->insert([
            'coupon_id' => $coupon['id'],
            'organization_id' => $context['organization_id'],
            'stripe_invoice_id' => $invoiceId,
            'amount_discounted' => $discount,
            'created_at' => date('Y-m-d H:i:s'),
        ]);

        $this->db->query(
            'UPDATE platform_coupons SET redemption_count = redemption_count + 1 WHERE id = ?',
            [$coupon['id']]
        );
    }

    /**
     * @return array{organization_id: int|null, plan_id: int|null, billing_cycle: string|null, seats: int|null}
     */
    private function resolveContext(?int $organizationId, ?string $subscriptionId, ?string $customerId): array
    {
        $builder = $this->db->table('organization_subscriptions')
            ->select('organization_id, plan_id, billing_cycle, user_count')
            ->orderBy('id', 'DESC')
            ->limit(1);

        if ($subscriptionId) {
            $row = (clone $builder)->where('stripe_subscription_id', $subscriptionId)->get()->getRowArray();
        } else {
            $row = null;
        }

        if (!$row && $customerId) {
            $row = (clone $builder)->where('stripe_customer_id', $customerId)->get()->getRowArray();
        }

        if (!$row && $organizationId) {
            $row = (clone $builder)->where('organization_id', $organizationId)->get()->getRowArray();
        }

        return [
            'organization_id' => $organizationId ?: (isset($row['organization_id']) ? (int) $row['organization_id'] : null),
            'plan_id' => isset($row['plan_id']) ? (int) $row['plan_id'] : null,
            'billing_cycle' => $row['billing_cycle'] ?? null,
            'seats' => isset($row['user_count']) ? (int) $row['user_count'] : null,
        ];
    }

    private function mapInvoiceStatus(object $invoice): string
    {
        return match ((string) ($invoice->status ?? '')) {
            'paid' => 'paid',
            'open', 'draft' => 'open',
            'void' => 'void',
            'uncollectible' => 'uncollectible',
            default => (int) ($invoice->amount_paid ?? 0) > 0 ? 'paid' : 'open',
        };
    }

    private function extractSubscriptionId(object $invoice): ?string
    {
        // Stripe moved the subscription pointer under `parent` in newer API versions.
        return $this->stringOrNull($invoice->subscription ?? null)
            ?? $this->stringOrNull($invoice->parent->subscription_details->subscription ?? null)
            ?? $this->stringOrNull($invoice->lines->data[0]->subscription ?? null);
    }

    private function extractCustomerId(object $invoice): ?string
    {
        return $this->stringOrNull($invoice->customer ?? null);
    }

    private function extractDiscountAmount(object $invoice): float
    {
        $total = 0.0;

        foreach ((array) ($invoice->total_discount_amounts ?? []) as $entry) {
            $total += $this->fromMinorUnits(is_object($entry) ? ($entry->amount ?? 0) : ($entry['amount'] ?? 0));
        }

        return round($total, 2);
    }

    private function extractCouponCode(object $invoice): ?string
    {
        $candidates = [
            $invoice->discount->promotion_code->code ?? null,
            $invoice->discount->coupon->name ?? null,
            $invoice->discount->coupon->id ?? null,
        ];

        foreach ($candidates as $candidate) {
            if (is_string($candidate) && $candidate !== '') {
                return strtoupper($candidate);
            }
        }

        foreach ((array) ($invoice->discounts ?? []) as $discount) {
            $code = $discount->promotion_code->code ?? ($discount->coupon->id ?? null);
            if (is_string($code) && $code !== '') {
                return strtoupper($code);
            }
        }

        return null;
    }

    /**
     * @return array{code: string|null, message: string|null}
     */
    private function extractFailure(object $invoice): array
    {
        $error = $invoice->last_finalization_error ?? null;
        $code = $error->code ?? ($invoice->payment_intent->last_payment_error->code ?? null);
        $message = $error->message ?? ($invoice->payment_intent->last_payment_error->message ?? null);

        return [
            'code' => is_string($code) ? substr($code, 0, 100) : null,
            'message' => is_string($message) ? substr($message, 0, 500) : 'Card payment failed',
        ];
    }

    private function fromMinorUnits(mixed $value): float
    {
        if ($value === null || $value === '') {
            return 0.0;
        }

        return round(((float) $value) / 100, 2);
    }

    private function timestampToDate(mixed $timestamp): ?string
    {
        if (!$timestamp || (int) $timestamp <= 0) {
            return null;
        }

        return date('Y-m-d H:i:s', (int) $timestamp);
    }

    private function stringOrNull(mixed $value): ?string
    {
        if (is_string($value) && $value !== '') {
            return $value;
        }

        if (is_object($value) && isset($value->id) && is_string($value->id)) {
            return $value->id;
        }

        return null;
    }
}
