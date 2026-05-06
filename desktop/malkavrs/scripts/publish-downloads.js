#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const desktopRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopRoot, '..', '..');
const releaseDir = path.join(desktopRoot, 'release');
const downloadsDir = path.join(repoRoot, 'downloads');

const targets = [
    {
        platform: 'macOS',
        pattern: /\.dmg$/i,
        destination: 'MalkaVRS-Desktop.dmg'
    },
    {
        platform: 'Windows',
        pattern: /\.exe$/i,
        destination: 'MalkaVRS-Desktop.exe'
    }
];

function findArtifact(pattern) {
    if (!fs.existsSync(releaseDir)) {
        return null;
    }

    return fs.readdirSync(releaseDir)
        .filter(file => pattern.test(file))
        .map(file => path.join(releaseDir, file))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
}

function copyArtifact(target) {
    const source = findArtifact(target.pattern);
    if (!source) {
        throw new Error(`Missing ${target.platform} installer in ${releaseDir}`);
    }

    const stat = fs.statSync(source);
    if (!stat.isFile() || stat.size === 0) {
        throw new Error(`${target.platform} installer is empty: ${source}`);
    }

    fs.mkdirSync(downloadsDir, { recursive: true });
    const destination = path.join(downloadsDir, target.destination);
    fs.copyFileSync(source, destination);
    process.stdout.write(`${target.platform}: ${source} -> ${destination}\n`);
}

try {
    targets.forEach(copyArtifact);
} catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write('Build signed installers first, then rerun npm --prefix desktop/malkavrs run publish:downloads.\n');
    process.exit(1);
}
