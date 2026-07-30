<?php

namespace App\Controllers\API\V1;

use App\Services\Admin\AdminCouponService;

/**
 * Discount coupons for acquisition, win-back and retention offers.
 */
class AdminCouponController extends AdminBaseController
{
    protected AdminCouponService $coupons;

    public function __construct()
    {
        $this->coupons = new AdminCouponService();
    }

    public function index()
    {
        $filters = $this->queryFilters(['page', 'per_page', 'search', 'purpose', 'status']);

        return $this->attempt(fn () => [
            'coupons' => $this->coupons->list($filters),
            'summary' => $this->coupons->summary(),
        ]);
    }

    public function show($id = null)
    {
        $couponId = (int) $id;

        return $this->attempt(fn () => $this->coupons->detail($couponId));
    }

    public function create()
    {
        return $this->attempt(
            fn () => $this->coupons->create($this->payload(), $this->adminId()),
            'Coupon created'
        );
    }

    public function update($id = null)
    {
        $couponId = (int) $id;

        return $this->attempt(
            fn () => $this->coupons->update($couponId, $this->payload(), $this->adminId()),
            'Coupon updated'
        );
    }

    public function delete($id = null)
    {
        $couponId = (int) $id;

        return $this->attempt(function () use ($couponId) {
            $this->coupons->delete($couponId, $this->adminId());

            return ['deleted' => true];
        }, 'Coupon deleted');
    }

    /**
     * Retry the Stripe coupon/promotion-code creation after a sync failure.
     */
    public function resync(int $couponId)
    {
        return $this->attempt(function () use ($couponId) {
            $this->coupons->syncToStripe($couponId);

            return $this->coupons->detail($couponId);
        }, 'Coupon re-synced with Stripe');
    }
}
