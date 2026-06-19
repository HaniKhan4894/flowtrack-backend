<?php

namespace App\Models;

use CodeIgniter\Model;

class OfficeLocationModel extends Model
{
    protected $table = 'office_locations';
    protected $primaryKey = 'id';
    protected $useAutoIncrement = true;
    protected $returnType = 'array';
    protected $useTimestamps = true;
    protected $createdField = 'created_at';
    protected $updatedField = 'updated_at';
    protected $allowedFields = [
        'organization_id', 'name', 'public_ip', 'router_mac',
        'location_type', 'is_auto_detected', 'last_active_at',
    ];
}
