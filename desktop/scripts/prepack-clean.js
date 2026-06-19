/**
 * Stop packaged FlowTrack and remove desktop/dist-build before electron-builder runs.
 * Also attempts to remove legacy desktop/dist (best effort).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const desktopDir = path.join(__dirname, '..');
const outputDir = path.join(desktopDir, 'dist-build');
const legacyDistDir = path.join(desktopDir, 'dist');

function sleep(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        // busy wait for Windows file handle release
    }
}

function tryKill(processName) {
    if (process.platform !== 'win32') return;
    try {
        execSync(`taskkill /IM ${processName} /F /T`, { stdio: 'ignore' });
        console.log(`Stopped ${processName}`);
    } catch {
        // not running
    }
}

function removeDir(dirPath, label, { required = true, retries = 5 } = {}) {
    if (!fs.existsSync(dirPath)) {
        return true;
    }
    for (let i = 0; i < retries; i += 1) {
        try {
            fs.rmSync(dirPath, { recursive: true, force: true });
            console.log(`Removed ${label}`);
            return true;
        } catch (err) {
            if (i === retries - 1) {
                if (!required) {
                    console.warn(`Could not remove ${label} (in use — safe to ignore if unused)`);
                    return false;
                }
                console.error(`\nCould not remove ${label} — close FlowTrack and retry:`);
                console.error('  1. Quit FlowTrack (system tray → Exit)');
                console.error('  2. Close any app running from desktop\\dist-build\\win-unpacked');
                console.error('  3. Run: npm run build:desktop:win\n');
                throw err;
            }
            sleep(800);
        }
    }
    return false;
}

console.log('Preparing desktop build...');
tryKill('FlowTrack.exe');
tryKill('FlowTrack Setup.exe');
removeDir(legacyDistDir, 'desktop/dist (legacy)', { required: false });
removeDir(outputDir, 'desktop/dist-build', { required: true });
console.log('Ready to pack.\n');
