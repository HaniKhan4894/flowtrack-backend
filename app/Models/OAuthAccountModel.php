<?php

namespace App\Models;

use CodeIgniter\Model;

class OAuthAccountModel extends Model
{
    protected $table            = 'oauth_accounts';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'user_id', 'provider', 'provider_user_id', 'email', 'avatar_url',
    ];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    public function findByProvider(string $provider, string $providerUserId): ?array
    {
        return $this->where('provider', $provider)
            ->where('provider_user_id', $providerUserId)
            ->first();
    }
}
