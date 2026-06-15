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
        'trial_days',
        'is_active',
        'is_popular',
        'sort_order',
        'stripe_price_id_monthly',
        'stripe_price_id_yearly',
    ];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

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
            ->get()
            ->getRowArray();

        return $feature ? $feature['feature_value'] : null;
    }
}
