/**
 * Normalizes build/icon.png to 512x512 and generates icon.ico for electron-builder.
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

    const icoBuffer = await pngToIco(normalizedPng);
    fs.writeFileSync(iconIco, icoBuffer);

    console.log('Generated desktop icons:');
    console.log(`  ${sourcePng} (512x512)`);
    console.log(`  ${iconIco}`);
    console.log(`  ${trayIcon}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
