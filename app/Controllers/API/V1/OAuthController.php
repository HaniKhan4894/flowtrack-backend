<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\OAuthService;
use App\Services\AuthService;
use App\Services\IntegrationService;

class OAuthController extends ResourceController
{
    protected $format = 'json';
    protected OAuthService $oauthService;
    protected AuthService $authService;
    protected IntegrationService $integrationService;

    public function __construct()
    {
        $this->oauthService = new OAuthService();
        $this->authService = new AuthService();
        $this->integrationService = new IntegrationService();
    }

    /**
     * GET /api/v1/auth/{provider}/redirect
     * Redirects the browser to the provider's consent screen.
     */
    public function redirect(string $provider)
    {
        if (!$this->oauthService->isSupported($provider)) {
            return $this->failNotFound('Unknown OAuth provider');
        }

        try {
            $invitationToken = $this->request->getGet('invitation_token');
            $url = $this->oauthService->getAuthorizationUrl($provider, $invitationToken ?: null);
            return redirect()->to($url);
        } catch (\Throwable $e) {
            return $this->redirectToFrontend(['oauth_error' => $e->getMessage()]);
        }
    }

    /**
     * GET /api/v1/auth/{provider}/callback
     * Provider redirects here with ?code & ?state. We exchange, log the user
     * in, then bounce back to the frontend with tokens in the query string.
     */
    public function callback(string $provider)
    {
        if (!$this->oauthService->isSupported($provider)) {
            return $this->failNotFound('Unknown OAuth provider');
        }

        $error = $this->request->getGet('error');
        if ($error) {
            return $this->redirectToFrontend(['oauth_error' => (string) $error]);
        }

        $code = (string) ($this->request->getGet('code') ?? '');
        $state = (string) ($this->request->getGet('state') ?? '');

        if ($code === '' || $state === '') {
            return $this->redirectToFrontend(['oauth_error' => 'Missing authorization code.']);
        }

        try {
            $stateData = $this->oauthService->validateState($provider, $state);

            // Branch: connecting an org integration vs. logging a user in.
            if (($stateData['purpose'] ?? 'login') === 'integration') {
                return $this->completeIntegrationConnect($provider, $code, $stateData);
            }

            $profile = $this->oauthService->fetchProfile($provider, $code);

            $result = $this->authService->handleOAuthLogin(
                $provider,
                $profile,
                $stateData['invitation_token'] ?? null,
                $this->request->getUserAgent()->getAgentString(),
                $this->request->getIPAddress()
            );

            return $this->redirectToFrontend([
                'access_token'    => $result['tokens']['access_token'],
                'refresh_token'   => $result['tokens']['refresh_token'],
                'organization_id' => $result['tokens']['organization_id'] ?? '',
            ], '/auth/callback');
        } catch (\Throwable $e) {
            return $this->redirectToFrontend(['oauth_error' => $e->getMessage()]);
        }
    }

    /**
     * Store the org's connected provider account (token + profile) and bounce
     * back to the Integrations settings page.
     */
    private function completeIntegrationConnect(string $provider, string $code, array $stateData)
    {
        $orgId = (int) ($stateData['organization_id'] ?? 0);
        $userId = (int) ($stateData['user_id'] ?? 0);

        if (!$orgId) {
            return $this->redirectToFrontend(['integration_error' => 'Missing organization context.'], '/settings');
        }

        $result = $this->oauthService->completeIntegration($provider, $code);
        $profile = $result['profile'];

        $displayName = trim(($profile['first_name'] ?? '') . ' ' . ($profile['last_name'] ?? ''));

        $this->integrationService->saveOAuth(
            $orgId,
            $provider,
            (string) ($profile['provider_user_id'] ?? ''),
            ['access_token' => $result['access_token']],
            [
                'account_name'  => $displayName !== '' ? $displayName : ($profile['email'] ?? $provider),
                'account_email' => $profile['email'] ?? null,
                'avatar_url'    => $profile['avatar_url'] ?? null,
            ],
            $userId ?: null
        );

        return $this->redirectToFrontend([
            'connected' => $provider,
            'tab'       => 'integrations',
        ], '/settings');
    }

    private function redirectToFrontend(array $params, string $path = '/login')
    {
        $frontend = rtrim((string) env('app.frontendURL', 'http://localhost:5173'), '/');
        $url = $frontend . $path . '?' . http_build_query($params);
        return redirect()->to($url);
    }
}
