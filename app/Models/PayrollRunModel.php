<?php

namespace App\Models;

use CodeIgniter\Model;

class PayrollRunModel extends Model
{
    protected $table = 'payroll_runs';
    protected $primaryKey = 'id';
    protected $returnType = 'array';
    protected $useTimestamps = true;
    protected $allowedFields = [
        'organization_id', 'title', 'period_start', 'period_end', 'status',
        'currency', 'total_gross', 'total_paid', 'created_by', 'finalized_at',
    ];
}
