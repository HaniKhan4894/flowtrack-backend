<?php

namespace App\Models;

use CodeIgniter\Model;

class SubscriptionModel extends Model
{
    protected $table            = 'organization_subscriptions';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'organization_id', 'plan_id', 'billing_cycle', 'status',
        'trial_ends_at', 'current_period_start', 'current_period_end',
        'cancel_at_period_end', 'cancelled_at', 'stripe_subscription_id', 'stripe_customer_id'
    ];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    /**
     * Get active subscription for organization
     */
    public function getActiveSubscription(int $organizationId): ?array
    {
        $subscription = $this->where('organization_id', $organizationId)
            ->whereIn('status', ['trial', 'active'])
            ->first();

        if (!$subscription) {
            return null;
        }

        // Join with plan data
        $subscription['plan'] = $this->db->table('plans')
            ->where('id', $subscription['plan_id'])
            ->get()
            ->getRowArray();

        return $subscription;
    }

    /**
     * Check if subscription is active
     */
    public function isActive(int $organizationId): bool
    {
        $count = $this->where('organization_id', $organizationId)
            ->whereIn('status', ['trial', 'active'])
            ->where('current_period_end >=', date('Y-m-d H:i:s'))
            ->countAllResults();

        return $count > 0;
    }

    /**
     * Check if in trial period
     */
    public function isInTrial(int $organizationId): bool
    {
        $count = $this->where('organization_id', $organizationId)
            ->where('status', 'trial')
            ->where('trial_ends_at >=', date('Y-m-d H:i:s'))
            ->countAllResults();

        return $count > 0;
    }
}
