<?php

namespace App\Services;

use App\Models\ApiKeyModel;

/**
 * Phase 10 — Public API keys.
 *
 * Mints and validates API keys for the public API. The plaintext key is only
 * ever returned once (at creation); we persist a SHA-256 hash + a short public
 * prefix for identification.
 */
class ApiKeyService
{
    protected ApiKeyModel $model;

    public function __construct()
    {
        $this->model = new ApiKeyModel();
    }

    /**
     * @return array<int, array<string,mixed>>
     */
    public function list(int $organizationId): array
    {
        $rows = $this->model
            ->where('organization_id', $organizationId)
            ->orderBy('created_at', 'DESC')
            ->findAll();

        return array_map(fn ($r) => [
            'id'           => (int) $r['id'],
            'name'         => $r['name'],
            'key_prefix'   => $r['key_prefix'],
            'masked'       => $r['key_prefix'] . '••••••••',
            'is_active'    => (bool) $r['is_active'],
            'last_used_at' => $r['last_used_at'],
            'created_at'   => $r['created_at'],
        ], $rows);
    }

    /**
     * Create a key and return the ONE-TIME plaintext token.
     *
     * @return array{id:int, name:string, key_prefix:string, plaintext:string}
     */
    public function create(int $organizationId, int $userId, string $name): array
    {
        $name = trim($name) !== '' ? trim($name) : 'API key';
        $random = bin2hex(random_bytes(24));
        $prefix = 'ft_' . substr(bin2hex(random_bytes(4)), 0, 8);
        $plaintext = $prefix . '_' . $random;

        $id = $this->model->insert([
            'organization_id' => $organizationId,
            'name'            => mb_substr($name, 0, 120),
            'key_prefix'      => $prefix,
            'key_hash'        => hash('sha256', $plaintext),
            'is_active'       => 1,
            'created_by'      => $userId,
        ]);

        return [
            'id'         => (int) $id,
            'name'       => $name,
            'key_prefix' => $prefix,
            'plaintext'  => $plaintext,
        ];
    }

    public function revoke(int $organizationId, int $id): void
    {
        $row = $this->model->find($id);
        if ($row && (int) $row['organization_id'] === $organizationId) {
            $this->model->update($id, ['is_active' => 0]);
        }
    }

    /**
     * Resolve a plaintext key to its org/user context, updating last_used_at.
     *
     * @return array{organization_id:int, user_id:?int, api_key_id:int}|null
     */
    public function resolve(string $plaintext): ?array
    {
        $plaintext = trim($plaintext);
        if ($plaintext === '') {
            return null;
        }

        $row = $this->model->findByHash(hash('sha256', $plaintext));
        if (!$row) {
            return null;
        }

        // Best-effort last-used stamp (throttled to once/min to reduce writes).
        $last = $row['last_used_at'] ? strtotime((string) $row['last_used_at']) : 0;
        if (time() - $last > 60) {
            $this->model->update((int) $row['id'], ['last_used_at' => date('Y-m-d H:i:s')]);
        }

        return [
            'organization_id' => (int) $row['organization_id'],
            'user_id'         => $row['created_by'] !== null ? (int) $row['created_by'] : null,
            'api_key_id'      => (int) $row['id'],
        ];
    }
}
