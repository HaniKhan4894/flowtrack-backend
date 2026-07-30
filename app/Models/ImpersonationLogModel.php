<?php

namespace App\Models;

use CodeIgniter\Model;

class ImpersonationLogModel extends Model
{
    protected $table            = 'admin_impersonation_logs';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'admin_user_id', 'target_user_id', 'organization_id', 'reason',
        'ip_address', 'expires_at', 'ended_at', 'created_at',
    ];

    protected $useTimestamps = false;
}
