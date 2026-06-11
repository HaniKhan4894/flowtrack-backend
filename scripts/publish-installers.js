/**
 * Copies built desktop installers into public/downloads for web distribution.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'desktop', 'dist');
const downloadsDir = path.join(root, 'public', 'downloads');

if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

if (!fs.existsSync(distDir)) {
    console.warn('No desktop/dist folder found. Run desktop pack first.');
    process.exit(0);
}

const mappings = [
    { pattern: /^FlowTrack-Setup\.exe$/i, target: 'FlowTrack-Setup.exe' },
    { pattern: /^FlowTrack\.dmg$/i, target: 'FlowTrack.dmg' },
];

const files = fs.readdirSync(distDir);
let copied = 0;

for (const file of files) {
    for (const { pattern, target } of mappings) {
        if (pattern.test(file)) {
            fs.copyFileSync(path.join(distDir, file), path.join(downloadsDir, target));
            console.log(`Published ${target}`);
            copied++;
        }
    }
}

if (copied === 0) {
    console.warn('No installer artifacts found in desktop/dist');
} else {
    console.log(`Published ${copied} installer(s) to public/downloads/`);
}
