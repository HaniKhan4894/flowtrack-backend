/**
 * electron-builder skips rcedit when signAndEditExecutable is false
 * (needed to avoid winCodeSign / win-unpacked symlink errors on Windows).
 * Stamp FlowTrack.exe ourselves so the installed app has the correct icon.
 */
const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
    if (context.electronPlatformName !== 'win32') {
        return;
    }

    const exeName = `${context.packager.appInfo.productFilename}.exe`;
    const exePath = path.join(context.appOutDir, exeName);
    const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');

    if (!fs.existsSync(exePath)) {
        console.warn(`[afterPack] EXE not found, skip icon embed: ${exePath}`);
        return;
    }
    if (!fs.existsSync(iconPath)) {
        console.warn(`[afterPack] Icon not found, skip icon embed: ${iconPath}`);
        return;
    }

    const { rcedit } = require('rcedit');
    await rcedit(exePath, {
        icon: iconPath,
        'version-string': {
            FileDescription: 'FlowTrack',
            ProductName: 'FlowTrack',
            CompanyName: 'FlowTrack',
            OriginalFilename: exeName,
        },
    });
    console.log(`[afterPack] Embedded FlowTrack icon into ${exePath}`);
};
