/**
 * Copies built desktop installers and auto-update metadata into public/downloads.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'desktop', 'dist-build');
const downloadsDir = path.join(root, 'public', 'downloads');

if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

if (!fs.existsSync(distDir)) {
    console.warn('No desktop/dist-build folder found. Run desktop pack first.');
    process.exit(0);
}

const installerMappings = [
    { pattern: /^FlowTrack-Setup\.exe$/i, target: 'FlowTrack-Setup.exe' },
    { pattern: /^FlowTrack-Tracker-Setup\.exe$/i, target: 'FlowTrack-Setup.exe' },
    { pattern: /^FlowTrack\.dmg$/i, target: 'FlowTrack.dmg' },
    { pattern: /^FlowTrack-Tracker\.dmg$/i, target: 'FlowTrack.dmg' },
    { pattern: /^FlowTrack\.zip$/i, target: 'FlowTrack.zip' },
    { pattern: /^FlowTrack-Tracker\.zip$/i, target: 'FlowTrack.zip' },
];

const passthroughPatterns = [
    /^latest\.yml$/i,
    /^latest-mac\.yml$/i,
    /^FlowTrack-Setup\.exe\.blockmap$/i,
    /^FlowTrack\.zip\.blockmap$/i,
];

const files = fs.readdirSync(distDir);
let copied = 0;

for (const file of files) {
    let handled = false;

    for (const { pattern, target } of installerMappings) {
        if (pattern.test(file)) {
            fs.copyFileSync(path.join(distDir, file), path.join(downloadsDir, target));
            console.log(`Published ${target}`);
            copied++;
            handled = true;
            break;
        }
    }

    if (handled) continue;

    for (const pattern of passthroughPatterns) {
        if (pattern.test(file)) {
            fs.copyFileSync(path.join(distDir, file), path.join(downloadsDir, file));
            console.log(`Published ${file}`);
            copied++;
            break;
        }
    }
}

if (copied === 0) {
    console.warn('No installer or update artifacts found in desktop/dist-build');
} else {
    console.log(`Published ${copied} file(s) to public/downloads/`);
}
