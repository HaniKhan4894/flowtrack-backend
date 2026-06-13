<?php

namespace App\Models;

use CodeIgniter\Model;

class TimesheetEntryModel extends Model
{
    protected $table            = 'timesheet_entries';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'period_id', 'time_entry_id', 'status',
    ];

    protected $useTimestamps = false;
    protected $createdField  = 'created_at';
}
