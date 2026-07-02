import { API_BASE_URL } from '../api/client';

export type OAuthProvider = 'google' | 'github';

/**
 * Redirect the browser to the backend OAuth entry point, which in turn bounces
 * to the provider's consent screen. On success the backend redirects back to
 * the frontend `/auth/callback` route with tokens in the query string.
 */
export function startOAuthLogin(provider: OAuthProvider, invitationToken?: string | null): void {
    const base = API_BASE_URL.replace(/\/$/, '');
    const url = new URL(`${base}/auth/${provider}/redirect`);
    if (invitationToken) {
        url.searchParams.set('invitation_token', invitationToken);
    }
    window.location.href = url.toString();
}
