<?php

namespace App\Services\Admin;

use App\Models\BillingSettingsModel;
use App\Models\PlanModel;
use CodeIgniter\Database\BaseConnection;

/**
 * Plan catalogue, per-plan feature flags, and global billing settings.
 */
class AdminPlanService
{
    use AdminAuditTrail;

    protected BaseConnection $db;
    protected PlanModel $planModel;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
        $this->planModel = new PlanModel();
    }

    public function listPlans(): array
    {
        $plans = $this->planModel->orderBy('sort_order', 'ASC')->orderBy('id', 'ASC')->findAll();
        $planIds = array_column($plans, 'id');

        $features = [];
        if ($planIds !== []) {
            $rows = $this->db->table('plan_features')
                ->whereIn('plan_id', $planIds)
                ->orderBy('sort_order', 'ASC')
                ->orderBy('feature_key', 'ASC')
                ->get()
                ->getResultArray();
            foreach ($rows as $row) {
                $features[(int) $row['plan_id']][] = [
                    'id' => (int) $row['id'],
                    'feature_key' => $row['feature_key'],
                    'feature_value' => $row['feature_value'],
                    'display_name' => $row['display_name'],
                    'is_enabled' => (bool) ($row['is_enabled'] ?? true),
                    'show_on_pricing' => (bool) ($row['show_on_pricing'] ?? true),
                    'sort_order' => (int) ($row['sort_order'] ?? 0),
                ];
            }
        }

        $usage = $this->db->query("
            SELECT plan_id,
                   COUNT(*) AS accounts,
                   SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_accounts,
                   SUM(CASE WHEN status = 'trial' THEN 1 ELSE 0 END) AS trial_accounts,
                   COALESCE(SUM(CASE WHEN status = 'active'
                       THEN (CASE WHEN billing_cycle = 'yearly' THEN amount / 12 ELSE amount END)
                       ELSE 0 END), 0) AS mrr
            FROM organization_subscriptions
            GROUP BY plan_id
        ")->getResultArray();
        $usageByPlan = [];
        foreach ($usage as $row) {
            $usageByPlan[(int) $row['plan_id']] = [
                'accounts' => (int) $row['accounts'],
                'active_accounts' => (int) $row['active_accounts'],
                'trial_accounts' => (int) $row['trial_accounts'],
                'mrr' => round((float) $row['mrr'], 2),
            ];
        }

        return array_map(static function (array $plan) use ($features, $usageByPlan) {
            $id = (int) $plan['id'];
            $plan['id'] = $id;
            $plan['price_monthly'] = (float) $plan['price_monthly'];
            $plan['price_yearly'] = (float) $plan['price_yearly'];
            $plan['base_price'] = (float) ($plan['base_price'] ?? 0);
            $plan['price_per_user'] = (float) ($plan['price_per_user'] ?? 0);
            $plan['min_users'] = (int) ($plan['min_users'] ?? 1);
            $plan['max_users'] = $plan['max_users'] !== null && $plan['max_users'] !== '' ? (int) $plan['max_users'] : null;
            $plan['trial_days'] = (int) $plan['trial_days'];
            $plan['sort_order'] = (int) $plan['sort_order'];
            $plan['is_active'] = (bool) $plan['is_active'];
            $plan['is_popular'] = (bool) $plan['is_popular'];
            $plan['features'] = $features[$id] ?? [];
            $plan['usage'] = $usageByPlan[$id] ?? [
                'accounts' => 0, 'active_accounts' => 0, 'trial_accounts' => 0, 'mrr' => 0.0,
            ];

            return $plan;
        }, $plans);
    }

    /** Distinct feature keys already in use, so the UI can offer them. */
    public function featureKeys(): array
    {
        return array_column(
            $this->db->table('plan_features')
                ->select('feature_key, MAX(display_name) AS display_name', false)
                ->groupBy('feature_key')
                ->orderBy('feature_key', 'ASC')
                ->get()
                ->getResultArray(),
            'display_name',
            'feature_key'
        );
    }

    public function createPlan(array $data, int $adminUserId): array
    {
        $payload = $this->sanitizePlanPayload($data, true);

        if (empty($payload['slug'])) {
            $payload['slug'] = url_title((string) $payload['name'], '-', true);
        }

        if ($this->planModel->where('slug', $payload['slug'])->first()) {
            throw new \RuntimeException('A plan with this slug already exists');
        }

        $this->planModel->insert($payload);
        $planId = (int) $this->planModel->getInsertID();

        $this->recordAdminAction($adminUserId, 'plan.create', 'plan', $planId, $payload);

        return $this->planModel->find($planId) ?? [];
    }

    public function updatePlan(int $planId, array $data, int $adminUserId): array
    {
        $plan = $this->planModel->find($planId);
        if (!$plan) {
            throw new \RuntimeException('Plan not found');
        }

        $payload = $this->sanitizePlanPayload($data, false);
        if ($payload === []) {
            throw new \RuntimeException('Nothing to update');
        }

        if (isset($payload['slug']) && $payload['slug'] !== $plan['slug']) {
            $clash = $this->planModel->where('slug', $payload['slug'])->where('id !=', $planId)->first();
            if ($clash) {
                throw new \RuntimeException('A plan with this slug already exists');
            }
        }

        $this->planModel->update($planId, $payload);

        $this->recordAdminAction($adminUserId, 'plan.update', 'plan', $planId, $payload);

        return $this->planModel->find($planId) ?? [];
    }

    public function deletePlan(int $planId, int $adminUserId): void
    {
        $plan = $this->planModel->find($planId);
        if (!$plan) {
            throw new \RuntimeException('Plan not found');
        }

        $inUse = $this->db->table('organization_subscriptions')->where('plan_id', $planId)->countAllResults();
        if ($inUse > 0) {
            throw new \RuntimeException("This plan is used by {$inUse} subscription(s). Deactivate it instead.");
        }

        $this->db->table('plan_features')->where('plan_id', $planId)->delete();
        $this->planModel->delete($planId);

        $this->recordAdminAction($adminUserId, 'plan.delete', 'plan', $planId, ['name' => $plan['name']]);
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function sanitizePlanPayload(array $data, bool $requireName): array
    {
        $payload = [];

        foreach (['name', 'slug', 'description', 'stripe_price_id_monthly', 'stripe_price_id_yearly',
                  'stripe_base_price_id_monthly', 'stripe_base_price_id_yearly'] as $key) {
            if (array_key_exists($key, $data)) {
                $payload[$key] = $data[$key] === '' ? null : (string) $data[$key];
            }
        }

        foreach (['price_monthly', 'price_yearly', 'base_price', 'price_per_user'] as $key) {
            if (array_key_exists($key, $data)) {
                $payload[$key] = round(max(0, (float) $data[$key]), 2);
            }
        }

        foreach (['min_users', 'trial_days', 'sort_order'] as $key) {
            if (array_key_exists($key, $data)) {
                $payload[$key] = max(0, (int) $data[$key]);
            }
        }

        if (array_key_exists('max_users', $data)) {
            $payload['max_users'] = ($data['max_users'] === null || $data['max_users'] === '' || (int) $data['max_users'] <= 0)
                ? null
                : (int) $data['max_users'];
        }

        if (array_key_exists('pricing_model', $data)) {
            $payload['pricing_model'] = in_array($data['pricing_model'], ['fixed', 'per_user'], true)
                ? $data['pricing_model']
                : 'fixed';
        }

        foreach (['is_active', 'is_popular'] as $key) {
            if (array_key_exists($key, $data)) {
                $payload[$key] = !empty($data[$key]) && $data[$key] !== 'false' ? 1 : 0;
            }
        }

        if ($requireName && empty($payload['name'])) {
            throw new \RuntimeException('Plan name is required');
        }

        if (isset($payload['name']) && $payload['name'] === '') {
            throw new \RuntimeException('Plan name cannot be empty');
        }

        return $payload;
    }

    public function upsertFeature(int $planId, array $data, int $adminUserId): array
    {
        if (!$this->planModel->find($planId)) {
            throw new \RuntimeException('Plan not found');
        }

        $featureKey = trim((string) ($data['feature_key'] ?? ''));
        if ($featureKey === '') {
            throw new \RuntimeException('Feature key is required');
        }

        $payload = [
            'feature_value' => (string) ($data['feature_value'] ?? 'true'),
            'display_name' => (string) ($data['display_name'] ?? ucwords(str_replace('_', ' ', $featureKey))),
            'is_enabled' => !empty($data['is_enabled']) && $data['is_enabled'] !== 'false' ? 1 : 0,
            'show_on_pricing' => !empty($data['show_on_pricing']) && $data['show_on_pricing'] !== 'false' ? 1 : 0,
            'sort_order' => (int) ($data['sort_order'] ?? 0),
        ];

        $existing = $this->db->table('plan_features')
            ->where('plan_id', $planId)
            ->where('feature_key', $featureKey)
            ->get()
            ->getRowArray();

        if ($existing) {
            $this->db->table('plan_features')->where('id', $existing['id'])->update($payload);
            $featureId = (int) $existing['id'];
        } else {
            $this->db->table('plan_features')->insert($payload + [
                'plan_id' => $planId,
                'feature_key' => $featureKey,
                'created_at' => date('Y-m-d H:i:s'),
            ]);
            $featureId = (int) $this->db->insertID();
        }

        $this->recordAdminAction($adminUserId, 'plan.feature_upsert', 'plan_feature', $featureId, [
            'plan_id' => $planId,
            'feature_key' => $featureKey,
        ] + $payload);

        return $this->db->table('plan_features')->where('id', $featureId)->get()->getRowArray() ?? [];
    }

    public function deleteFeature(int $planId, int $featureId, int $adminUserId): void
    {
        $feature = $this->db->table('plan_features')
            ->where('id', $featureId)
            ->where('plan_id', $planId)
            ->get()
            ->getRowArray();

        if (!$feature) {
            throw new \RuntimeException('Feature not found for this plan');
        }

        $this->db->table('plan_features')->where('id', $featureId)->delete();

        $this->recordAdminAction($adminUserId, 'plan.feature_delete', 'plan_feature', $featureId, [
            'plan_id' => $planId,
            'feature_key' => $feature['feature_key'],
        ]);
    }

    public function getBillingSettings(): array
    {
        return (new BillingSettingsModel())->getSettings();
    }

    public function updateBillingSettings(array $data, int $adminUserId): array
    {
        $model = new BillingSettingsModel();
        $payload = [];

        foreach (['slider_min', 'slider_max', 'slider_step', 'slider_default'] as $key) {
            if (array_key_exists($key, $data)) {
                $payload[$key] = max(1, (int) $data[$key]);
            }
        }

        if (array_key_exists('yearly_discount_percent', $data)) {
            $payload['yearly_discount_percent'] = max(0, min(100, (float) $data['yearly_discount_percent']));
        }

        if (array_key_exists('slider_marks', $data) && is_array($data['slider_marks'])) {
            $marks = array_values(array_unique(array_map('intval', $data['slider_marks'])));
            sort($marks);
            $payload['slider_marks'] = json_encode($marks);
        }

        if ($payload === []) {
            throw new \RuntimeException('Nothing to update');
        }

        $payload['updated_at'] = date('Y-m-d H:i:s');

        if ($model->find(1)) {
            $model->update(1, $payload);
        } else {
            $model->insert($payload + ['id' => 1]);
        }

        $this->recordAdminAction($adminUserId, 'billing_settings.update', 'billing_settings', 1, $payload);

        return $model->getSettings();
    }
}
