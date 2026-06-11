/**
 * Syncs config/deploy.json into frontend and desktop build env files.
 * Run before production/desktop builds. Update deploy.json when changing API URL.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const deployPath = path.join(root, 'config', 'deploy.json');

if (!fs.existsSync(deployPath)) {
    console.error('Missing config/deploy.json');
    process.exit(1);
}

const deploy = JSON.parse(fs.readFileSync(deployPath, 'utf8'));
const apiBaseUrl = deploy.apiBaseUrl;
const publicBaseUrl = deploy.publicBaseUrl || apiBaseUrl.replace(/\/api\/v1\/?$/, '');
const frontendUrl = (deploy.frontendUrl || '').replace(/\/$/, '');
const apiProxyTarget = apiBaseUrl.replace(/\/api\/v1\/?$/, '');

// Web uses same-origin /api proxy (Vercel + Vite dev) to avoid browser CORS/ngrok preflight issues.
const frontendEnv = [
    'VITE_API_URL=/api/v1',
    `VITE_PUBLIC_URL=${publicBaseUrl}`,
    `VITE_DESKTOP_WIN_URL=${publicBaseUrl}/downloads/FlowTrack-Setup.exe`,
    `VITE_DESKTOP_MAC_URL=${publicBaseUrl}/downloads/FlowTrack.dmg`,
    '',
].join('\n');

fs.writeFileSync(path.join(root, 'frontend', '.env.production'), frontendEnv);

const vercelConfig = {
    rewrites: [
        {
            source: '/api/:path*',
            destination: `${apiProxyTarget}/api/:path*`,
        },
    ],
};
fs.writeFileSync(
    path.join(root, 'frontend', 'vercel.json'),
    `${JSON.stringify(vercelConfig, null, 2)}\n`
);

const desktopBuildEnv = [`FLOWTRACK_API_URL=${apiBaseUrl}`];
if (frontendUrl) {
    desktopBuildEnv.push(`FLOWTRACK_FRONTEND_URL=${frontendUrl}`);
}
desktopBuildEnv.push('');
fs.writeFileSync(path.join(root, 'desktop', '.env.build'), desktopBuildEnv.join('\n'));

console.log('Synced deploy config:');
console.log(`  API (desktop): ${apiBaseUrl}`);
console.log(`  API (web proxy): /api/v1 -> ${apiProxyTarget}/api/*`);
console.log(`  Public: ${publicBaseUrl}`);
if (frontendUrl) {
    console.log(`  Frontend: ${frontendUrl}`);
}
