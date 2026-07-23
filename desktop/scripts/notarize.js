/** Notarize macOS builds when Apple credentials are present (CI or local). */
const { notarize } = require('@electron/notarize');

module.exports = async function notarizeMac(context) {
    if (context.electronPlatformName !== 'darwin') {
        return;
    }

    if (process.env.SKIP_NOTARIZE === 'true') {
        console.log('[Notarize] Skipped — SKIP_NOTARIZE=true');
        return;
    }

    const hasApiKey = Boolean(
        process.env.APPLE_API_KEY
        && process.env.APPLE_API_KEY_ID
        && process.env.APPLE_API_ISSUER,
    );
    const hasAppleId = Boolean(
        process.env.APPLE_ID
        && process.env.APPLE_APP_SPECIFIC_PASSWORD
        && process.env.APPLE_TEAM_ID,
    );

    if (!hasApiKey && !hasAppleId) {
        console.log('[Notarize] Skipped — no Apple notarization credentials configured.');
        return;
    }

    const appName = context.packager.appInfo.productFilename;
    const appPath = `${context.appOutDir}/${appName}.app`;
    console.log(`[Notarize] Submitting ${appPath}...`);

    const options = { appPath, teamId: process.env.APPLE_TEAM_ID };

    if (hasApiKey) {
        options.appleApiKey = process.env.APPLE_API_KEY;
        options.appleApiKeyId = process.env.APPLE_API_KEY_ID;
        options.appleApiIssuer = process.env.APPLE_API_ISSUER;
    } else {
        options.appleId = process.env.APPLE_ID;
        options.appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
    }

    await notarize(options);
    console.log('[Notarize] Completed successfully.');
};
