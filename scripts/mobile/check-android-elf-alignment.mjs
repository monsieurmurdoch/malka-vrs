#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';

const REQUIRED_ALIGNMENT = 16 * 1024;
const DEFAULT_APK = 'android/app/build/outputs/apk/malkaVrs/debug/app-malkaVrs-debug.apk';

const args = process.argv.slice(2);
const includeAllAbis = args.includes('--all');
const archivePath = args.find(arg => arg !== '--all') || DEFAULT_APK;

if (!existsSync(archivePath)) {
    console.error(`Archive not found: ${archivePath}`);
    console.error(`Usage: node scripts/mobile/check-android-elf-alignment.mjs <path-to-apk-or-aab>`);
    process.exit(2);
}

function unzip(args, options = {}) {
    return execFileSync('unzip', args, {
        encoding: options.encoding,
        maxBuffer: 256 * 1024 * 1024
    });
}

function readUInt(buffer, offset, bytes, littleEndian) {
    if (bytes === 2) {
        return littleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
    }

    if (bytes === 4) {
        return littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
    }

    if (bytes === 8) {
        const value = littleEndian ? buffer.readBigUInt64LE(offset) : buffer.readBigUInt64BE(offset);

        return Number(value);
    }

    throw new Error(`Unsupported integer width: ${bytes}`);
}

function getLoadSegmentAlignments(buffer) {
    if (buffer.length < 64
            || buffer[0] !== 0x7f
            || buffer[1] !== 0x45
            || buffer[2] !== 0x4c
            || buffer[3] !== 0x46) {
        return [];
    }

    const elfClass = buffer[4];
    const littleEndian = buffer[5] === 1;
    const isElf64 = elfClass === 2;
    const isElf32 = elfClass === 1;

    if (!isElf64 && !isElf32) {
        return [];
    }

    const ePhoff = readUInt(buffer, isElf64 ? 32 : 28, isElf64 ? 8 : 4, littleEndian);
    const ePhentsize = readUInt(buffer, isElf64 ? 54 : 42, 2, littleEndian);
    const ePhnum = readUInt(buffer, isElf64 ? 56 : 44, 2, littleEndian);
    const pAlignOffset = isElf64 ? 48 : 28;
    const alignments = [];

    for (let i = 0; i < ePhnum; i++) {
        const headerOffset = ePhoff + i * ePhentsize;
        const type = readUInt(buffer, headerOffset, 4, littleEndian);

        if (type === 1) {
            alignments.push(readUInt(buffer, headerOffset + pAlignOffset, isElf64 ? 8 : 4, littleEndian));
        }
    }

    return alignments;
}

const entries = unzip(['-Z1', archivePath], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(entry => /^(base\/)?lib\/[^/]+\/[^/]+\.so$/.test(entry))
    .filter(entry => includeAllAbis || /^(base\/)?lib\/arm64-v8a\//.test(entry));

if (!entries.length) {
    console.error(`No native libraries found for ${includeAllAbis ? 'any ABI' : 'arm64-v8a'} in ${archivePath}`);
    process.exit(2);
}

const reports = entries.map(entry => {
    const buffer = unzip(['-p', archivePath, entry]);
    const alignments = getLoadSegmentAlignments(buffer);
    const minAlignment = alignments.length ? Math.min(...alignments) : 0;

    return {
        entry,
        minAlignment,
        ok: minAlignment >= REQUIRED_ALIGNMENT
    };
});

const badReports = reports.filter(report => !report.ok);
const byAbi = new Map();

for (const report of reports) {
    const parts = report.entry.split('/');
    const abi = parts[0] === 'base' ? parts[2] : parts[1];
    const summary = byAbi.get(abi) || { total: 0, bad: 0 };

    summary.total += 1;
    summary.bad += report.ok ? 0 : 1;
    byAbi.set(abi, summary);
}

console.log(`Android ELF alignment check: ${basename(archivePath)}`);
console.log(`Required PT_LOAD alignment: ${REQUIRED_ALIGNMENT} bytes`);
console.log(`ABI scope: ${includeAllAbis ? 'all bundled ABIs' : 'arm64-v8a only'}`);

for (const [abi, summary] of [...byAbi.entries()].sort()) {
    console.log(`${abi}: ${summary.total - summary.bad}/${summary.total} compatible`);
}

if (badReports.length) {
    console.log('');
    console.log('Incompatible native libraries:');

    for (const report of badReports.sort((a, b) => a.entry.localeCompare(b.entry))) {
        console.log(`- ${report.entry} (min PT_LOAD align ${report.minAlignment})`);
    }

    process.exit(1);
}

console.log('All bundled native libraries are 16 KB page-size compatible.');
