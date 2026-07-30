<?php

namespace App\Services\Admin;

use App\Models\PlatformCouponModel;
use CodeIgniter\Database\BaseConnection;
use Stripe\StripeClient;

/**
 * Discount coupons used by acquisition, win-back and retention offers.
 *
 * Each coupon is mirrored into Stripe as a Coupon + Promotion Code pair so the
 * discount is honoured at checkout instead of only being tracked locally.
 */
class AdminCouponService
{
    use AdminAuditTrail;

    protected BaseConnection $db;
    protected PlatformCouponModel $coupons;
    protected ?StripeClient $stripe = null;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
        $this->coupons = new PlatformCouponModel();
    }

    /**
     * @param array<string, mixed> $filters
     */
    public function list(array $filters = []): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = min(100, max(5, (int) ($filters['per_page'] ?? 25)));

        $builder = $this->db->table('platform_coupons c')
            ->select('c.*, COALESCE(SUM(r.amount_discounted), 0) AS total_discounted, COUNT(r.id) AS redemptions', false)
            ->join('platform_coupon_redemptions r', 'r.coupon_id = c.id', 'left')
            ->groupBy('c.id');

        if (!empty($filters['search'])) {
            $search = trim((string) $filters['search']);
            $builder->groupStart()
                ->like('c.code', $search)
                ->orLike('c.name', $search)
                ->groupEnd();
        }

        if (!empty($filters['purpose'])) {
            $builder->where('c.purpose', $filters['purpose']);
        }

        if (isset($filters['status']) && $filters['status'] !== '') {
            if ($filters['status'] === 'active') {
                $builder->where('c.is_active', 1)
                    ->groupStart()
                        ->where('c.expires_at IS NULL', null, false)
                        ->orWhere('c.expires_at >=', date('Y-m-d H:i:s'))
                    ->groupEnd();
            } elseif ($filters['status'] === 'expired') {
                $builder->where('c.expires_at <', date('Y-m-d H:i:s'));
            } else {
                $builder->where('c.is_active', 0);
            }
        }

        $countBuilder = clone $builder;
        $total = count($countBuilder->get()->getResultArray());

        $rows = $builder
            ->orderBy('c.created_at', 'DESC')
            ->limit($perPage, ($page - 1) * $perPage)
            ->get()
            ->getResultArray();

        return [
            'data' => array_map([$this, 'present'], $rows),
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / $perPage),
            ],
        ];
    }

    public function summary(): array
    {
        $row = $this->db->query("
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN is_active = 1 AND (expires_at IS NULL OR expires_at >= NOW()) THEN 1 ELSE 0 END) AS active,
                SUM(redemption_count) AS redemptions
            FROM platform_coupons
        ")->getRowArray() ?: [];

        $discounted = $this->db->query("
            SELECT COALESCE(SUM(amount_discounted), 0) AS total_discounted,
                   COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN amount_discounted ELSE 0 END), 0) AS discounted_30d
            FROM platform_coupon_redemptions
        ")->getRowArray() ?: [];

        // Revenue recovered = payments from orgs that redeemed a coupon after redeeming it.
        $recovered = $this->db->query("
            SELECT COALESCE(SUM(p.amount), 0) AS recovered
            FROM platform_payments p
            INNER JOIN platform_coupon_redemptions r ON r.organization_id = p.organization_id
            WHERE p.status = 'paid' AND p.paid_at >= r.created_at
        ")->getRowArray() ?: [];

        return [
            'total' => (int) ($row['total'] ?? 0),
            'active' => (int) ($row['active'] ?? 0),
            'redemptions' => (int) ($row['redemptions'] ?? 0),
            'total_discounted' => round((float) ($discounted['total_discounted'] ?? 0), 2),
            'discounted_30d' => round((float) ($discounted['discounted_30d'] ?? 0), 2),
            'revenue_after_redemption' => round((float) ($recovered['recovered'] ?? 0), 2),
        ];
    }

    public function detail(int $couponId): array
    {
        $coupon = $this->coupons->find($couponId);
        if (!$coupon) {
            throw new \RuntimeException('Coupon not found');
        }

        $redemptions = $this->db->table('platform_coupon_redemptions r')
            ->select('r.*, o.name AS organization_name, c.name AS campaign_name', false)
            ->join('organizations o', 'o.id = r.organization_id', 'left')
            ->join('marketing_campaigns c', 'c.id = r.campaign_id', 'left')
            ->orderBy('r.created_at', 'DESC')
            ->limit(100)
            ->get()
            ->getResultArray();

        return [
            'coupon' => $this->present($coupon),
            'redemptions' => array_map(static fn (array $r): array => [
                'id' => (int) $r['id'],
                'organization_id' => $r['organization_id'] === null ? null : (int) $r['organization_id'],
                'organization_name' => $r['organization_name'],
                'campaign_name' => $r['campaign_name'],
                'amount_discounted' => round((float) $r['amount_discounted'], 2),
                'created_at' => $r['created_at'],
            ], $redemptions),
        ];
    }

    /**
     * @param array<string, mixed> $data
     */
    public function create(array $data, int $adminUserId): array
    {
        $payload = $this->normalize($data, true);
        $payload['created_by'] = $adminUserId;

        if ($this->coupons->findByCode($payload['code'])) {
            throw new \RuntimeException('That coupon code already exists');
        }

        $couponId = (int) $this->coupons->insert($payload, true);
        $this->syncToStripe($couponId);

        $this->recordAdminAction($adminUserId, 'coupon.create', 'platform_coupon', $couponId, [
            'code' => $payload['code'],
            'discount_type' => $payload['discount_type'],
            'percent_off' => $payload['percent_off'] ?? null,
            'amount_off' => $payload['amount_off'] ?? null,
        ]);

        return $this->present($this->coupons->find($couponId));
    }

    /**
     * @param array<string, mixed> $data
     */
    public function update(int $couponId, array $data, int $adminUserId): array
    {
        $existing = $this->coupons->find($couponId);
        if (!$existing) {
            throw new \RuntimeException('Coupon not found');
        }

        // Stripe coupons are immutable, so discount maths stays as created; only
        // metadata, availability and the local flags can change after the fact.
        $payload = $this->normalize($data, false);
        unset($payload['code'], $payload['discount_type'], $payload['percent_off'], $payload['amount_off'], $payload['duration'], $payload['duration_in_months']);

        if ($payload !== []) {
            $this->coupons->update($couponId, $payload);
        }

        if (array_key_exists('is_active', $payload)) {
            $this->toggleStripePromotionCode($couponId, (bool) $payload['is_active']);
        }

        $this->recordAdminAction($adminUserId, 'coupon.update', 'platform_coupon', $couponId, $payload);

        return $this->present($this->coupons->find($couponId));
    }

    public function delete(int $couponId, int $adminUserId): void
    {
        $coupon = $this->coupons->find($couponId);
        if (!$coupon) {
            throw new \RuntimeException('Coupon not found');
        }

        $this->toggleStripePromotionCode($couponId, false);
        $this->coupons->delete($couponId);

        $this->recordAdminAction($adminUserId, 'coupon.delete', 'platform_coupon', $couponId, [
            'code' => $coupon['code'],
        ]);
    }

    /**
     * Validate a customer-supplied code and return the Stripe promotion code to apply.
     *
     * @return array{id: int, code: string, name: string, stripe_promotion_code_id: string, discount_label: string}
     */
    public function resolveForCheckout(string $code, int $planId): array
    {
        $coupon = $this->coupons->findByCode($code);

        if (!$coupon || !$this->coupons->isRedeemable($coupon)) {
            throw new \RuntimeException('This promo code is not valid or has expired.');
        }

        $planIds = $this->decodePlanIds($coupon['plan_ids'] ?? null);
        if ($planIds !== [] && !in_array($planId, $planIds, true)) {
            throw new \RuntimeException('This promo code does not apply to the selected plan.');
        }

        if (empty($coupon['stripe_promotion_code_id'])) {
            $this->syncToStripe((int) $coupon['id']);
            $coupon = $this->coupons->find($coupon['id']);
        }

        if (empty($coupon['stripe_promotion_code_id'])) {
            throw new \RuntimeException('This promo code is not available yet. Please try again shortly.');
        }

        return [
            'id' => (int) $coupon['id'],
            'code' => $coupon['code'],
            'name' => $coupon['name'],
            'stripe_promotion_code_id' => (string) $coupon['stripe_promotion_code_id'],
            'discount_label' => $this->discountLabel($coupon),
        ];
    }

    /**
     * Read-only preview so the billing page can show the discount before redirecting.
     */
    public function previewForCheckout(string $code, int $planId): array
    {
        $resolved = $this->resolveForCheckout($code, $planId);

        return [
            'code' => $resolved['code'],
            'name' => $resolved['name'],
            'discount_label' => $resolved['discount_label'],
        ];
    }

    /**
     * Create the Stripe Coupon + Promotion Code pair. Failures are stored on the
     * row rather than thrown so a Stripe outage never blocks coupon creation.
     */
    public function syncToStripe(int $couponId): void
    {
        $coupon = $this->coupons->find($couponId);
        if (!$coupon) {
            return;
        }

        try {
            $stripe = $this->stripe();

            $stripeCouponId = $coupon['stripe_coupon_id'] ?: null;
            if (!$stripeCouponId) {
                $params = [
                    'name' => $coupon['name'],
                    'duration' => $coupon['duration'],
                    'metadata' => ['flowtrack_coupon_id' => (string) $couponId, 'code' => $coupon['code']],
                ];

                if ($coupon['duration'] === 'repeating') {
                    $params['duration_in_months'] = max(1, (int) ($coupon['duration_in_months'] ?? 1));
                }

                if ($coupon['discount_type'] === 'percent') {
                    $params['percent_off'] = (float) $coupon['percent_off'];
                } else {
                    $params['amount_off'] = (int) round(((float) $coupon['amount_off']) * 100);
                    $params['currency'] = $coupon['currency'] ?: 'usd';
                }

                $stripeCoupon = $stripe->coupons->create($params);
                $stripeCouponId = $stripeCoupon->id;
            }

            $promotionCodeId = $coupon['stripe_promotion_code_id'] ?: null;
            if (!$promotionCodeId) {
                $promoParams = [
                    'coupon' => $stripeCouponId,
                    'code' => $coupon['code'],
                    'active' => (bool) $coupon['is_active'],
                    'metadata' => ['flowtrack_coupon_id' => (string) $couponId],
                ];

                if (!empty($coupon['expires_at'])) {
                    $promoParams['expires_at'] = strtotime((string) $coupon['expires_at']);
                }

                if (!empty($coupon['max_redemptions'])) {
                    $promoParams['max_redemptions'] = (int) $coupon['max_redemptions'];
                }

                $promotionCodeId = $stripe->promotionCodes->create($promoParams)->id;
            }

            $this->coupons->update($couponId, [
                'stripe_coupon_id' => $stripeCouponId,
                'stripe_promotion_code_id' => $promotionCodeId,
                'sync_error' => null,
            ]);
        } catch (\Throwable $e) {
            log_message('error', 'Coupon Stripe sync failed: ' . $e->getMessage());
            $this->coupons->update($couponId, [
                'sync_error' => substr($e->getMessage(), 0, 500),
            ]);
        }
    }

    private function toggleStripePromotionCode(int $couponId, bool $active): void
    {
        $coupon = $this->coupons->find($couponId);
        if (!$coupon || empty($coupon['stripe_promotion_code_id'])) {
            return;
        }

        try {
            $this->stripe()->promotionCodes->update(
                (string) $coupon['stripe_promotion_code_id'],
                ['active' => $active]
            );
        } catch (\Throwable $e) {
            log_message('error', 'Coupon Stripe toggle failed: ' . $e->getMessage());
        }
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function normalize(array $data, bool $isCreate): array
    {
        $payload = [];

        if ($isCreate || array_key_exists('code', $data)) {
            $code = strtoupper(preg_replace('/[^A-Z0-9_-]/i', '', (string) ($data['code'] ?? '')));
            if ($code === '') {
                throw new \RuntimeException('Coupon code is required (letters, numbers, dashes only)');
            }
            $payload['code'] = $code;
        }

        foreach (['name', 'description'] as $field) {
            if (array_key_exists($field, $data)) {
                $payload[$field] = $data[$field] === null || $data[$field] === '' ? null : (string) $data[$field];
            }
        }

        if ($isCreate && empty($payload['name'])) {
            $payload['name'] = $payload['code'];
        }

        if ($isCreate || array_key_exists('discount_type', $data)) {
            $type = in_array($data['discount_type'] ?? 'percent', ['percent', 'amount'], true)
                ? $data['discount_type']
                : 'percent';
            $payload['discount_type'] = $type;

            if ($type === 'percent') {
                $percent = round((float) ($data['percent_off'] ?? 0), 2);
                if ($percent <= 0 || $percent > 100) {
                    throw new \RuntimeException('Percent off must be between 1 and 100');
                }
                $payload['percent_off'] = $percent;
                $payload['amount_off'] = null;
            } else {
                $amount = round((float) ($data['amount_off'] ?? 0), 2);
                if ($amount <= 0) {
                    throw new \RuntimeException('Amount off must be greater than zero');
                }
                $payload['amount_off'] = $amount;
                $payload['percent_off'] = null;
            }
        }

        if ($isCreate || array_key_exists('duration', $data)) {
            $duration = in_array($data['duration'] ?? 'once', ['once', 'repeating', 'forever'], true)
                ? $data['duration']
                : 'once';
            $payload['duration'] = $duration;
            $payload['duration_in_months'] = $duration === 'repeating'
                ? max(1, (int) ($data['duration_in_months'] ?? 3))
                : null;
        }

        if (array_key_exists('currency', $data)) {
            $payload['currency'] = strtolower((string) ($data['currency'] ?: 'usd'));
        }

        if (array_key_exists('purpose', $data)) {
            $payload['purpose'] = in_array($data['purpose'], ['acquisition', 'winback', 'retention', 'upgrade', 'other'], true)
                ? $data['purpose']
                : 'other';
        }

        if (array_key_exists('max_redemptions', $data)) {
            $max = (int) $data['max_redemptions'];
            $payload['max_redemptions'] = $max > 0 ? $max : null;
        }

        if (array_key_exists('expires_at', $data)) {
            $payload['expires_at'] = empty($data['expires_at'])
                ? null
                : date('Y-m-d H:i:s', strtotime((string) $data['expires_at']));
        }

        if (array_key_exists('plan_ids', $data)) {
            $ids = array_values(array_unique(array_filter(array_map('intval', (array) $data['plan_ids']))));
            $payload['plan_ids'] = $ids === [] ? null : json_encode($ids);
        }

        if (array_key_exists('is_active', $data)) {
            $payload['is_active'] = !empty($data['is_active']) ? 1 : 0;
        }

        return $payload;
    }

    /**
     * @return array<string, mixed>
     */
    private function present(array $row): array
    {
        $expired = !empty($row['expires_at']) && strtotime((string) $row['expires_at']) < time();
        $max = $row['max_redemptions'] ?? null;
        $exhausted = $max !== null && $max !== '' && (int) $row['redemption_count'] >= (int) $max;

        return [
            'id' => (int) $row['id'],
            'code' => $row['code'],
            'name' => $row['name'],
            'description' => $row['description'],
            'discount_type' => $row['discount_type'],
            'percent_off' => $row['percent_off'] === null ? null : (float) $row['percent_off'],
            'amount_off' => $row['amount_off'] === null ? null : (float) $row['amount_off'],
            'currency' => $row['currency'],
            'duration' => $row['duration'],
            'duration_in_months' => $row['duration_in_months'] === null ? null : (int) $row['duration_in_months'],
            'max_redemptions' => $max === null || $max === '' ? null : (int) $max,
            'redemption_count' => (int) $row['redemption_count'],
            'plan_ids' => $this->decodePlanIds($row['plan_ids'] ?? null),
            'purpose' => $row['purpose'],
            'expires_at' => $row['expires_at'],
            'is_active' => (bool) $row['is_active'],
            'discount_label' => $this->discountLabel($row),
            'state' => !$row['is_active'] ? 'disabled' : ($expired ? 'expired' : ($exhausted ? 'exhausted' : 'active')),
            'stripe_synced' => !empty($row['stripe_promotion_code_id']),
            'sync_error' => $row['sync_error'] ?? null,
            'total_discounted' => isset($row['total_discounted']) ? round((float) $row['total_discounted'], 2) : null,
            'created_at' => $row['created_at'],
        ];
    }

    private function discountLabel(array $coupon): string
    {
        $base = ($coupon['discount_type'] ?? 'percent') === 'percent'
            ? rtrim(rtrim(number_format((float) ($coupon['percent_off'] ?? 0), 2, '.', ''), '0'), '.') . '% off'
            : strtoupper((string) ($coupon['currency'] ?? 'usd')) . ' ' . number_format((float) ($coupon['amount_off'] ?? 0), 2) . ' off';

        return match ($coupon['duration'] ?? 'once') {
            'forever' => $base . ' forever',
            'repeating' => $base . ' for ' . (int) ($coupon['duration_in_months'] ?? 1) . ' months',
            default => $base . ' on first invoice',
        };
    }

    /**
     * @return list<int>
     */
    private function decodePlanIds(mixed $raw): array
    {
        if (empty($raw)) {
            return [];
        }

        $decoded = is_array($raw) ? $raw : json_decode((string) $raw, true);

        return is_array($decoded) ? array_values(array_map('intval', $decoded)) : [];
    }

    private function stripe(): StripeClient
    {
        if ($this->stripe === null) {
            $secret = trim((string) (
                env('STRIPE_SECRET_KEY')
                ?? getenv('STRIPE_SECRET_KEY')
                ?? ($_ENV['STRIPE_SECRET_KEY'] ?? '')
            ));
            if ($secret === '') {
                throw new \RuntimeException('Stripe is not configured (STRIPE_SECRET_KEY missing)');
            }
            $this->stripe = new StripeClient($secret);
        }

        return $this->stripe;
    }
}
