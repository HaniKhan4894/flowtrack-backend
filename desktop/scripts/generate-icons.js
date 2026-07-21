/**
 * Normalizes build/icon.png to 512x512, builds a multi-size .ico for Windows,
 * and stamps the local Electron binary so the taskbar shows FlowTrack in dev.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const desktopRoot = path.join(__dirname, '..');
const buildDir = path.join(desktopRoot, 'build');
const sourcePng = path.join(buildDir, 'icon.png');
const normalizedPng = path.join(buildDir, 'icon-512.png');
const iconIco = path.join(buildDir, 'icon.ico');
const trayIcon = path.join(desktopRoot, 'icon.png');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function stampElectronBinary(icoPath) {
    if (process.platform !== 'win32') return;

    let electronExe;
    try {
        // When required from Node (not Electron), this is the path to electron.exe.
        electronExe = require('electron');
    } catch {
        return;
    }

    if (!electronExe || typeof electronExe !== 'string' || !fs.existsSync(electronExe)) {
        return;
    }

    try {
        const { rcedit } = require('rcedit');
        await rcedit(electronExe, { icon: icoPath });
        console.log(`Stamped Electron taskbar icon: ${electronExe}`);
    } catch (err) {
        console.warn(`Could not stamp electron.exe icon: ${err.message}`);
    }
}

async function main() {
    if (!fs.existsSync(sourcePng)) {
        console.error('Missing desktop/build/icon.png — add a square PNG (512x512 recommended).');
        process.exit(1);
    }

    await sharp(sourcePng)
        .resize(512, 512, { fit: 'cover', position: 'centre' })
        .png()
        .toFile(normalizedPng);

    fs.copyFileSync(normalizedPng, sourcePng);
    fs.copyFileSync(normalizedPng, trayIcon);

    const sizedPngs = await Promise.all(
        ICO_SIZES.map((size) =>
            sharp(normalizedPng)
                .resize(size, size, { fit: 'cover', position: 'centre' })
                .png()
                .toBuffer(),
        ),
    );
    const icoBuffer = await pngToIco(sizedPngs);
    fs.writeFileSync(iconIco, icoBuffer);

    await stampElectronBinary(iconIco);

    console.log('Generated desktop icons:');
    console.log(`  ${sourcePng} (512x512)`);
    console.log(`  ${iconIco} (sizes: ${ICO_SIZES.join(', ')})`);
    console.log(`  ${trayIcon}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
