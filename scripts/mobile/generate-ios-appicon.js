#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const [, , tenant, iconSetDir] = process.argv;

if (!tenant || !iconSetDir) {
    console.error('Usage: generate-ios-appicon.js <tenant> <appiconset-dir>');
    process.exit(1);
}

const rootDir = path.resolve(__dirname, '../..');
const iconSpecs = [
    [ 'AppIcon-29@2x.png', 58 ],
    [ 'AppIcon-29@3x.png', 87 ],
    [ 'AppIcon-40@2x.png', 80 ],
    [ 'AppIcon-60@2x.png', 120 ],
    [ 'AppIcon-60@3x.png', 180 ],
    [ 'AppIcon-76@1x.png', 76 ],
    [ 'AppIcon-76@2x.png', 152 ],
    [ 'AppIcon-83.5@2x.png', 167 ],
    [ 'AppIcon-1024@1x.png', 1024 ]
];

const tenantConfig = {
    malka: {
        background: [ 15, 15, 35, 255 ],
        inset: 0.18,
        source: path.join(rootDir, 'Malka Logo/favicon.png')
    },
    malkavri: {
        background: [ 15, 15, 35, 255 ],
        inset: 0,
        source: path.join(rootDir, 'Malka Logo/MalkaVRI_icon.png')
    },
    maple: {
        background: [ 224, 0, 0, 255 ],
        inset: 0.18,
        source: path.join(rootDir, 'whitelabel/maple/assets/maple-icon-white.png')
    }
};

const config = tenantConfig[tenant];

if (!config) {
    console.error(`Unknown tenant for app icon: ${tenant}`);
    process.exit(1);
}

function readPng(file) {
    return PNG.sync.read(fs.readFileSync(file));
}

function sampleNearest(source, x, y) {
    const sourceX = Math.max(0, Math.min(source.width - 1, Math.round(x)));
    const sourceY = Math.max(0, Math.min(source.height - 1, Math.round(y)));
    const idx = (source.width * sourceY + sourceX) << 2;

    return [
        source.data[idx],
        source.data[idx + 1],
        source.data[idx + 2],
        source.data[idx + 3]
    ];
}

function alphaBlend(foreground, background) {
    const alpha = foreground[3] / 255;
    const inverse = 1 - alpha;

    return [
        Math.round(foreground[0] * alpha + background[0] * inverse),
        Math.round(foreground[1] * alpha + background[1] * inverse),
        Math.round(foreground[2] * alpha + background[2] * inverse),
        255
    ];
}

function makeIcon(source, size, background, inset) {
    const icon = new PNG({ width: size, height: size });
    const targetSize = Math.round(size * (1 - inset * 2));
    const targetX = Math.round((size - targetSize) / 2);
    const targetY = targetX;
    const scale = Math.min(targetSize / source.width, targetSize / source.height);
    const drawWidth = Math.round(source.width * scale);
    const drawHeight = Math.round(source.height * scale);
    const drawX = Math.round((size - drawWidth) / 2);
    const drawY = Math.round((size - drawHeight) / 2);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (size * y + x) << 2;

            icon.data[idx] = background[0];
            icon.data[idx + 1] = background[1];
            icon.data[idx + 2] = background[2];
            icon.data[idx + 3] = background[3];
        }
    }

    for (let y = 0; y < drawHeight; y++) {
        for (let x = 0; x < drawWidth; x++) {
            const sourceX = x / scale;
            const sourceY = y / scale;
            const blended = alphaBlend(sampleNearest(source, sourceX, sourceY), background);
            const outIdx = (size * (drawY + y) + drawX + x) << 2;

            icon.data[outIdx] = blended[0];
            icon.data[outIdx + 1] = blended[1];
            icon.data[outIdx + 2] = blended[2];
            icon.data[outIdx + 3] = blended[3];
        }
    }

    return icon;
}

fs.mkdirSync(iconSetDir, { recursive: true });

const source = readPng(config.source);

for (const [ filename, size ] of iconSpecs) {
    const icon = makeIcon(source, size, config.background, config.inset);

    fs.writeFileSync(path.join(iconSetDir, filename), PNG.sync.write(icon));
}
