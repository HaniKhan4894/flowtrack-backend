<?php

namespace App\Models;

use CodeIgniter\Model;

class PlatformPaymentModel extends Model
{
    protected $table            = 'platform_payments';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'organization_id', 'plan_id', 'stripe_invoice_id', 'stripe_subscription_id',
        'stripe_customer_id', 'stripe_payment_intent_id', 'invoice_number', 'status',
        'billing_reason', 'billing_cycle', 'amount', 'amount_refunded', 'discount_amount',
        'tax_amount', 'currency', 'seats', 'coupon_code', 'attempt_count', 'failure_code',
        'failure_message', 'card_brand', 'card_last4', 'hosted_invoice_url', 'invoice_pdf_url',
        'period_start', 'period_end', 'paid_at', 'failed_at', 'refunded_at', 'source', 'notes',
    ];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    public function findByStripeInvoice(string $stripeInvoiceId): ?array
    {
        return $this->where('stripe_invoice_id', $stripeInvoiceId)->first();
    }

    /**
     * Insert or update by Stripe invoice id so webhook retries and backfills stay idempotent.
     */
    public function upsertByStripeInvoice(string $stripeInvoiceId, array $data): int
    {
        $existing = $this->findByStripeInvoice($stripeInvoiceId);

        if ($existing) {
            $this->update($existing['id'], $data);

            return (int) $existing['id'];
        }

        $data['stripe_invoice_id'] = $stripeInvoiceId;

        return (int) $this->insert($data, true);
    }
}
