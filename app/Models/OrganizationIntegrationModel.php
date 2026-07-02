<?php

namespace App\Models;

use CodeIgniter\Model;

class OrganizationIntegrationModel extends Model
{
    protected $table            = 'organization_integrations';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'organization_id', 'provider', 'auth_type', 'external_account_id',
        'settings', 'secrets_encrypted', 'is_enabled', 'connected_by',
    ];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    public function findOne(int $organizationId, string $provider): ?array
    {
        return $this->where('organization_id', $organizationId)
            ->where('provider', $provider)
            ->first();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function forOrganization(int $organizationId): array
    {
        return $this->where('organization_id', $organizationId)->findAll();
    }
}
