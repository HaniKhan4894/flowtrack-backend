<?php

namespace App\Services;

use App\Models\PlanModel;
use App\Models\SubscriptionModel;
use App\Models\OrganizationModel;
use App\Services\EmailService;
use Stripe\Checkout\Session;
use Stripe\StripeClient;

class SubscriptionService
{
    protected $planModel;
    protected $subscriptionModel;
    protected $organizationModel;
    protected $emailService;
    protected $db;
    protected ?StripeClient $stripeClient = null;
    protected ?PaymentLedgerService $paymentLedger = null;

    public function __construct()
    {
        $this->planModel = new PlanModel();
        $this->subscriptionModel = new SubscriptionModel();
        $this->organizationModel = new OrganizationModel();
        $this->emailService = new EmailService();
        $this->db = \Config\Database::connect();
    }

    private function paymentLedger(): PaymentLedgerService
    {
        return $this->paymentLedger ??= new PaymentLedgerService();
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

        if ($this->planRequiresPayment($plan)) {
            throw new \Exception('Paid plans must use Stripe checkout. Start checkout from the billing page.');
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

            if (!$subscriptionId) {
                throw new \RuntimeException('Failed to create subscription: ' . json_encode($this->subscriptionModel->errors()));
            }

            // Log history
            $this->logHistory($organizationId, null, $planId, 'subscribe', 0, $billingCycle);

            $this->db->transComplete();

            return $this->subscriptionModel->find($subscriptionId);

        } catch (\Exception $e) {
            $this->db->transRollback();
            throw $e;
        }
    }

    public function createCheckoutSession(
        int $organizationId,
        int $planId,
        string $billingCycle = 'monthly',
        ?int $userCount = null,
        ?string $promoCode = null
    ): array {
        $plan = $this->planModel->find($planId);
        if (!$plan) {
            throw new \Exception('Plan not found');
        }

        if (!$this->planRequiresPayment($plan)) {
            throw new \Exception('The free plan does not require payment.');
        }

        $userCount = $this->resolveBillableUserCount($organizationId, $plan);
        $this->validatePlanUserCapacity($planId, $userCount);
        $lineItems = $this->buildCheckoutLineItems($plan, $billingCycle, $userCount);

        $frontendUrl = rtrim((string) (env('app.frontendURL') ?? 'http://localhost:5173'), '/');
        $subscription = $this->subscriptionModel->getActiveSubscription($organizationId);

        $subscriptionData = [
            'metadata' => [
                'organization_id' => (string) $organizationId,
                'plan_id' => (string) $planId,
                'billing_cycle' => $billingCycle,
                'user_count' => (string) $userCount,
            ],
        ];

        if ($this->qualifiesForTrial($organizationId, $plan)) {
            $trialDays = (int) ($plan['trial_days'] ?? 14);
            $subscriptionData['trial_period_days'] = $trialDays;
            $subscriptionData['trial_settings'] = [
                'end_behavior' => [
                    'missing_payment_method' => 'cancel',
                ],
            ];
        }

        $sessionParams = [
            'mode' => 'subscription',
            'success_url' => $frontendUrl . '/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}',
            'cancel_url' => $frontendUrl . '/billing?checkout=cancelled',
            'payment_method_types' => ['card'],
            'payment_method_collection' => 'always',
            'line_items' => $lineItems,
            'metadata' => [
                'organization_id' => (string) $organizationId,
                'plan_id' => (string) $planId,
                'billing_cycle' => $billingCycle,
                'user_count' => (string) $userCount,
            ],
            'subscription_data' => $subscriptionData,
        ];

        if (!empty($subscription['stripe_customer_id'])) {
            $sessionParams['customer'] = $subscription['stripe_customer_id'];
        }

        $appliedCoupon = null;
        if ($promoCode !== null && trim($promoCode) !== '') {
            $couponService = new \App\Services\Admin\AdminCouponService();
            $appliedCoupon = $couponService->resolveForCheckout($promoCode, $planId);
            $sessionParams['discounts'] = [[
                'promotion_code' => $appliedCoupon['stripe_promotion_code_id'],
            ]];
            $sessionParams['metadata']['coupon_code'] = $appliedCoupon['code'];
            $sessionParams['subscription_data']['metadata']['coupon_code'] = $appliedCoupon['code'];
        } else {
            // Let customers paste a Stripe promotion code straight into Checkout.
            $sessionParams['allow_promotion_codes'] = true;
        }

        $session = $this->getStripeClient()->checkout->sessions->create($sessionParams);

        return [
            'id' => $session->id,
            'url' => $session->url,
            'trial_days' => $this->qualifiesForTrial($organizationId, $plan) ? (int) ($plan['trial_days'] ?? 14) : 0,
            'user_count' => $userCount,
            'estimated_amount' => $this->calculatePrice($planId, $userCount, $billingCycle),
            'coupon' => $appliedCoupon === null ? null : [
                'code' => $appliedCoupon['code'],
                'name' => $appliedCoupon['name'],
                'discount_label' => $appliedCoupon['discount_label'],
            ],
        ];
    }

    public function resolveBillableUserCount(int $organizationId, ?array $plan = null): int
    {
        $members = (int) $this->db->table('organization_members')
            ->where('organization_id', $organizationId)
            ->countAllResults();

        $pending = (int) $this->db->table('organization_invitations')
            ->where('organization_id', $organizationId)
            ->countAllResults();

        $count = max(1, $members + $pending);
        $minUsers = (int) ($plan['min_users'] ?? 1);

        return max($minUsers, $count);
    }

    public function qualifiesForTrial(int $organizationId, ?array $plan = null): bool
    {
        if ($plan !== null && (int) ($plan['trial_days'] ?? 0) <= 0) {
            return false;
        }

        // One Stripe trial per organization — upgrades keep the original trial window.
        $priorStripe = (int) $this->db->table('organization_subscriptions')
            ->where('organization_id', $organizationId)
            ->where('stripe_subscription_id IS NOT NULL', null, false)
            ->countAllResults();

        return $priorStripe === 0;
    }

    /**
     * @return list<array{price: string, quantity: int}>
     */
    private function buildCheckoutLineItems(array $plan, string $billingCycle, int $userCount): array
    {
        if (($plan['pricing_model'] ?? 'fixed') === 'per_user') {
            $items = [];
            if ((float) ($plan['base_price'] ?? 0) > 0) {
                $items[] = [
                    'price' => $this->resolveStripeBasePriceId($plan, $billingCycle),
                    'quantity' => 1,
                ];
            }
            $items[] = [
                'price' => $this->resolveStripePriceId($plan, $billingCycle),
                'quantity' => max(1, $userCount),
            ];

            return $items;
        }

        return [[
            'price' => $this->resolveStripePriceId($plan, $billingCycle),
            'quantity' => 1,
        ]];
    }

    public function confirmCheckoutSession(string $sessionId, ?int $expectedOrganizationId = null): array
    {
        $session = $this->getStripeClient()->checkout->sessions->retrieve($sessionId, []);

        if (($session->status ?? '') !== 'complete') {
            throw new \Exception('Checkout not completed');
        }

        $metadata = $session->metadata ?? null;
        if (!$metadata) {
            throw new \Exception('Missing checkout metadata');
        }

        $organizationId = (int) ($metadata['organization_id'] ?? 0);
        $planId = (int) ($metadata['plan_id'] ?? 0);
        $billingCycle = (string) ($metadata['billing_cycle'] ?? 'monthly');
        $userCount = (int) ($metadata['user_count'] ?? 1);

        if (!$organizationId || !$planId) {
            throw new \Exception('Invalid checkout metadata');
        }

        if ($expectedOrganizationId && $organizationId !== $expectedOrganizationId) {
            throw new \Exception('Checkout session does not belong to your organization');
        }

        $stripeSubscriptionId = is_string($session->subscription ?? null) ? $session->subscription : null;
        if (!$stripeSubscriptionId) {
            throw new \Exception('Stripe subscription was not created for this checkout.');
        }

        return $this->syncStripeSubscription($organizationId, $stripeSubscriptionId, $planId, $billingCycle, $userCount);
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

        if ((int) ($currentSubscription['plan_id'] ?? 0) === $newPlanId) {
            throw new \Exception('You are already on this plan');
        }

        if (empty($currentSubscription['stripe_subscription_id'])) {
            throw new \Exception('No Stripe subscription to upgrade. Start checkout for this plan instead.');
        }

        $billingCycle = $currentSubscription['billing_cycle'] ?? 'monthly';
        $userCount = $this->resolveBillableUserCount($organizationId, $newPlan);
        $this->validatePlanUserCapacity($newPlanId, $userCount);

        $this->db->transStart();

        try {
            $stripeSub = $this->getStripeClient()->subscriptions->retrieve($currentSubscription['stripe_subscription_id']);
            $items = [];
            foreach ($stripeSub->items->data ?? [] as $existingItem) {
                $items[] = ['id' => $existingItem->id, 'deleted' => true];
            }

            foreach ($this->buildCheckoutLineItems($newPlan, $billingCycle, $userCount) as $line) {
                $items[] = [
                    'price' => $line['price'],
                    'quantity' => $line['quantity'],
                ];
            }

            // Keep existing Stripe trial_end — do not restart a new trial on upgrade.
            $this->getStripeClient()->subscriptions->update($currentSubscription['stripe_subscription_id'], [
                'items' => $items,
                'proration_behavior' => 'create_prorations',
                'metadata' => [
                    'organization_id' => (string) $organizationId,
                    'plan_id' => (string) $newPlanId,
                    'billing_cycle' => $billingCycle,
                    'user_count' => (string) $userCount,
                ],
            ]);

            $amount = $this->calculatePrice($newPlanId, $userCount, $billingCycle);
            $stillInTrial = ($currentSubscription['status'] ?? '') === 'trial'
                && !empty($currentSubscription['trial_ends_at'])
                && strtotime((string) $currentSubscription['trial_ends_at']) > time();

            $update = [
                'plan_id' => $newPlanId,
                'amount' => $amount,
                'user_count' => $userCount,
                'cancel_at_period_end' => false,
            ];
            if (!$stillInTrial) {
                $update['status'] = 'active';
            }

            $this->subscriptionModel->update($currentSubscription['id'], $update);

            $this->logHistory(
                $organizationId,
                $currentSubscription['plan_id'],
                $newPlanId,
                'upgrade',
                $amount,
                $billingCycle
            );

            $this->db->transComplete();

            return $this->syncStripeSubscription(
                $organizationId,
                (string) $currentSubscription['stripe_subscription_id'],
                $newPlanId,
                $billingCycle,
                $userCount
            );
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

        $newPlan = $this->planModel->find($newPlanId);
        if (!$newPlan) {
            throw new \Exception('Plan not found');
        }

        $billingCycle = $currentSubscription['billing_cycle'] ?? 'monthly';
        $priceId = $this->resolveStripePriceId($newPlan, $billingCycle);

        $this->db->transStart();

        try {
            if (!empty($currentSubscription['stripe_subscription_id']) && $priceId) {
                $this->getStripeClient()->subscriptions->update($currentSubscription['stripe_subscription_id'], [
                    'cancel_at_period_end' => false,
                    'proration_behavior' => 'none',
                    'items' => [[
                        'id' => $this->getStripeClient()->subscriptions->retrieve($currentSubscription['stripe_subscription_id'])->items->data[0]->id,
                        'price' => $priceId,
                    ]],
                    'metadata' => [
                        'organization_id' => (string) $organizationId,
                        'plan_id' => (string) $newPlanId,
                        'scheduled_downgrade' => 'true',
                    ],
                ]);
            } else {
                $this->subscriptionModel->update($currentSubscription['id'], [
                    'cancel_at_period_end' => true,
                ]);
            }

            $amount = $this->calculatePrice($newPlanId, (int) $currentSubscription['user_count'], $billingCycle);

            $this->subscriptionModel->update($currentSubscription['id'], [
                'plan_id' => $newPlanId,
                'amount' => $amount,
            ]);

            $this->logHistory(
                $organizationId,
                $currentSubscription['plan_id'],
                $newPlanId,
                'downgrade',
                $amount,
                $billingCycle
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
            if (!empty($subscription['stripe_subscription_id'])) {
                if ($immediately) {
                    $this->getStripeClient()->subscriptions->cancel($subscription['stripe_subscription_id']);
                } else {
                    $this->getStripeClient()->subscriptions->update($subscription['stripe_subscription_id'], [
                        'cancel_at_period_end' => true,
                    ]);
                }
            }

            if ($immediately) {
                $this->subscriptionModel->update($subscription['id'], [
                    'status' => 'cancelled',
                    'cancelled_at' => date('Y-m-d H:i:s'),
                    'cancel_at_period_end' => false,
                ]);
            } else {
                $this->subscriptionModel->update($subscription['id'], [
                    'cancel_at_period_end' => true,
                ]);
            }

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

        if ($featureValue === 'false' || $featureValue === '0') {
            return false;
        }

        // Check numeric limit
        if (is_numeric($featureValue)) {
            return $currentCount < (int)$featureValue;
        }

        // Qualitative tiers (basic/advanced/full/limited/csv/all/…) count as enabled
        if (is_string($featureValue) && $featureValue !== '') {
            return true;
        }

        return false;
    }

    /**
     * Sync local + Stripe seat quantity with current billable users (members + pending invites).
     *
     * Policy:
     * - During trial: update Stripe quantity only (first charge uses new seat count; no mid-trial invoice).
     * - After paid (active): seat increases invoice immediately via proration (always_invoice).
     * - Seat decreases: prorated credit applied on the next invoice.
     *
     * @param bool $strict When true (seat increase), Stripe failures raise. When false (decrease), log only.
     */
    public function syncBillableSeats(int $organizationId, bool $strict = true): void
    {
        $subscription = $this->subscriptionModel->getActiveSubscription($organizationId);
        if (!$subscription) {
            return;
        }

        $plan = $this->planModel->find($subscription['plan_id']);
        if (!$plan || ($plan['pricing_model'] ?? '') !== 'per_user') {
            return;
        }

        $userCount = $this->resolveBillableUserCount($organizationId, $plan);
        $previousCount = max(1, (int) ($subscription['user_count'] ?? 1));
        $billingCycle = $subscription['billing_cycle'] ?? 'monthly';
        $newAmount = $this->planRequiresPayment($plan)
            ? $this->calculatePrice((int) $subscription['plan_id'], $userCount, $billingCycle)
            : 0.0;

        // Free / $0 plans — keep local count accurate, skip Stripe.
        if (!$this->planRequiresPayment($plan) || empty($subscription['stripe_subscription_id'])) {
            $this->subscriptionModel->update($subscription['id'], [
                'user_count' => $userCount,
                'amount' => $newAmount,
            ]);
            return;
        }

        if ($userCount === $previousCount) {
            // Still refresh amount in case plan price changed.
            $this->subscriptionModel->update($subscription['id'], [
                'user_count' => $userCount,
                'amount' => $newAmount,
            ]);
            return;
        }

        $status = (string) ($subscription['status'] ?? '');
        $inTrial = $status === 'trial'
            || (
                !empty($subscription['trial_ends_at'])
                && strtotime((string) $subscription['trial_ends_at']) > time()
            );

        // Trial: just set quantity for the first post-trial invoice.
        // Active + more seats: charge prorated amount now so seats aren't free until next cycle.
        // Active + fewer seats: credit via create_prorations on next invoice.
        if ($inTrial) {
            $proration = 'none';
        } elseif ($userCount > $previousCount) {
            $proration = 'always_invoice';
        } else {
            $proration = 'create_prorations';
        }

        try {
            $this->syncStripeSeatQuantity(
                (string) $subscription['stripe_subscription_id'],
                $userCount,
                $proration
            );
        } catch (\Throwable $e) {
            log_message('error', 'Stripe seat quantity sync failed: ' . $e->getMessage());
            if ($strict || $userCount > $previousCount) {
                throw new \RuntimeException(
                    'Could not update billing seats with Stripe. Please try again or contact support.',
                    0,
                    $e
                );
            }
            // Seat decrease: keep local membership change; billing can be reconciled later.
        }

        $this->subscriptionModel->update($subscription['id'], [
            'user_count' => $userCount,
            'amount' => $newAmount,
        ]);
    }

    /** @deprecated Use syncBillableSeats() */
    public function adjustUserCount(int $organizationId): void
    {
        $this->syncBillableSeats($organizationId);
    }

    private function syncStripeSeatQuantity(
        string $stripeSubscriptionId,
        int $userCount,
        string $prorationBehavior = 'create_prorations'
    ): void {
        $stripeSub = $this->getStripeClient()->subscriptions->retrieve($stripeSubscriptionId);
        $seatItemId = null;
        foreach ($stripeSub->items->data as $item) {
            $component = $item->price->metadata['plan_component'] ?? '';
            if ($component === 'seat') {
                $seatItemId = $item->id;
                break;
            }
        }

        // Fallback: first item if metadata missing (older Stripe prices).
        if (!$seatItemId && !empty($stripeSub->items->data[0]->id)) {
            $seatItemId = $stripeSub->items->data[0]->id;
        }

        if (!$seatItemId) {
            throw new \RuntimeException('No seat line item found on Stripe subscription ' . $stripeSubscriptionId);
        }

        $this->getStripeClient()->subscriptions->update($stripeSubscriptionId, [
            'items' => [[
                'id' => $seatItemId,
                'quantity' => max(1, $userCount),
            ]],
            'proration_behavior' => $prorationBehavior,
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

        $pendingInvites = $this->db->table('organization_invitations')
            ->where('organization_id', $organizationId)
            ->countAllResults();

        $slotsUsed = $userCount + $pendingInvites;

        $projectCount = $this->db->table('projects')
            ->where('organization_id', $organizationId)
            ->countAllResults();

        // Get limits
        $maxUsers = $this->planModel->getFeatureValue($subscription['plan_id'], 'max_users');
        $maxProjects = $this->planModel->getFeatureValue($subscription['plan_id'], 'max_projects');

        return [
            'users' => [
                'current' => $slotsUsed,
                'members' => $userCount,
                'pending_invites' => $pendingInvites,
                'limit' => $maxUsers === 'unlimited' ? 'unlimited' : (int)$maxUsers,
                'percentage' => $maxUsers === 'unlimited' ? 0 : ($slotsUsed / (int)$maxUsers) * 100,
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

    private function getStripeClient(): StripeClient
    {
        if ($this->stripeClient) {
            return $this->stripeClient;
        }

        $secretKey = trim((string) (
            env('STRIPE_SECRET_KEY')
            ?? getenv('STRIPE_SECRET_KEY')
            ?? ($_ENV['STRIPE_SECRET_KEY'] ?? '')
            ?? ($_SERVER['STRIPE_SECRET_KEY'] ?? '')
        ));

        if ($secretKey === '') {
            throw new \RuntimeException('STRIPE_SECRET_KEY is not configured');
        }

        $this->stripeClient = new StripeClient($secretKey);
        return $this->stripeClient;
    }

    public function syncStripePlans(): array
    {
        $synced = [];
        foreach ($this->planModel->getActivePlans() as $plan) {
            if (!$this->planRequiresPayment($plan)) {
                continue;
            }

            foreach (['monthly', 'yearly'] as $billingCycle) {
                if (($plan['pricing_model'] ?? 'fixed') === 'per_user' && (float) ($plan['base_price'] ?? 0) > 0) {
                    $basePriceId = $this->resolveStripeBasePriceId($plan, $billingCycle, true);
                    $synced[] = [
                        'plan_id' => (int) $plan['id'],
                        'slug' => $plan['slug'],
                        'billing_cycle' => $billingCycle,
                        'component' => 'base',
                        'price_id' => $basePriceId,
                    ];
                    $plan = $this->planModel->find((int) $plan['id']) ?? $plan;
                }

                $priceId = $this->resolveStripePriceId($plan, $billingCycle, true);
                $synced[] = [
                    'plan_id' => (int) $plan['id'],
                    'slug' => $plan['slug'],
                    'billing_cycle' => $billingCycle,
                    'component' => ($plan['pricing_model'] ?? 'fixed') === 'per_user' ? 'seat' : 'fixed',
                    'price_id' => $priceId,
                ];
                $plan = $this->planModel->find((int) $plan['id']) ?? $plan;
            }
        }

        return $synced;
    }

    private function resolveStripePriceId(array $plan, string $billingCycle, bool $forceCreate = false): string
    {
        $column = $billingCycle === 'yearly' ? 'stripe_price_id_yearly' : 'stripe_price_id_monthly';
        $priceId = trim((string) ($plan[$column] ?? ''));
        if ($priceId !== '') {
            return $priceId;
        }

        $envKey = 'STRIPE_PRICE_' . strtoupper(str_replace('-', '_', (string) $plan['slug']))
            . '_' . ($billingCycle === 'yearly' ? 'YEARLY' : 'MONTHLY');
        $fromEnv = trim((string) (
            env($envKey)
            ?? getenv($envKey)
            ?? ($_ENV[$envKey] ?? '')
            ?? ($_SERVER[$envKey] ?? '')
        ));
        if ($fromEnv !== '') {
            $this->persistStripePriceId((int) $plan['id'], $billingCycle, $fromEnv);
            return $fromEnv;
        }

        if (!$forceCreate && !$this->shouldAutoCreateStripePrices()) {
            throw new \Exception(
                'Stripe price is not configured for this plan. Set '
                . $column
                . ' on the plan, add '
                . $envKey
                . ' to .env, or run: php spark stripe:sync-plans'
            );
        }

        return $this->createAndPersistStripePrice($plan, $billingCycle);
    }

    private function resolveStripeBasePriceId(array $plan, string $billingCycle, bool $forceCreate = false): string
    {
        $column = $billingCycle === 'yearly' ? 'stripe_base_price_id_yearly' : 'stripe_base_price_id_monthly';
        $priceId = trim((string) ($plan[$column] ?? ''));
        if ($priceId !== '') {
            return $priceId;
        }

        $slug = strtoupper(str_replace('-', '_', (string) $plan['slug']));
        $envKey = 'STRIPE_PRICE_' . $slug . '_BASE_' . ($billingCycle === 'yearly' ? 'YEARLY' : 'MONTHLY');
        $fromEnv = trim((string) (
            env($envKey)
            ?? getenv($envKey)
            ?? ($_ENV[$envKey] ?? '')
            ?? ($_SERVER[$envKey] ?? '')
        ));
        if ($fromEnv !== '') {
            $this->persistStripeBasePriceId((int) $plan['id'], $billingCycle, $fromEnv);
            return $fromEnv;
        }

        if (!$forceCreate && !$this->shouldAutoCreateStripePrices()) {
            throw new \Exception(
                'Stripe base price is not configured for this plan. Set '
                . $column
                . ' on the plan, add '
                . $envKey
                . ' to .env, or run: php spark stripe:sync-plans'
            );
        }

        return $this->createAndPersistStripeBasePrice($plan, $billingCycle);
    }

    private function stripeBaseUnitAmountForPlan(array $plan, string $billingCycle): int
    {
        $base = (float) ($plan['base_price'] ?? 0);
        $amount = $billingCycle === 'yearly'
            ? round($base * 12 * 0.9, 2)
            : $base;

        $cents = (int) round($amount * 100);
        if ($cents <= 0) {
            throw new \Exception('Cannot create a Stripe base price for a plan with zero base_price');
        }

        return $cents;
    }

    private function createAndPersistStripeBasePrice(array $plan, string $billingCycle): string
    {
        $stripe = $this->getStripeClient();
        $productId = $this->findOrCreateStripeProduct($plan);
        $interval = $billingCycle === 'yearly' ? 'year' : 'month';
        $unitAmount = $this->stripeBaseUnitAmountForPlan($plan, $billingCycle);

        $price = $stripe->prices->create([
            'product' => $productId,
            'currency' => 'usd',
            'unit_amount' => $unitAmount,
            'recurring' => ['interval' => $interval],
            'metadata' => [
                'plan_id' => (string) $plan['id'],
                'plan_slug' => (string) $plan['slug'],
                'billing_cycle' => $billingCycle,
                'plan_component' => 'base',
            ],
        ]);

        $priceId = (string) $price->id;
        $this->persistStripeBasePriceId((int) $plan['id'], $billingCycle, $priceId);

        return $priceId;
    }

    private function persistStripeBasePriceId(int $planId, string $billingCycle, string $priceId): void
    {
        $column = $billingCycle === 'yearly' ? 'stripe_base_price_id_yearly' : 'stripe_base_price_id_monthly';
        $this->planModel->update($planId, [$column => $priceId]);
    }

    private function shouldAutoCreateStripePrices(): bool
    {
        $flag = strtolower(trim((string) (
            env('STRIPE_AUTO_CREATE_PRICES')
            ?? getenv('STRIPE_AUTO_CREATE_PRICES')
            ?? ''
        )));

        if (in_array($flag, ['1', 'true', 'yes', 'on'], true)) {
            return true;
        }

        return ENVIRONMENT === 'development';
    }

    private function stripeUnitAmountForPlan(array $plan, string $billingCycle): int
    {
        if (($plan['pricing_model'] ?? 'fixed') === 'fixed') {
            $amount = $billingCycle === 'yearly'
                ? (float) $plan['price_yearly']
                : (float) $plan['price_monthly'];
        } else {
            $perUser = (float) $plan['price_per_user'];
            $amount = $billingCycle === 'yearly'
                ? round($perUser * 12 * 0.9, 2)
                : $perUser;
        }

        $cents = (int) round($amount * 100);
        if ($cents <= 0) {
            throw new \Exception('Cannot create a Stripe price for a free plan');
        }

        return $cents;
    }

    private function findOrCreateStripeProduct(array $plan): string
    {
        $stripe = $this->getStripeClient();
        $planId = (string) $plan['id'];
        $products = $stripe->products->search([
            'query' => "metadata['plan_id']:'{$planId}'",
            'limit' => 1,
        ]);

        if (!empty($products->data[0]->id)) {
            return (string) $products->data[0]->id;
        }

        $product = $stripe->products->create([
            'name' => 'FlowTrack ' . $plan['name'],
            'metadata' => [
                'plan_id' => $planId,
                'plan_slug' => (string) $plan['slug'],
            ],
        ]);

        return (string) $product->id;
    }

    private function createAndPersistStripePrice(array $plan, string $billingCycle): string
    {
        $stripe = $this->getStripeClient();
        $productId = $this->findOrCreateStripeProduct($plan);
        $interval = $billingCycle === 'yearly' ? 'year' : 'month';
        $unitAmount = $this->stripeUnitAmountForPlan($plan, $billingCycle);

        $price = $stripe->prices->create([
            'product' => $productId,
            'currency' => 'usd',
            'unit_amount' => $unitAmount,
            'recurring' => ['interval' => $interval],
            'metadata' => [
                'plan_id' => (string) $plan['id'],
                'plan_slug' => (string) $plan['slug'],
                'billing_cycle' => $billingCycle,
                'plan_component' => ($plan['pricing_model'] ?? 'fixed') === 'per_user' ? 'seat' : 'fixed',
            ],
        ]);

        $priceId = (string) $price->id;
        $this->persistStripePriceId((int) $plan['id'], $billingCycle, $priceId);

        return $priceId;
    }

    private function persistStripePriceId(int $planId, string $billingCycle, string $priceId): void
    {
        $column = $billingCycle === 'yearly' ? 'stripe_price_id_yearly' : 'stripe_price_id_monthly';
        $this->planModel->update($planId, [$column => $priceId]);
    }

    public function needsPeriodResync(array $subscription): bool
    {
        if (empty($subscription['stripe_subscription_id'])) {
            return false;
        }

        foreach (['current_period_start', 'current_period_end'] as $field) {
            $value = trim((string) ($subscription[$field] ?? ''));
            if ($value === '' || str_starts_with($value, '0000-00-00')) {
                return true;
            }
        }

        return false;
    }

    private function extractStripePeriod(object $stripeSub, string $billingCycle = 'monthly'): array
    {
        $start = $stripeSub->current_period_start ?? null;
        $end = $stripeSub->current_period_end ?? null;

        if ((!$start || !$end) && !empty($stripeSub->items->data[0])) {
            $item = $stripeSub->items->data[0];
            $start = $start ?: ($item->current_period_start ?? null);
            $end = $end ?: ($item->current_period_end ?? null);
        }

        if (!$start && !empty($stripeSub->billing_cycle_anchor)) {
            $start = $stripeSub->billing_cycle_anchor;
        }

        if ((int) $start <= 0 || (int) $end <= 0) {
            $start = time();
            $end = strtotime($billingCycle === 'yearly' ? '+1 year' : '+1 month', $start);
        }

        return [
            'start' => date('Y-m-d H:i:s', (int) $start),
            'end' => date('Y-m-d H:i:s', (int) $end),
        ];
    }

    public function syncStripeSubscription(
        int $organizationId,
        string $stripeSubscriptionId,
        ?int $planId = null,
        ?string $billingCycle = null,
        ?int $userCount = null
    ): array {
        $stripeSub = $this->getStripeClient()->subscriptions->retrieve($stripeSubscriptionId);
        $metadata = $stripeSub->metadata ?? new \stdClass();
        $planId = $planId ?: (int) ($metadata->plan_id ?? 0);
        $billingCycle = $billingCycle ?: (($stripeSub->items->data[0]->price->recurring->interval ?? 'month') === 'year' ? 'yearly' : 'monthly');

        if (!$userCount || $userCount <= 0) {
            $userCount = $this->extractSeatQuantityFromStripeSubscription($stripeSub);
        }
        $userCount = max(1, $userCount);

        if (!$planId) {
            throw new \Exception('Plan ID missing from Stripe subscription');
        }

        $amount = $this->calculatePrice($planId, $userCount, $billingCycle);
        $period = $this->extractStripePeriod($stripeSub, $billingCycle);
        $periodStart = $period['start'];
        $periodEnd = $period['end'];
        $status = match ($stripeSub->status) {
            'active' => 'active',
            'trialing' => 'trial',
            'past_due', 'unpaid' => 'past_due',
            default => 'cancelled',
        };

        $trialEndsAt = null;
        if (!empty($stripeSub->trial_end) && (int) $stripeSub->trial_end > 0) {
            $trialEndsAt = date('Y-m-d H:i:s', (int) $stripeSub->trial_end);
        }

        $current = $this->subscriptionModel->getActiveSubscription($organizationId);
        $payload = [
            'plan_id' => $planId,
            'user_count' => $userCount,
            'amount' => $amount,
            'billing_cycle' => $billingCycle,
            'status' => $status,
            'trial_ends_at' => $trialEndsAt,
            'current_period_start' => $periodStart,
            'current_period_end' => $periodEnd,
            'cancel_at_period_end' => (bool) $stripeSub->cancel_at_period_end,
            'stripe_customer_id' => is_string($stripeSub->customer) ? $stripeSub->customer : null,
            'stripe_subscription_id' => $stripeSubscriptionId,
        ];

        if ($current) {
            $this->subscriptionModel->update($current['id'], $payload);
            return $this->subscriptionModel->find($current['id']);
        }

        $payload['organization_id'] = $organizationId;
        $subscriptionId = $this->subscriptionModel->insert($payload);
        return $this->subscriptionModel->find($subscriptionId);
    }

    public function handleStripeWebhookEvent(object $event): void
    {
        switch ($event->type) {
            case 'checkout.session.completed':
                $session = $event->data->object;
                if (($session->mode ?? '') === 'subscription' && !empty($session->subscription)) {
                    $orgId = (int) ($session->metadata->organization_id ?? 0);
                    $planId = (int) ($session->metadata->plan_id ?? 0);
                    if ($orgId && $planId) {
                        $this->syncStripeSubscription(
                            $orgId,
                            (string) $session->subscription,
                            $planId,
                            (string) ($session->metadata->billing_cycle ?? 'monthly'),
                            (int) ($session->metadata->user_count ?? 1)
                        );
                        $this->logHistory($orgId, null, $planId, 'stripe_checkout', 0, (string) ($session->metadata->billing_cycle ?? 'monthly'));
                    }
                }
                break;

            case 'invoice.paid':
                $invoice = $event->data->object;
                $orgId = 0;
                if (!empty($invoice->subscription)) {
                    $stripeSub = $this->getStripeClient()->subscriptions->retrieve((string) $invoice->subscription);
                    $orgId = (int) ($stripeSub->metadata->organization_id ?? 0);
                    if ($orgId) {
                        $local = $this->syncStripeSubscription($orgId, (string) $invoice->subscription);
                        if (($invoice->billing_reason ?? '') === 'subscription_cycle') {
                            $this->logHistory(
                                $orgId,
                                null,
                                (int) ($local['plan_id'] ?? 0),
                                'renewal',
                                (float) ($invoice->amount_paid ?? 0) / 100,
                                (string) ($local['billing_cycle'] ?? 'monthly')
                            );
                        }
                    }
                }
                $this->paymentLedger()->recordStripeInvoice($invoice, $orgId ?: null);
                break;

            case 'invoice.payment_failed':
                $invoice = $event->data->object;
                if (!empty($invoice->subscription)) {
                    $local = $this->subscriptionModel->where('stripe_subscription_id', (string) $invoice->subscription)->first();
                    if ($local) {
                        $this->subscriptionModel->update($local['id'], ['status' => 'past_due']);
                    }
                }
                $this->paymentLedger()->markInvoiceFailed($invoice);
                break;

            case 'charge.refunded':
                $this->paymentLedger()->recordRefundFromCharge($event->data->object);
                break;

            case 'customer.subscription.updated':
                $stripeSub = $event->data->object;
                $orgId = (int) ($stripeSub->metadata->organization_id ?? 0);
                if ($orgId) {
                    $this->syncStripeSubscription($orgId, (string) $stripeSub->id);
                }
                break;

            case 'customer.subscription.deleted':
                $stripeSub = $event->data->object;
                $local = $this->subscriptionModel->where('stripe_subscription_id', (string) $stripeSub->id)->first();
                if ($local) {
                    $this->subscriptionModel->update($local['id'], [
                        'status' => 'cancelled',
                        'cancelled_at' => date('Y-m-d H:i:s'),
                        'cancel_at_period_end' => false,
                    ]);
                    $this->logHistory((int) $local['organization_id'], $local['plan_id'], null, 'cancel', 0);
                }
                break;
        }
    }

    public function createBillingPortalSession(int $organizationId): array
    {
        $subscription = $this->subscriptionModel->getActiveSubscription($organizationId);
        if (!$subscription || empty($subscription['stripe_customer_id'])) {
            throw new \Exception('No saved payment method. Subscribe to a paid plan first.');
        }

        $frontendUrl = rtrim((string) (env('app.frontendURL') ?? 'http://localhost:5173'), '/');
        $session = $this->getStripeClient()->billingPortal->sessions->create([
            'customer' => $subscription['stripe_customer_id'],
            'return_url' => $frontendUrl . '/billing',
        ]);

        return ['url' => $session->url];
    }

    private function planRequiresPayment(array $plan): bool
    {
        if (($plan['slug'] ?? '') === 'free') {
            return false;
        }

        return (float) ($plan['price_monthly'] ?? 0) > 0
            || (float) ($plan['price_yearly'] ?? 0) > 0
            || (float) ($plan['base_price'] ?? 0) > 0
            || (float) ($plan['price_per_user'] ?? 0) > 0;
    }

    private function extractSeatQuantityFromStripeSubscription(object $stripeSub): int
    {
        foreach ($stripeSub->items->data as $item) {
            $component = $item->price->metadata['plan_component'] ?? '';
            if ($component === 'seat') {
                return max(1, (int) ($item->quantity ?? 1));
            }
        }

        return max(1, (int) ($stripeSub->items->data[0]->quantity ?? 1));
    }

    private function validatePlanUserCapacity(int $planId, int $userCount): void
    {
        $plan = $this->planModel->find($planId);
        $maxUsers = $plan['max_users'] ?? null;

        if ($maxUsers === null || $maxUsers === '') {
            $fromFeature = $this->planModel->getFeatureValue($planId, 'max_users');
            if ($fromFeature === null || $fromFeature === '' || strtolower((string) $fromFeature) === 'unlimited') {
                return;
            }
            $maxUsers = (int) $fromFeature;
        }

        $limit = (int) $maxUsers;
        if ($limit <= 0) {
            return;
        }

        if ($userCount > $limit) {
            throw new \Exception(sprintf(
                'Your team has %d billable user%s but this plan supports up to %d. Choose a higher plan or remove pending invites.',
                $userCount,
                $userCount === 1 ? '' : 's',
                $limit
            ));
        }
    }
}
