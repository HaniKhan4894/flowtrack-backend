<?php

namespace App\Services;

use App\Libraries\JWTHandler;
use Config\OAuth as OAuthConfig;

/**
 * Handles the OAuth 2.0 authorization-code flow for social login providers
 * (Google, GitHub). Stateless: the CSRF "state" is a short-lived signed JWT.
 */
class OAuthService
{
    protected OAuthConfig $config;
    protected JWTHandler $jwt;

    public function __construct()
    {
        $this->config = new OAuthConfig();
        $this->jwt = new JWTHandler();
    }

    public function isSupported(string $provider): bool
    {
        return $this->config->provider($provider) !== null;
    }

    /**
     * Build the provider authorization URL the user should be redirected to.
     */
    public function getAuthorizationUrl(string $provider, ?string $invitationToken = null): string
    {
        $cfg = $this->requireProvider($provider);

        if ($cfg['client_id'] === '') {
            throw new \RuntimeException(ucfirst($provider) . ' login is not configured on the server.');
        }

        $state = $this->createState($provider, [
            'purpose'          => 'login',
            'invitation_token' => $invitationToken,
        ]);

        $params = [
            'client_id'     => $cfg['client_id'],
            'redirect_uri'  => $cfg['redirect_uri'],
            'response_type' => 'code',
            'scope'         => $cfg['scope'],
            'state'         => $state,
        ];

        if ($provider === 'google') {
            $params['access_type'] = 'online';
            $params['prompt'] = 'select_account';
        }

        return $cfg['authorize_url'] . '?' . http_build_query($params);
    }

    /**
     * Build an authorization URL for connecting a provider as an ORG-LEVEL
     * integration (reuses the same OAuth app / callback as login; the state
     * carries the org + user + purpose so the callback can branch).
     */
    public function getIntegrationAuthorizationUrl(string $provider, int $organizationId, int $userId): string
    {
        $cfg = $this->requireProvider($provider);

        if ($cfg['client_id'] === '') {
            throw new \RuntimeException(ucfirst($provider) . ' is not configured on the server.');
        }

        $state = $this->createState($provider, [
            'purpose'         => 'integration',
            'organization_id' => $organizationId,
            'user_id'         => $userId,
        ]);

        $params = [
            'client_id'     => $cfg['client_id'],
            'redirect_uri'  => $cfg['redirect_uri'],
            'response_type' => 'code',
            'scope'         => $cfg['integration_scope'] ?? $cfg['scope'],
            'state'         => $state,
        ];

        if ($provider === 'google') {
            $params['access_type'] = 'offline';
            $params['prompt'] = 'consent';
        }

        return $cfg['authorize_url'] . '?' . http_build_query($params);
    }

    /**
     * Exchange the code and return both the access token and normalized profile
     * (used when connecting an org integration, where we must store the token).
     *
     * @return array{access_token:string, profile:array}
     */
    public function completeIntegration(string $provider, string $code): array
    {
        $accessToken = $this->exchangeCodeForToken($provider, $code);
        $profile = $provider === 'github'
            ? $this->fetchGithubProfile($accessToken)
            : $this->fetchGoogleProfile($accessToken);

        return ['access_token' => $accessToken, 'profile' => $profile];
    }

    /**
     * Validate the returned state token and return its decoded payload.
     *
     * @return array{provider:string, invitation_token:?string}
     */
    public function validateState(string $provider, string $state): array
    {
        $data = $this->jwt->getUserFromToken($state);
        if (!$data || ($data['oauth_state'] ?? null) !== true || ($data['provider'] ?? null) !== $provider) {
            throw new \RuntimeException('Invalid or expired OAuth state.');
        }

        return [
            'provider'         => $provider,
            'purpose'          => $data['purpose'] ?? 'login',
            'invitation_token' => $data['invitation_token'] ?? null,
            'organization_id'  => isset($data['organization_id']) ? (int) $data['organization_id'] : null,
            'user_id'          => isset($data['user_id']) ? (int) $data['user_id'] : null,
        ];
    }

    /**
     * Exchange the authorization code for a normalized user profile.
     *
     * @return array{provider_user_id:string, email:?string, email_verified:bool, first_name:string, last_name:string, avatar_url:?string}
     */
    public function fetchProfile(string $provider, string $code): array
    {
        $accessToken = $this->exchangeCodeForToken($provider, $code);

        return $provider === 'github'
            ? $this->fetchGithubProfile($accessToken)
            : $this->fetchGoogleProfile($accessToken);
    }

    private function exchangeCodeForToken(string $provider, string $code): string
    {
        $cfg = $this->requireProvider($provider);
        $client = \Config\Services::curlrequest(['timeout' => 20, 'http_errors' => false]);

        $response = $client->post($cfg['token_url'], [
            'headers' => ['Accept' => 'application/json'],
            'form_params' => [
                'client_id'     => $cfg['client_id'],
                'client_secret' => $cfg['client_secret'],
                'code'          => $code,
                'redirect_uri'  => $cfg['redirect_uri'],
                'grant_type'    => 'authorization_code',
            ],
        ]);

        $raw = (string) $response->getBody();
        $body = json_decode($raw, true);

        // GitHub may return a form-encoded body (access_token=...&scope=...).
        if (!is_array($body)) {
            $parsed = [];
            parse_str($raw, $parsed);
            $body = $parsed;
        }

        if (!is_array($body) || empty($body['access_token'])) {
            $error = is_array($body) ? ($body['error_description'] ?? $body['error'] ?? null) : null;
            throw new \RuntimeException('Failed to obtain ' . $provider . ' access token' . ($error ? ': ' . $error : '.'));
        }

        return (string) $body['access_token'];
    }

    private function fetchGoogleProfile(string $accessToken): array
    {
        $cfg = $this->requireProvider('google');
        $client = \Config\Services::curlrequest(['timeout' => 20, 'http_errors' => false]);

        $response = $client->get($cfg['userinfo_url'], [
            'headers' => ['Authorization' => 'Bearer ' . $accessToken],
        ]);

        $data = json_decode((string) $response->getBody(), true);
        if (!is_array($data) || empty($data['sub'])) {
            throw new \RuntimeException('Failed to fetch Google profile.');
        }

        return [
            'provider_user_id' => (string) $data['sub'],
            'email'            => $data['email'] ?? null,
            'email_verified'   => (bool) ($data['email_verified'] ?? false),
            'first_name'       => (string) ($data['given_name'] ?? ''),
            'last_name'        => (string) ($data['family_name'] ?? ''),
            'avatar_url'       => $data['picture'] ?? null,
        ];
    }

    private function fetchGithubProfile(string $accessToken): array
    {
        $cfg = $this->requireProvider('github');
        $headers = [
            'Authorization' => 'Bearer ' . $accessToken,
            'Accept'        => 'application/vnd.github+json',
            'User-Agent'    => 'FlowTrack-OAuth',
        ];
        $client = \Config\Services::curlrequest(['timeout' => 20, 'http_errors' => false]);

        $response = $client->get($cfg['userinfo_url'], ['headers' => $headers]);
        $data = json_decode((string) $response->getBody(), true);
        if (!is_array($data) || empty($data['id'])) {
            throw new \RuntimeException('Failed to fetch GitHub profile.');
        }

        $email = $data['email'] ?? null;
        $emailVerified = false;

        // GitHub often hides the email on the profile; resolve the primary email.
        if (!$email && !empty($cfg['emails_url'])) {
            $emailsResponse = $client->get($cfg['emails_url'], ['headers' => $headers]);
            $emails = json_decode((string) $emailsResponse->getBody(), true);
            if (is_array($emails)) {
                foreach ($emails as $entry) {
                    if (!empty($entry['primary'])) {
                        $email = $entry['email'] ?? null;
                        $emailVerified = (bool) ($entry['verified'] ?? false);
                        break;
                    }
                }
            }
        }

        $name = trim((string) ($data['name'] ?? ''));
        $firstName = $name;
        $lastName = '';
        if ($name !== '' && strpos($name, ' ') !== false) {
            [$firstName, $lastName] = explode(' ', $name, 2);
        }
        if ($firstName === '') {
            $firstName = (string) ($data['login'] ?? 'GitHub User');
        }

        return [
            'provider_user_id' => (string) $data['id'],
            'email'            => $email,
            'email_verified'   => $emailVerified,
            'first_name'       => $firstName,
            'last_name'        => $lastName,
            'avatar_url'       => $data['avatar_url'] ?? null,
        ];
    }

    private function createState(string $provider, array $extra = []): string
    {
        return $this->jwt->generateAccessToken(array_merge([
            'oauth_state' => true,
            'provider'    => $provider,
            'purpose'     => 'login',
            'nonce'       => bin2hex(random_bytes(8)),
        ], $extra), 600);
    }

    private function requireProvider(string $provider): array
    {
        $cfg = $this->config->provider($provider);
        if ($cfg === null) {
            throw new \RuntimeException('Unsupported OAuth provider: ' . $provider);
        }
        return $cfg;
    }
}
