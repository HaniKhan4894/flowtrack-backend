const CREDENTIALS_EMAIL_KEY = 'flowtrack_saved_email';
const CREDENTIALS_PASSWORD_KEY = 'flowtrack_saved_password';

export interface SavedLoginCredentials {
    email: string;
    password: string;
}

export function saveLoginCredentials(email: string, password: string): void {
    localStorage.setItem(CREDENTIALS_EMAIL_KEY, email.trim());
    localStorage.setItem(CREDENTIALS_PASSWORD_KEY, password);
}

export function getSavedLoginCredentials(): SavedLoginCredentials | null {
    const email = localStorage.getItem(CREDENTIALS_EMAIL_KEY)?.trim() ?? '';
    const password = localStorage.getItem(CREDENTIALS_PASSWORD_KEY) ?? '';
    if (!email) {
        return null;
    }
    return { email, password };
}

export function clearSavedLoginCredentials(): void {
    localStorage.removeItem(CREDENTIALS_EMAIL_KEY);
    localStorage.removeItem(CREDENTIALS_PASSWORD_KEY);
}

export function persistAuthTokens(data: {
    access_token: string;
    refresh_token?: string | null;
    organization_id?: number | null;
}): void {
    localStorage.setItem('access_token', data.access_token);
    if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token);
    }
    if (data.organization_id) {
        localStorage.setItem('organization_id', String(data.organization_id));
    }
}

export function clearAuthTokens(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('organization_id');
    localStorage.removeItem('user');
    sessionStorage.clear();
}
