<?php

namespace App\Services;

use App\Models\PlanModel;
use App\Models\SubscriptionModel;
use App\Models\OrganizationModel;
use App\Services\EmailService;

class SubscriptionService
{
    protected $planModel;
    protected $subscriptionModel;
    protected $organizationModel;
    protected $emailService;
    protected $db;

    public function __construct()
    {
        $this->planModel = new PlanModel();
        $this->subscriptionModel = new SubscriptionModel();
        $this->organizationModel = new OrganizationModel();
        $this->emailService = new EmailService();
        $this->db = \Config\Database::connect();
    }

    /**
     * Calculate price based on pricing model
     */
    public function calculatePrice(int $planId, int $userCount, string $billingCycle = 'monthly'): float
    {
        $plan = $this->planModel->find($planId);
        
        if (!$plan) {
            throw new \Exception('Plan not found');
        }

        // Fixed pricing
        if ($plan['pricing_model'] === 'fixed') {
            return $billingCycle === 'monthly' 
                ? (float)$plan['price_monthly'] 
                : (float)$plan['price_yearly'];
        }

        // Per-user pricing
        $users = max($userCount, (int)$plan['min_users']);
        $monthlyPrice = (float)$plan['base_price'] + ($users * (float)$plan['price_per_user']);
        
        // 10% discount for yearly billing
        return $billingCycle === 'monthly' 
            ? $monthlyPrice 
            : round($monthlyPrice * 12 * 0.9, 2);
    }

    /**
     * Subscribe organization to plan
     */
    public function subscribe(int $organizationId, int $planId, int $userCount = 1, string $billingCycle = 'monthly'): array
    {
        $plan = $this->planModel->find($planId);
        
        if (!$plan) {
            throw new \Exception('Plan not found');
        }

        $this->db->transStart();

        try {
            // Calculate price
            $amount = $this->calculatePrice($planId, $userCount, $billingCycle);

            // Calculate trial end date
            $trialEndsAt = date('Y-m-d H:i:s', strtotime("+{$plan['trial_days']} days"));
            $periodEnd = date('Y-m-d H:i:s', strtotime("+{$plan['trial_days']} days"));

            // Create subscription
            $subscriptionId = $this->subscriptionModel->insert([
                'organization_id' => $organizationId,
                'plan_id' => $planId,
                'user_count' => $userCount,
                'amount' => $amount,
                'billing_cycle' => $billingCycle,
                'status' => $plan['trial_days'] > 0 ? 'trial' : 'active',
                'trial_ends_at' => $plan['trial_days'] > 0 ? $trialEndsAt : null,
                'current_period_start' => date('Y-m-d H:i:s'),
                'current_period_end' => $periodEnd,
            ]);

            // Log history
            $this->logHistory($organizationId, null, $planId, 'subscribe', 0, $billingCycle);

            $this->db->transComplete();

            return $this->subscriptionModel->find($subscriptionId);

        } catch (\Exception $e) {
            $this->db->transRollback();
            throw $e;
        }
    }

    /**
     * Upgrade subscription
     */
    public function upgrade(int $organizationId, int $newPlanId): array
    {
        $currentSubscription = $this->subscriptionModel->getActiveSubscription($organizationId);
        
        if (!$currentSubscription) {
            throw new \Exception('No active subscription found');
        }

        $newPlan = $this->planModel->find($newPlanId);
        
        if (!$newPlan) {
            throw new \Exception('Plan not found');
        }

        $this->db->transStart();

        try {
            // Update subscription
            $this->subscriptionModel->update($currentSubscription['id'], [
                'plan_id' => $newPlanId,
                'status' => 'active',
            ]);

            // Log history
            $this->logHistory(
                $organizationId,
                $currentSubscription['plan_id'],
                $newPlanId,
                'upgrade',
                $newPlan['price_' . $currentSubscription['billing_cycle']],
                $currentSubscription['billing_cycle']
            );

            $this->db->transComplete();

            return $this->subscriptionModel->find($currentSubscription['id']);

        } catch (\Exception $e) {
            $this->db->transRollback();
            throw $e;
        }
    }

    /**
     * Downgrade subscription (at period end)
     */
    public function downgrade(int $organizationId, int $newPlanId): array
    {
        $currentSubscription = $this->subscriptionModel->getActiveSubscription($organizationId);
        
        if (!$currentSubscription) {
            throw new \Exception('No active subscription found');
        }

        // Schedule downgrade at period end
        $this->db->transStart();

        try {
            // Update to downgrade at period end
            $this->subscriptionModel->update($currentSubscription['id'], [
                'cancel_at_period_end' => true,
            ]);

            // Create new subscription starting at period end
            $this->subscriptionModel->insert([
                'organization_id' => $organizationId,
                'plan_id' => $newPlanId,
                'billing_cycle' => $currentSubscription['billing_cycle'],
                'status' => 'active',
                'current_period_start' => $currentSubscription['current_period_end'],
                'current_period_end' => date('Y-m-d H:i:s', strtotime($currentSubscription['current_period_end'] . ' +1 month')),
            ]);

            // Log history
            $this->logHistory(
                $organizationId,
                $currentSubscription['plan_id'],
                $newPlanId,
                'downgrade',
                0,
                $currentSubscription['billing_cycle']
            );

            $this->db->transComplete();

            return $this->subscriptionModel->getActiveSubscription($organizationId);

        } catch (\Exception $e) {
            $this->db->transRollback();
            throw $e;
        }
    }

    /**
     * Cancel subscription
     */
    public function cancel(int $organizationId, bool $immediately = false): bool
    {
        $subscription = $this->subscriptionModel->getActiveSubscription($organizationId);
        
        if (!$subscription) {
            throw new \Exception('No active subscription found');
        }

        $this->db->transStart();

        try {
            if ($immediately) {
                $this->subscriptionModel->update($subscription['id'], [
                    'status' => 'cancelled',
                    'cancelled_at' => date('Y-m-d H:i:s'),
                ]);
            } else {
                $this->subscriptionModel->update($subscription['id'], [
                    'cancel_at_period_end' => true,
                ]);
            }

            // Log history
            $this->logHistory($organizationId, $subscription['plan_id'], null, 'cancel', 0);

            $this->db->transComplete();

            return true;

        } catch (\Exception $e) {
            $this->db->transRollback();
            throw $e;
        }
    }

    /**
     * Check feature limit
     */
    public function checkFeatureLimit(int $organizationId, string $featureKey, int $currentCount = 0): bool
    {
        $subscription = $this->subscriptionModel->getActiveSubscription($organizationId);
        
        if (!$subscription) {
            return false;
        }

        $featureValue = $this->planModel->getFeatureValue($subscription['plan_id'], $featureKey);

        if (!$featureValue) {
            return false;
        }

        // Check if unlimited
        if ($featureValue === 'unlimited') {
            return true;
        }

        // Check if boolean feature
        if ($featureValue === 'true') {
            return true;
        }

        if ($featureValue === 'false') {
            return false;
        }

        // Check numeric limit
        if (is_numeric($featureValue)) {
            return $currentCount < (int)$featureValue;
        }

        return false;
    }

    /**
     * Adjust user count and recalculate price (for per-user plans)
     */
    public function adjustUserCount(int $organizationId): void
    {
        $subscription = $this->subscriptionModel->getActiveSubscription($organizationId);
        
        if (!$subscription) {
            return;
        }

        $plan = $this->planModel->find($subscription['plan_id']);
        
        // Only adjust for per-user pricing
        if ($plan['pricing_model'] !== 'per_user') {
            return;
        }

        // Count active users
        $userCount = $this->db->table('organization_members')
            ->where('organization_id', $organizationId)
            ->countAllResults();

        // Calculate new price
        $newAmount = $this->calculatePrice($subscription['plan_id'], $userCount, $subscription['billing_cycle']);

        // Update subscription
        $this->subscriptionModel->update($subscription['id'], [
            'user_count' => $userCount,
            'amount' => $newAmount,
        ]);
    }

    /**
     * Get usage statistics
     */
    public function getUsage(int $organizationId): array
    {
        $subscription = $this->subscriptionModel->getActiveSubscription($organizationId);
        
        if (!$subscription) {
            return [];
        }

        // Get current usage
        $userCount = $this->db->table('organization_members')
            ->where('organization_id', $organizationId)
            ->countAllResults();

        $projectCount = $this->db->table('projects')
            ->where('organization_id', $organizationId)
            ->countAllResults();

        // Get limits
        $maxUsers = $this->planModel->getFeatureValue($subscription['plan_id'], 'max_users');
        $maxProjects = $this->planModel->getFeatureValue($subscription['plan_id'], 'max_projects');

        return [
            'users' => [
                'current' => $userCount,
                'limit' => $maxUsers === 'unlimited' ? 'unlimited' : (int)$maxUsers,
                'percentage' => $maxUsers === 'unlimited' ? 0 : ($userCount / (int)$maxUsers) * 100,
            ],
            'projects' => [
                'current' => $projectCount,
                'limit' => $maxProjects === 'unlimited' ? 'unlimited' : (int)$maxProjects,
                'percentage' => $maxProjects === 'unlimited' ? 0 : ($projectCount / (int)$maxProjects) * 100,
            ],
        ];
    }

    /**
     * Log subscription history
     */
    private function logHistory(int $organizationId, ?int $fromPlanId, ?int $toPlanId, string $action, float $amount = 0, ?string $billingCycle = null): void
    {
        $this->db->table('subscription_history')->insert([
            'organization_id' => $organizationId,
            'from_plan_id' => $fromPlanId,
            'to_plan_id' => $toPlanId,
            'action' => $action,
            'amount' => $amount,
            'billing_cycle' => $billingCycle,
            'created_at' => date('Y-m-d H:i:s'),
        ]);
    }
}
