<?php

namespace App\Controllers\API\V1;

use App\Services\IntegrationService;
use App\Services\OAuthService;
use CodeIgniter\RESTful\ResourceController;

/**
 * Manage per-organization integrations (API-key based like OpenAI, and OAuth
 * based like GitHub). Platform OAuth *app* credentials remain in .env.
 */
class IntegrationController extends ResourceController
{
    protected IntegrationService $integrations;
    protected $format = 'json';

    /** Providers the org can configure with a plain API key. */
    private const API_KEY_PROVIDERS = ['openai'];

    /** Providers the org connects via OAuth. */
    private const OAUTH_PROVIDERS = ['github'];

    public function __construct()
    {
        $this->integrations = new IntegrationService();
    }

    /**
     * GET /api/v1/integrations
     */
    public function index()
    {
        try {
            $orgId = $this->orgId();
            return $this->respond(['success' => true, 'data' => $this->integrations->listPublic($orgId)]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/integrations/(:segment)
     */
    public function show($provider = null)
    {
        try {
            $orgId = $this->orgId();
            return $this->respond([
                'success' => true,
                'data' => $this->integrations->getPublic($orgId, (string) $provider),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/integrations/(:segment)
     * Body for api-key providers: { api_key?, model?, base_url? }
     */
    public function update($provider = null)
    {
        try {
            $orgId = $this->orgId();
            $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $provider = (string) $provider;

            if (!in_array($provider, self::API_KEY_PROVIDERS, true)) {
                return $this->fail('This integration cannot be configured with an API key.', 400);
            }

            $body = $this->request->getJSON(true) ?? [];

            $apiKey = array_key_exists('api_key', $body) ? trim((string) $body['api_key']) : null;
            // Empty string means "no change"; use disconnect to remove.
            if ($apiKey === '') {
                $apiKey = null;
            }

            $settings = [];
            if (!empty($body['model'])) {
                $settings['model'] = trim((string) $body['model']);
            }
            if (!empty($body['base_url'])) {
                $settings['base_url'] = rtrim(trim((string) $body['base_url']), '/');
            }

            // Must supply a key on first connect.
            $existing = $this->integrations->getPublic($orgId, $provider);
            if ($apiKey === null && !$existing['connected']) {
                return $this->fail('An API key is required to connect this integration.', 400);
            }

            $result = $this->integrations->saveApiKey($orgId, $provider, $apiKey, $settings, $userId);
            return $this->respond(['success' => true, 'message' => 'Integration saved', 'data' => $result]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/integrations/(:segment)/connect
     * Returns the provider authorization URL for OAuth-based integrations.
     */
    public function connect($provider = null)
    {
        try {
            $orgId = $this->orgId();
            $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            $provider = (string) $provider;

            if (!in_array($provider, self::OAUTH_PROVIDERS, true)) {
                return $this->fail('This integration does not support OAuth connect.', 400);
            }

            $oauth = new OAuthService();
            if (!$oauth->isSupported($provider)) {
                return $this->failNotFound('Unknown provider');
            }

            $url = $oauth->getIntegrationAuthorizationUrl($provider, $orgId, $userId);
            return $this->respond(['success' => true, 'data' => ['url' => $url]]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/integrations/(:segment)/toggle  { enabled: bool }
     */
    public function toggle($provider = null)
    {
        try {
            $orgId = $this->orgId();
            $body = $this->request->getJSON(true) ?? [];
            $enabled = (bool) ($body['enabled'] ?? true);
            $this->integrations->setEnabled($orgId, (string) $provider, $enabled);
            return $this->respond([
                'success' => true,
                'data' => $this->integrations->getPublic($orgId, (string) $provider),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * DELETE /api/v1/integrations/(:segment)
     */
    public function delete($provider = null)
    {
        try {
            $orgId = $this->orgId();
            $this->integrations->disconnect($orgId, (string) $provider);
            return $this->respond(['success' => true, 'message' => 'Integration disconnected']);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    private function orgId(): int
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if (!$orgId) {
            throw new \RuntimeException('Unauthorized');
        }
        return $orgId;
    }
}
