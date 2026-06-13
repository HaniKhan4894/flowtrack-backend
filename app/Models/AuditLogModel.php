<?php

namespace App\Models;

use CodeIgniter\Model;

class AuditLogModel extends Model
{
    protected $table            = 'audit_logs';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $protectFields    = true;
    protected $allowedFields    = [
        'organization_id', 'user_id', 'action', 'entity_type',
        'entity_id', 'changes', 'ip_address', 'created_at',
    ];

    protected $useTimestamps = false;
}
