<?php

namespace App\Models;

use CodeIgniter\Model;

class TimesheetPeriodModel extends Model
{
    protected $table            = 'timesheet_periods';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'organization_id', 'user_id', 'week_start', 'status',
        'submitted_at', 'approved_by', 'approved_at', 'rejection_reason',
    ];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';
}
