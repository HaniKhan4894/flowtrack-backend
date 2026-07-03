<?php

namespace App\Models;

use CodeIgniter\Model;

class WorkLedgerModel extends Model
{
    protected $table            = 'work_ledger';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'organization_id', 'user_id', 'sequence', 'entry_type', 'action',
        'reference_id', 'payload_hash', 'prev_hash', 'hash', 'created_at',
    ];

    protected $useTimestamps = false;
}
