<?php

namespace Config;

use CodeIgniter\Config\BaseConfig;

/**
 * Social login (OAuth 2.0) provider configuration.
 *
 * Credentials are read from environment variables. Redirect URIs default to the
 * backend callback route when not explicitly set:
 *   {app.baseURL}/api/v1/auth/{provider}/callback
 */
class OAuth extends BaseConfig
{
    /**
     * Build the effective provider configuration, resolving env values and
     * default redirect URIs at runtime.
     *
     * @return array<string, array<string, mixed>>
     */
    public function providers(): array
    {
        return [
            'google' => [
                'client_id'      => (string) (env('GOOGLE_CLIENT_ID') ?: ''),
                'client_secret'  => (string) (env('GOOGLE_CLIENT_SECRET') ?: ''),
                'redirect_uri'   => $this->resolveRedirectUri('GOOGLE_REDIRECT_URI', 'google'),
                'authorize_url'  => 'https://accounts.google.com/o/oauth2/v2/auth',
                'token_url'      => 'https://oauth2.googleapis.com/token',
                'userinfo_url'   => 'https://www.googleapis.com/oauth2/v3/userinfo',
                'scope'          => 'openid email profile',
            ],
            'github' => [
                'client_id'      => (string) (env('GITHUB_CLIENT_ID') ?: ''),
                'client_secret'  => (string) (env('GITHUB_CLIENT_SECRET') ?: ''),
                'redirect_uri'   => $this->resolveRedirectUri('GITHUB_REDIRECT_URI', 'github'),
                'authorize_url'  => 'https://github.com/login/oauth/authorize',
                'token_url'      => 'https://github.com/login/oauth/access_token',
                'userinfo_url'   => 'https://api.github.com/user',
                'emails_url'     => 'https://api.github.com/user/emails',
                'scope'          => 'read:user user:email',
            ],
        ];
    }

    public function provider(string $name): ?array
    {
        $providers = $this->providers();
        return $providers[$name] ?? null;
    }

    private function resolveRedirectUri(string $envKey, string $provider): string
    {
        $configured = (string) (env($envKey) ?: '');
        if ($configured !== '') {
            return $configured;
        }

        $baseUrl = rtrim((string) config('App')->baseURL, '/');
        return $baseUrl . '/api/v1/auth/' . $provider . '/callback';
    }
}
