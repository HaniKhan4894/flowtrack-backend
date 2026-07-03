<?php

namespace App\Models;

use CodeIgniter\Model;

class ApiKeyModel extends Model
{
    protected $table            = 'api_keys';
    protected $primaryKey       = 'id';
    protected $returnType       = 'array';
    protected $allowedFields    = [
        'organization_id', 'name', 'key_prefix', 'key_hash', 'scopes',
        'last_used_at', 'is_active', 'created_by',
    ];
    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    public function findByHash(string $hash): ?array
    {
        return $this->where('key_hash', $hash)->where('is_active', 1)->first();
    }
}
