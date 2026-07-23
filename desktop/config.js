const fs = require('fs');
const path = require('path');

const DEFAULT_API_BASE_URL =
    'https://violation-blade-pretty.ngrok-free.dev/flowtrack-backend/public/api/v1';
const DEFAULT_FRONTEND_URL = 'https://flowtrackhani.vercel.app';

function readDeployConfigFromPath(deployPath) {
    if (!fs.existsSync(deployPath)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(deployPath, 'utf8'));
    } catch {
        return null;
    }
}

function readDeployConfig() {
    return readDeployConfigFromPath(path.join(__dirname, '..', 'config', 'deploy.json'));
}

function getPackagedDeployConfig() {
    if (!process.resourcesPath) {
        return null;
    }
    return readDeployConfigFromPath(path.join(process.resourcesPath, 'config', 'deploy.json'));
}

function loadFromBuildEnv(key) {
    const buildEnvPath = path.join(__dirname, '.env.build');
    if (!fs.existsSync(buildEnvPath)) {
        return null;
    }
    const match = fs.readFileSync(buildEnvPath, 'utf8').match(new RegExp(`${key}=(.+)`));
    return match?.[1]?.trim() || null;
}

function loadApiBaseUrl() {
    if (process.env.FLOWTRACK_API_URL) {
        return process.env.FLOWTRACK_API_URL.replace(/\/$/, '');
    }

    const fromBuild = loadFromBuildEnv('FLOWTRACK_API_URL');
    if (fromBuild) {
        return fromBuild.replace(/\/$/, '');
    }

    const packaged = getPackagedDeployConfig();
    if (packaged?.apiBaseUrl) {
        return packaged.apiBaseUrl.replace(/\/$/, '');
    }

    const deploy = readDeployConfig();
    if (deploy?.apiBaseUrl) {
        return deploy.apiBaseUrl.replace(/\/$/, '');
    }

    return DEFAULT_API_BASE_URL;
}

function loadFrontendUrl() {
    if (process.env.FLOWTRACK_FRONTEND_URL) {
        return process.env.FLOWTRACK_FRONTEND_URL.replace(/\/$/, '');
    }

    const fromBuild = loadFromBuildEnv('FLOWTRACK_FRONTEND_URL');
    if (fromBuild) {
        return fromBuild.replace(/\/$/, '');
    }

    const packaged = getPackagedDeployConfig();
    if (packaged?.frontendUrl) {
        return packaged.frontendUrl.replace(/\/$/, '');
    }

    const deploy = readDeployConfig();
    if (deploy?.frontendUrl) {
        return deploy.frontendUrl.replace(/\/$/, '');
    }

    return DEFAULT_FRONTEND_URL;
}

const DEFAULT_PUBLIC_BASE_URL =
    'https://violation-blade-pretty.ngrok-free.dev/flowtrack-backend/public';

function loadPublicBaseUrl() {
    if (process.env.FLOWTRACK_PUBLIC_URL) {
        return process.env.FLOWTRACK_PUBLIC_URL.replace(/\/$/, '');
    }

    const fromBuild = loadFromBuildEnv('FLOWTRACK_PUBLIC_URL');
    if (fromBuild) {
        return fromBuild.replace(/\/$/, '');
    }

    const packaged = getPackagedDeployConfig();
    if (packaged?.publicBaseUrl) {
        return packaged.publicBaseUrl.replace(/\/$/, '');
    }

    const deploy = readDeployConfig();
    if (deploy?.publicBaseUrl) {
        return deploy.publicBaseUrl.replace(/\/$/, '');
    }

    return DEFAULT_PUBLIC_BASE_URL;
}

const API_BASE_URL = loadApiBaseUrl();
const FRONTEND_URL = loadFrontendUrl();
const PUBLIC_BASE_URL = loadPublicBaseUrl();

function getUpdateFeedUrl() {
    return `${PUBLIC_BASE_URL.replace(/\/$/, '')}/downloads`;
}

function getApiHeaders(extra = {}) {
    const headers = { ...extra };
    if (API_BASE_URL.includes('ngrok')) {
        headers['ngrok-skip-browser-warning'] = 'true';
    }
    return headers;
}

module.exports = {
    API_BASE_URL,
    FRONTEND_URL,
    PUBLIC_BASE_URL,
    getUpdateFeedUrl,
    getApiHeaders,
};
