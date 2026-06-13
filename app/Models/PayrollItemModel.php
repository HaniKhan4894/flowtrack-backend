<?php

namespace App\Models;

use CodeIgniter\Model;

class PayrollItemModel extends Model
{
    protected $table = 'payroll_items';
    protected $primaryKey = 'id';
    protected $returnType = 'array';
    protected $useTimestamps = true;
    protected $allowedFields = [
        'payroll_run_id', 'organization_id', 'user_id', 'pay_type', 'tracked_seconds',
        'hourly_rate', 'base_amount', 'bonus_total', 'deduction_total', 'gross_amount',
        'paid_amount', 'status', 'notes',
    ];
}
