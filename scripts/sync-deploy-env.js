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

const frontendEnv = [
    `VITE_API_URL=${apiBaseUrl}`,
    `VITE_PUBLIC_URL=${publicBaseUrl}`,
    `VITE_SITE_URL=${frontendUrl || 'https://flowtrackhani.vercel.app'}`,
    `VITE_DESKTOP_WIN_URL=${publicBaseUrl}/downloads/FlowTrack-Setup.exe`,
    `VITE_DESKTOP_MAC_URL=${publicBaseUrl}/downloads/FlowTrack.dmg`,
    '',
].join('\n');

fs.writeFileSync(path.join(root, 'frontend', '.env.production'), frontendEnv);
// Keep local Vite in sync too — otherwise `npm run dev` keeps calling a dead ngrok URL.
fs.writeFileSync(path.join(root, 'frontend', '.env'), frontendEnv);

const siteUrl = frontendUrl || 'https://flowtrackhani.vercel.app';
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${siteUrl}/register</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${siteUrl}/privacy</loc>
    <changefreq>yearly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${siteUrl}/terms</loc>
    <changefreq>yearly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>
`;

const robots = `# https://www.robotstxt.org/robotstxt.html
User-agent: *
Allow: /
Disallow: /app
Disallow: /time
Disallow: /activity
Disallow: /screenshots
Disallow: /projects
Disallow: /billing
Disallow: /team
Disallow: /settings
Disallow: /analytics
Disallow: /invoices
Disallow: /login
Disallow: /tracker

Sitemap: ${siteUrl}/sitemap.xml
`;

const publicDir = path.join(root, 'frontend', 'public');
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap);
fs.writeFileSync(path.join(publicDir, 'robots.txt'), robots);

const desktopBuildEnv = [`FLOWTRACK_API_URL=${apiBaseUrl}`, `FLOWTRACK_PUBLIC_URL=${publicBaseUrl}`];
if (frontendUrl) {
    desktopBuildEnv.push(`FLOWTRACK_FRONTEND_URL=${frontendUrl}`);
}
desktopBuildEnv.push('');
fs.writeFileSync(path.join(root, 'desktop', '.env.build'), desktopBuildEnv.join('\n'));

console.log('Synced deploy config:');
console.log(`  API: ${apiBaseUrl}`);
console.log(`  Public: ${publicBaseUrl}`);
if (frontendUrl) {
    console.log(`  Frontend: ${frontendUrl}`);
}
