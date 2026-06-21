<?php

namespace App\Models;

use CodeIgniter\Model;

class AdvancedMonitoringSessionModel extends Model
{
    protected $table            = 'advanced_monitoring_sessions';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'organization_id',
        'user_id',
        'started_by',
        'reason',
        'status',
        'screenshot_frequency_minutes',
        'force_screenshots',
        'notify_member',
        'member_notified_at',
        'result_summary',
        'started_at',
        'ended_at',
    ];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';
}
