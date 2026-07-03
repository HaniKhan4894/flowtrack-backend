<?php

namespace App\Models;

use CodeIgniter\Model;

class WebhookEndpointModel extends Model
{
    protected $table            = 'webhook_endpoints';
    protected $primaryKey       = 'id';
    protected $returnType       = 'array';
    protected $allowedFields    = [
        'organization_id', 'url', 'secret', 'events', 'is_active',
        'last_status', 'last_delivered_at', 'created_by',
    ];
    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';
}
