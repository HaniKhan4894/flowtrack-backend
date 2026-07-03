<?php

namespace App\Models;

use CodeIgniter\Model;

class AutopilotSuggestionModel extends Model
{
    protected $table            = 'autopilot_suggestions';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'organization_id', 'user_id', 'work_date', 'project_id', 'description',
        'started_at', 'ended_at', 'duration_minutes', 'confidence', 'sources',
        'status', 'applied_entry_id',
    ];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';
}
