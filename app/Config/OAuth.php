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
                // Broader scope when connecting GitHub as an org integration
                // (lets us read repos/commits for later features).
                'integration_scope' => 'read:user user:email repo',
            ],
            'slack' => [
                'client_id'      => (string) (env('SLACK_CLIENT_ID') ?: ''),
                'client_secret'  => (string) (env('SLACK_CLIENT_SECRET') ?: ''),
                'redirect_uri'   => $this->resolveRedirectUri('SLACK_REDIRECT_URI', 'slack'),
                'authorize_url'  => 'https://slack.com/oauth/v2/authorize',
                'token_url'      => 'https://slack.com/api/oauth.v2.access',
                // Bot scopes: post messages + receive an incoming webhook to a channel.
                'scope'             => 'incoming-webhook,chat:write',
                'integration_scope' => 'incoming-webhook,chat:write',
            ],
            'jira' => [
                'client_id'      => (string) (env('JIRA_CLIENT_ID') ?: ''),
                'client_secret'  => (string) (env('JIRA_CLIENT_SECRET') ?: ''),
                'redirect_uri'   => $this->resolveRedirectUri('JIRA_REDIRECT_URI', 'jira'),
                'authorize_url'  => 'https://auth.atlassian.com/authorize',
                'token_url'      => 'https://auth.atlassian.com/oauth/token',
                'resources_url'  => 'https://api.atlassian.com/oauth/token/accessible-resources',
                'api_base'       => 'https://api.atlassian.com/ex/jira',
                // offline_access → refresh token so we can keep the connection alive.
                'scope'             => 'read:jira-work read:jira-user write:jira-work offline_access',
                'integration_scope' => 'read:jira-work read:jira-user write:jira-work offline_access',
            ],
            // Google Calendar. Falls back to the Google login app credentials so
            // teams don't have to register a second OAuth app (just add the
            // /api/v1/auth/google_calendar/callback redirect URI in Google Cloud).
            'google_calendar' => [
                'client_id'      => (string) (env('GOOGLE_CALENDAR_CLIENT_ID') ?: env('GOOGLE_CLIENT_ID') ?: ''),
                'client_secret'  => (string) (env('GOOGLE_CALENDAR_CLIENT_SECRET') ?: env('GOOGLE_CLIENT_SECRET') ?: ''),
                'redirect_uri'   => $this->resolveRedirectUri('GOOGLE_CALENDAR_REDIRECT_URI', 'google_calendar'),
                'authorize_url'  => 'https://accounts.google.com/o/oauth2/v2/auth',
                'token_url'      => 'https://oauth2.googleapis.com/token',
                'userinfo_url'   => 'https://www.googleapis.com/oauth2/v3/userinfo',
                'api_base'       => 'https://www.googleapis.com/calendar/v3',
                'scope'             => 'openid email https://www.googleapis.com/auth/calendar.readonly',
                'integration_scope' => 'openid email https://www.googleapis.com/auth/calendar.readonly',
            ],
            // Microsoft 365 / Outlook Calendar via Microsoft Graph.
            'microsoft' => [
                'client_id'      => (string) (env('MICROSOFT_CLIENT_ID') ?: ''),
                'client_secret'  => (string) (env('MICROSOFT_CLIENT_SECRET') ?: ''),
                'redirect_uri'   => $this->resolveRedirectUri('MICROSOFT_REDIRECT_URI', 'microsoft'),
                'authorize_url'  => 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
                'token_url'      => 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
                'userinfo_url'   => 'https://graph.microsoft.com/v1.0/me',
                'api_base'       => 'https://graph.microsoft.com/v1.0',
                'scope'             => 'offline_access openid email User.Read Calendars.Read',
                'integration_scope' => 'offline_access openid email User.Read Calendars.Read',
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
