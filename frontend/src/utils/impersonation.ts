import type { ImpersonationSession } from '../types/admin';
import type { User } from '../types';

const STORAGE_KEY = 'flowtrack_impersonation';

export interface ImpersonationState {
    session_id: number;
    expires_at: string;
    target_user_id: number;
    target_name: string;
    target_email: string;
    /** Super-admin session, restored when impersonation ends. */
    admin_access_token: string | null;
    admin_refresh_token: string | null;
    admin_organization_id: string | null;
    admin_user: string | null;
}

export function getImpersonation(): ImpersonationState | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as ImpersonationState;
    } catch {
        localStorage.removeItem(STORAGE_KEY);
        return null;
    }
}

export function isImpersonating(): boolean {
    return getImpersonation() !== null;
}

/**
 * Swap the stored session for the impersonated user.
 *
 * No refresh token is stored, so the impersonated session cannot be extended
 * and simply expires when the short-lived access token does.
 */
export function beginImpersonation(session: ImpersonationSession): void {
    const state: ImpersonationState = {
        session_id: session.session_id,
        expires_at: session.expires_at,
        target_user_id: session.user?.id ?? 0,
        target_name: [session.user?.first_name, session.user?.last_name].filter(Boolean).join(' ') || (session.user?.email ?? 'user'),
        target_email: session.user?.email ?? '',
        admin_access_token: localStorage.getItem('access_token'),
        admin_refresh_token: localStorage.getItem('refresh_token'),
        admin_organization_id: localStorage.getItem('organization_id'),
        admin_user: localStorage.getItem('user'),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem('access_token', session.access_token);
    localStorage.removeItem('refresh_token');
    if (session.organization_id) {
        localStorage.setItem('organization_id', String(session.organization_id));
    } else {
        localStorage.removeItem('organization_id');
    }
    if (session.user) {
        localStorage.setItem('user', JSON.stringify(session.user as User));
    }
}

/**
 * Restore the super-admin session. Returns the ended session id so the caller
 * can notify the API.
 */
export function restoreAdminSession(): number | null {
    const state = getImpersonation();
    if (!state) return null;

    if (state.admin_access_token) {
        localStorage.setItem('access_token', state.admin_access_token);
    } else {
        localStorage.removeItem('access_token');
    }

    if (state.admin_refresh_token) {
        localStorage.setItem('refresh_token', state.admin_refresh_token);
    } else {
        localStorage.removeItem('refresh_token');
    }

    if (state.admin_organization_id) {
        localStorage.setItem('organization_id', state.admin_organization_id);
    } else {
        localStorage.removeItem('organization_id');
    }

    if (state.admin_user) {
        localStorage.setItem('user', state.admin_user);
    } else {
        localStorage.removeItem('user');
    }

    localStorage.removeItem(STORAGE_KEY);

    return state.session_id;
}
