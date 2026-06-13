<?php

namespace App\Models;

use CodeIgniter\Model;

class PayrollCompensationModel extends Model
{
    protected $table = 'payroll_compensations';
    protected $primaryKey = 'id';
    protected $returnType = 'array';
    protected $useTimestamps = true;
    protected $allowedFields = [
        'organization_id', 'user_id', 'pay_type', 'hourly_rate', 'fixed_amount',
        'currency', 'is_active', 'notes', 'created_by',
    ];
}
