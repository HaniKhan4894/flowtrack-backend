<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\OAuthService;
use App\Services\AuthService;

class OAuthController extends ResourceController
{
    protected $format = 'json';
    protected OAuthService $oauthService;
    protected AuthService $authService;

    public function __construct()
    {
        $this->oauthService = new OAuthService();
        $this->authService = new AuthService();
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

    private function redirectToFrontend(array $params, string $path = '/login')
    {
        $frontend = rtrim((string) env('app.frontendURL', 'http://localhost:5173'), '/');
        $url = $frontend . $path . '?' . http_build_query($params);
        return redirect()->to($url);
    }
}
