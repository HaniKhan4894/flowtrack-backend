<?php

namespace App\Models;

use CodeIgniter\Model;

class RefreshTokenModel extends Model
{
    protected $table            = 'refresh_tokens';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $protectFields    = true;
    protected $allowedFields    = [
        'user_id', 'token_hash', 'device_info', 'ip_address',
        'expires_at', 'revoked_at', 'created_at',
    ];

    protected $useTimestamps = false;
}
