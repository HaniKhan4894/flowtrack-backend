<?php

namespace App\Models;

use CodeIgniter\Model;

class PlanModel extends Model
{
    protected $table            = 'plans';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'name',
        'slug',
        'description',
        'price_monthly',
        'price_yearly',
        'pricing_model',
        'base_price',
        'price_per_user',
        'min_users',
        'max_users',
        'trial_days',
        'is_active',
        'is_popular',
        'sort_order',
        'stripe_price_id_monthly',
        'stripe_price_id_yearly',
        'stripe_base_price_id_monthly',
        'stripe_base_price_id_yearly',
    ];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    protected array $casts = [
        'is_active'  => 'boolean',
        'is_popular' => 'boolean',
    ];

    /**
     * Get all active plans
     */
    public function getActivePlans(): array
    {
        return $this->where('is_active', true)
            ->orderBy('sort_order', 'ASC')
            ->findAll();
    }

    /**
     * Get plan with features
     */
    public function getPlanWithFeatures(int $planId): ?array
    {
        $plan = $this->find($planId);
        
        if (!$plan) {
            return null;
        }

        $plan['features'] = $this->db->table('plan_features')
            ->where('plan_id', $planId)
            ->orderBy('feature_key', 'ASC')
            ->get()
            ->getResultArray();

        return $plan;
    }

    /**
     * Get plan by slug
     */
    public function getPlanBySlug(string $slug): ?array
    {
        return $this->where('slug', $slug)->first();
    }

    /**
     * Get feature value for plan
     */
    public function getFeatureValue(int $planId, string $featureKey): ?string
    {
        $feature = $this->db->table('plan_features')
            ->where('plan_id', $planId)
            ->where('feature_key', $featureKey)
            ->where('is_enabled', 1)
            ->get()
            ->getRowArray();

        return $feature ? $feature['feature_value'] : null;
    }

    public function getPricingFeatures(int $planId): array
    {
        return $this->db->table('plan_features')
            ->where('plan_id', $planId)
            ->where('is_enabled', 1)
            ->where('show_on_pricing', 1)
            ->orderBy('sort_order', 'ASC')
            ->orderBy('id', 'ASC')
            ->get()
            ->getResultArray();
    }

    /**
     * Attach pricing features and align max_users display with plans.max_users column.
     */
    public function enrichPlanForApi(array $plan): array
    {
        $plan['features'] = $this->getPricingFeatures((int) $plan['id']);
        $plan['features'] = $this->applyPlanMaxUsersToFeatures($plan, $plan['features']);

        return $plan;
    }

    /**
     * @param list<array<string, mixed>> $features
     * @return list<array<string, mixed>>
     */
    public function applyPlanMaxUsersToFeatures(array $plan, array $features): array
    {
        $maxUsers = $plan['max_users'] ?? null;
        $label = $this->maxUsersDisplayLabel($maxUsers);

        $found = false;
        foreach ($features as &$feature) {
            if (($feature['feature_key'] ?? '') !== 'max_users') {
                continue;
            }
            $found = true;
            if ($maxUsers === null || $maxUsers === '') {
                $feature['feature_value'] = 'unlimited';
            } else {
                $feature['feature_value'] = (string) (int) $maxUsers;
            }
            $feature['display_name'] = $label;
        }
        unset($feature);

        if (!$found && $label !== '') {
            array_unshift($features, [
                'feature_key' => 'max_users',
                'feature_value' => $maxUsers === null || $maxUsers === '' ? 'unlimited' : (string) (int) $maxUsers,
                'display_name' => $label,
                'is_enabled' => 1,
                'show_on_pricing' => 1,
                'sort_order' => 0,
            ]);
        }

        return $features;
    }

    private function maxUsersDisplayLabel($maxUsers): string
    {
        if ($maxUsers === null || $maxUsers === '') {
            return 'Unlimited team members';
        }

        $max = (int) $maxUsers;
        if ($max === 1) {
            return 'Single user only';
        }

        return 'Up to ' . $max . ' team members';
    }
}
