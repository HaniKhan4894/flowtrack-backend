<?php

namespace App\Models;

use CodeIgniter\Model;

class PayrollAdjustmentModel extends Model
{
    protected $table = 'payroll_adjustments';
    protected $primaryKey = 'id';
    protected $returnType = 'array';
    protected $useTimestamps = false;
    protected $allowedFields = ['payroll_item_id', 'type', 'label', 'amount', 'created_by', 'created_at'];
}
