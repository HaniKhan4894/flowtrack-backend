<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\SubscriptionService;
use App\Models\PlanModel;
use App\Models\BillingSettingsModel;

class SubscriptionController extends ResourceController
{
    protected $subscriptionService;
    protected $planModel;
    protected $db;
    protected $format = 'json';

    public function __construct()
    {
        $this->subscriptionService = new SubscriptionService();
        $this->planModel = new PlanModel();
        $this->db = \Config\Database::connect();
    }

    /**
     * GET /api/v1/plans
     * Get all available plans
     */
    public function plans()
    {
        try {
            $plans = $this->planModel->getActivePlans();
            $billingSettings = (new BillingSettingsModel())->getSettings();

            foreach ($plans as &$plan) {
                $plan = $this->planModel->enrichPlanForApi($plan);
            }
            unset($plan);

            return $this->respond([
                'success' => true,
                'data' => $plans,
                'billing_settings' => $billingSettings,
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/plans/{id}
     * Get plan details with features
     */
    public function planDetails($id = null)
    {
        try {
            $plan = $this->planModel->getPlanWithFeatures($id);

            if (!$plan) {
                return $this->failNotFound('Plan not found');
            }

            return $this->respond([
                'success' => true,
                'data' => $plan
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/subscriptions
     * Subscribe to a plan
     */
    public function subscribe()
    {
        try {
            $data = $this->request->getJSON(true);

            // Inject organization_id from request if missing
            if (!isset($data['organization_id']) && $this->request->getServer('FLOWTRACK_ORGANIZATION_ID')) {
                $data['organization_id'] = (int)$this->request->getServer('FLOWTRACK_ORGANIZATION_ID');
            }

            $rules = [
                'organization_id' => 'required|is_natural_no_zero',
                'plan_id' => 'required|is_natural_no_zero',
                'billing_cycle' => 'required|in_list[monthly,yearly]',
            ];

            $validation = \Config\Services::validation();
            if (!$validation->setRules($rules)->run($data)) {
                return $this->failValidationErrors($validation->getErrors());
            }

            $userCount = $data['user_count'] ?? 1;

            $subscription = $this->subscriptionService->subscribe(
                $data['organization_id'],
                $data['plan_id'],
                $userCount,
                $data['billing_cycle']
            );

            return $this->respondCreated([
                'success' => true,
                'message' => 'Subscription created successfully',
                'data' => $subscription
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/subscriptions/checkout-session
     * Create Stripe Checkout session URL
     */
    public function checkoutSession()
    {
        try {
            $data = $this->request->getJSON(true);
            if (!isset($data['organization_id']) && $this->request->getServer('FLOWTRACK_ORGANIZATION_ID')) {
                $data['organization_id'] = (int)$this->request->getServer('FLOWTRACK_ORGANIZATION_ID');
            }

            $rules = [
                'organization_id' => 'required|is_natural_no_zero',
                'plan_id' => 'required|is_natural_no_zero',
                'billing_cycle' => 'required|in_list[monthly,yearly]',
            ];

            $validation = \Config\Services::validation();
            if (!$validation->setRules($rules)->run($data)) {
                return $this->failValidationErrors($validation->getErrors());
            }

            $session = $this->subscriptionService->createCheckoutSession(
                (int)$data['organization_id'],
                (int)$data['plan_id'],
                (string)$data['billing_cycle'],
                (int)($data['user_count'] ?? 1)
            );

            return $this->respond([
                'success' => true,
                'data' => $session,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/subscriptions/confirm-checkout
     * Confirm Stripe Checkout and activate plan
     */
    public function confirmCheckout()
    {
        try {
            $data = $this->request->getJSON(true);
            if (empty($data['session_id'])) {
                return $this->fail('session_id is required', 400);
            }

            $subscription = $this->subscriptionService->confirmCheckoutSession(
                (string) $data['session_id'],
                (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0)
            );

            return $this->respond([
                'success' => true,
                'message' => 'Payment confirmed and subscription activated',
                'data' => $subscription,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/subscriptions/billing-portal
     * Stripe Customer Portal — update card, view invoices, cancel
     */
    public function billingPortal()
    {
        try {
            $organizationId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
            if (!$organizationId) {
                return $this->fail('Unauthorized', 401);
            }

            $session = $this->subscriptionService->createBillingPortalSession($organizationId);

            return $this->respond([
                'success' => true,
                'data' => $session,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/subscriptions/current
     * Get current subscription
     */
    public function current()
    {
        try {
            $organizationId = $this->request->getGet('organization_id') ?? $this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? null;

            if (!$organizationId) {
                return $this->fail('organization_id is required', 400);
            }

            $subscriptionModel = new \App\Models\SubscriptionModel();
            $subscription = $subscriptionModel->getActiveSubscription($organizationId);

            if ($subscription && $this->subscriptionService->needsPeriodResync($subscription)) {
                try {
                    $subscription = $this->subscriptionService->syncStripeSubscription(
                        (int) $organizationId,
                        (string) $subscription['stripe_subscription_id']
                    );
                } catch (\Exception $e) {
                    // Keep the stored subscription if Stripe sync fails.
                }
            }

            return $this->respond([
                'success' => true,
                'data' => $subscription // Returns null if not found, which is better than 404 for frontend
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/subscriptions/upgrade
     * Upgrade subscription
     */
    public function upgrade()
    {
        try {
            $data = $this->request->getJSON(true);

            $rules = [
                'organization_id' => 'required|is_natural_no_zero',
                'plan_id' => 'required|is_natural_no_zero',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $subscription = $this->subscriptionService->upgrade(
                $data['organization_id'],
                $data['plan_id']
            );

            return $this->respond([
                'success' => true,
                'message' => 'Subscription upgraded successfully',
                'data' => $subscription
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/subscriptions/downgrade
     * Downgrade subscription
     */
    public function downgrade()
    {
        try {
            $data = $this->request->getJSON(true);

            $rules = [
                'organization_id' => 'required|is_natural_no_zero',
                'plan_id' => 'required|is_natural_no_zero',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $subscription = $this->subscriptionService->downgrade(
                $data['organization_id'],
                $data['plan_id']
            );

            return $this->respond([
                'success' => true,
                'message' => 'Subscription will be downgraded at the end of current period',
                'data' => $subscription
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/subscriptions/cancel
     * Cancel subscription
     */
    public function cancel()
    {
        try {
            $data = $this->request->getJSON(true);

            $rules = [
                'organization_id' => 'required|is_natural_no_zero',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $immediately = $data['immediately'] ?? false;

            $this->subscriptionService->cancel($data['organization_id'], $immediately);

            return $this->respond([
                'success' => true,
                'message' => $immediately ? 'Subscription cancelled' : 'Subscription will be cancelled at the end of current period'
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/subscriptions/usage
     * Get usage statistics
     */
    public function usage()
    {
        try {
            $organizationId = $this->request->getGet('organization_id') ?? $this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? null;

            if (!$organizationId) {
                return $this->fail('organization_id is required', 400);
            }

            $usage = $this->subscriptionService->getUsage($organizationId);

            return $this->respond([
                'success' => true,
                'data' => $usage
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/subscriptions/history
     * Get subscription history
     */
    public function history()
    {
        try {
            $organizationId = $this->request->getGet('organization_id') ?? $this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? null;

            if (!$organizationId) {
                return $this->fail('organization_id is required', 400);
            }

            $history = $this->db->table('subscription_history')
                ->where('organization_id', $organizationId)
                ->orderBy('created_at', 'DESC')
                ->get()
                ->getResultArray();

            return $this->respond([
                'success' => true,
                'data' => $history
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
