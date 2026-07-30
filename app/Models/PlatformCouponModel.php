<?php

namespace App\Models;

use CodeIgniter\Model;

class PlatformCouponModel extends Model
{
    protected $table            = 'platform_coupons';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'code', 'name', 'description', 'discount_type', 'percent_off', 'amount_off',
        'currency', 'duration', 'duration_in_months', 'max_redemptions', 'redemption_count',
        'plan_ids', 'purpose', 'expires_at', 'is_active', 'stripe_coupon_id',
        'stripe_promotion_code_id', 'sync_error', 'created_by',
    ];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    protected $validationRules = [
        'code' => 'required|max_length[60]',
        'name' => 'required|max_length[150]',
    ];

    public function findByCode(string $code): ?array
    {
        return $this->where('code', strtoupper(trim($code)))->first();
    }

    /**
     * A coupon is redeemable only while active, unexpired, and under its redemption cap.
     */
    public function isRedeemable(array $coupon): bool
    {
        if (empty($coupon['is_active'])) {
            return false;
        }

        if (!empty($coupon['expires_at']) && strtotime((string) $coupon['expires_at']) < time()) {
            return false;
        }

        $max = $coupon['max_redemptions'] ?? null;
        if ($max !== null && $max !== '' && (int) $coupon['redemption_count'] >= (int) $max) {
            return false;
        }

        return true;
    }
}
