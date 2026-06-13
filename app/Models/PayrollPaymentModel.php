<?php

namespace App\Models;

use CodeIgniter\Model;

class PayrollPaymentModel extends Model
{
    protected $table = 'payroll_payments';
    protected $primaryKey = 'id';
    protected $returnType = 'array';
    protected $useTimestamps = false;
    protected $allowedFields = [
        'payroll_item_id', 'organization_id', 'amount', 'method', 'reference',
        'status', 'paid_at', 'recorded_by', 'created_at',
    ];
}
