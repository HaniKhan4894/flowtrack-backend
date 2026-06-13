<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\SubscriptionService;
use Stripe\Webhook;

class StripeWebhookController extends ResourceController
{
    protected SubscriptionService $subscriptionService;
    protected $format = 'json';

    public function __construct()
    {
        $this->subscriptionService = new SubscriptionService();
    }

    /**
     * POST /api/v1/webhooks/stripe
     */
    public function handle()
    {
        $payload = file_get_contents('php://input');
        $sigHeader = $this->request->getHeaderLine('Stripe-Signature');
        $secret = trim((string) (
            env('STRIPE_WEBHOOK_SECRET')
            ?? getenv('STRIPE_WEBHOOK_SECRET')
            ?? ($_ENV['STRIPE_WEBHOOK_SECRET'] ?? '')
            ?? ($_SERVER['STRIPE_WEBHOOK_SECRET'] ?? '')
        ));

        if ($secret === '') {
            return $this->fail('Stripe webhook secret is not configured', 500);
        }

        try {
            $event = Webhook::constructEvent($payload, $sigHeader, $secret);
            $this->subscriptionService->handleStripeWebhookEvent($event);

            return $this->respond([
                'success' => true,
                'received' => true,
            ]);
        } catch (\UnexpectedValueException $e) {
            return $this->fail('Invalid payload', 400);
        } catch (\Stripe\Exception\SignatureVerificationException $e) {
            return $this->fail('Invalid signature', 400);
        } catch (\Exception $e) {
            log_message('error', 'Stripe webhook error: ' . $e->getMessage());

            return $this->fail($e->getMessage(), 400);
        }
    }
}
