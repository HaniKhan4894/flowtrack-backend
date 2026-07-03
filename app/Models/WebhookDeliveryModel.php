<?php

namespace App\Models;

use CodeIgniter\Model;

class WebhookDeliveryModel extends Model
{
    protected $table            = 'webhook_deliveries';
    protected $primaryKey       = 'id';
    protected $returnType       = 'array';
    protected $allowedFields    = [
        'organization_id', 'endpoint_id', 'event', 'payload', 'status_code',
        'success', 'attempts', 'response_snippet',
    ];
    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';
}
