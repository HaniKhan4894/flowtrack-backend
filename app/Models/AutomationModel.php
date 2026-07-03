<?php

namespace App\Models;

use CodeIgniter\Model;

class AutomationModel extends Model
{
    protected $table            = 'automations';
    protected $primaryKey       = 'id';
    protected $returnType       = 'array';
    protected $allowedFields    = [
        'organization_id', 'name', 'trigger_event', 'conditions', 'actions',
        'is_active', 'run_count', 'last_run_at', 'created_by',
    ];
    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';
}
