<?php

namespace App\Services;

use App\Models\OrganizationIntegrationModel;
use App\Libraries\SecretCipher;

/**
 * Central store for per-organization integrations. Supports both API-key based
 * integrations (e.g. OpenAI) and OAuth-based ones (e.g. GitHub/Slack, where the
 * org connects their own account through FlowTrack).
 *
 * Platform-level OAuth *app* credentials (client_id/secret) live in .env; this
 * service stores the per-org connection (tokens, keys, account ids).
 */
class IntegrationService
{
    protected OrganizationIntegrationModel $model;

    public function __construct()
    {
        $this->model = new OrganizationIntegrationModel();
    }

    /**
     * Full internal view: decoded settings + DECRYPTED secrets. Never expose
     * the `secrets` array directly to API responses.
     *
     * @return array{provider:string, auth_type:string, external_account_id:?string, is_enabled:bool, settings:array, secrets:array}|null
     */
    public function get(int $organizationId, string $provider): ?array
    {
        $row = $this->model->findOne($organizationId, $provider);
        if (!$row) {
            return null;
        }

        return [
            'provider'            => $row['provider'],
            'auth_type'           => $row['auth_type'] ?? 'api_key',
            'external_account_id' => $row['external_account_id'] ?? null,
            'is_enabled'          => !empty($row['is_enabled']),
            'settings'            => $this->decodeJson($row['settings'] ?? null),
            'secrets'             => $this->decodeSecrets($row['secrets_encrypted'] ?? null),
        ];
    }

    /**
     * Safe, secret-free view for API responses / frontend.
     *
     * @return array{provider:string, connected:bool, is_enabled:bool, auth_type:string, external_account_id:?string, settings:array}
     */
    public function getPublic(int $organizationId, string $provider): array
    {
        $row = $this->model->findOne($organizationId, $provider);
        if (!$row) {
            return [
                'provider'            => $provider,
                'connected'           => false,
                'is_enabled'          => false,
                'auth_type'           => 'api_key',
                'external_account_id' => null,
                'settings'            => [],
            ];
        }

        return [
            'provider'            => $row['provider'],
            'connected'           => true,
            'is_enabled'          => !empty($row['is_enabled']),
            'auth_type'           => $row['auth_type'] ?? 'api_key',
            'external_account_id' => $row['external_account_id'] ?? null,
            'settings'            => $this->decodeJson($row['settings'] ?? null),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listPublic(int $organizationId): array
    {
        $rows = $this->model->forOrganization($organizationId);
        return array_map(fn ($row) => [
            'provider'            => $row['provider'],
            'connected'           => true,
            'is_enabled'          => !empty($row['is_enabled']),
            'auth_type'           => $row['auth_type'] ?? 'api_key',
            'external_account_id' => $row['external_account_id'] ?? null,
            'settings'            => $this->decodeJson($row['settings'] ?? null),
            'updated_at'          => $row['updated_at'] ?? null,
        ], $rows);
    }

    /**
     * Store/refresh an API-key integration (e.g. OpenAI). Passing $apiKey === null
     * keeps the existing key (so settings can be updated without re-entering it).
     */
    public function saveApiKey(
        int $organizationId,
        string $provider,
        ?string $apiKey,
        array $settings = [],
        ?int $userId = null
    ): array {
        $secrets = [];
        if ($apiKey !== null && $apiKey !== '') {
            $secrets['api_key'] = $apiKey;
            $settings['key_hint'] = substr($apiKey, -4);
        }

        return $this->upsert($organizationId, $provider, [
            'auth_type' => 'api_key',
            'settings'  => $settings,
            'secrets'   => $secrets,
        ], $userId, $apiKey === null);
    }

    /**
     * Store/refresh an OAuth integration (e.g. GitHub connected by the org).
     *
     * @param array<string,mixed> $secrets  e.g. ['access_token'=>..., 'refresh_token'=>...]
     * @param array<string,mixed> $settings e.g. ['account_name'=>..., 'scopes'=>..., 'expires_at'=>...]
     */
    public function saveOAuth(
        int $organizationId,
        string $provider,
        ?string $externalAccountId,
        array $secrets,
        array $settings = [],
        ?int $userId = null
    ): array {
        return $this->upsert($organizationId, $provider, [
            'auth_type'           => 'oauth',
            'external_account_id' => $externalAccountId,
            'settings'            => $settings,
            'secrets'             => $secrets,
        ], $userId, false);
    }

    public function setEnabled(int $organizationId, string $provider, bool $enabled): void
    {
        $row = $this->model->findOne($organizationId, $provider);
        if ($row) {
            $this->model->update($row['id'], ['is_enabled' => $enabled ? 1 : 0]);
        }
    }

    public function disconnect(int $organizationId, string $provider): void
    {
        $row = $this->model->findOne($organizationId, $provider);
        if ($row) {
            $this->model->delete($row['id']);
        }
    }

    /**
     * Insert or merge-update an integration row.
     *
     * @param array{auth_type?:string, external_account_id?:?string, settings?:array, secrets?:array} $data
     * @param bool $keepExistingSecrets When true, don't overwrite stored secrets.
     */
    protected function upsert(
        int $organizationId,
        string $provider,
        array $data,
        ?int $userId,
        bool $keepExistingSecrets
    ): array {
        $existing = $this->model->findOne($organizationId, $provider);

        $settings = $data['settings'] ?? [];
        if ($existing) {
            $settings = array_merge($this->decodeJson($existing['settings'] ?? null), $settings);
        }

        $secrets = $data['secrets'] ?? [];
        if ($keepExistingSecrets && $existing) {
            $secrets = $this->decodeSecrets($existing['secrets_encrypted'] ?? null);
        } elseif ($existing && !empty($secrets)) {
            // Merge so partial secret updates don't wipe other tokens.
            $secrets = array_merge($this->decodeSecrets($existing['secrets_encrypted'] ?? null), $secrets);
        }

        $payload = [
            'organization_id'     => $organizationId,
            'provider'            => $provider,
            'auth_type'           => $data['auth_type'] ?? ($existing['auth_type'] ?? 'api_key'),
            'external_account_id' => $data['external_account_id'] ?? ($existing['external_account_id'] ?? null),
            'settings'            => json_encode($settings),
            'secrets_encrypted'   => !empty($secrets) ? SecretCipher::encrypt(json_encode($secrets)) : null,
            'is_enabled'          => $existing['is_enabled'] ?? 1,
        ];

        if ($existing) {
            $this->model->update($existing['id'], $payload);
        } else {
            $payload['connected_by'] = $userId;
            $this->model->insert($payload);
        }

        return $this->getPublic($organizationId, $provider);
    }

    private function decodeJson(?string $json): array
    {
        if (!$json) {
            return [];
        }
        $decoded = json_decode($json, true);
        return is_array($decoded) ? $decoded : [];
    }

    private function decodeSecrets(?string $encrypted): array
    {
        $plain = SecretCipher::decrypt($encrypted);
        if (!$plain) {
            return [];
        }
        $decoded = json_decode($plain, true);
        return is_array($decoded) ? $decoded : [];
    }
}
