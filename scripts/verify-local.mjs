#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

function run(label, command, args, options = {}) {
    console.log(`\n[verify:local] ${label}`);
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: 'inherit',
        ...options
    });

    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

function output(command, args) {
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        encoding: 'utf8'
    });

    if (result.status !== 0) {
        return '';
    }

    return result.stdout.trim();
}

function changedFiles() {
    const status = output('git', [ 'status', '--porcelain=v1' ]);

    return Array.from(new Set(status
        .split('\n')
        .map(line => {
            if (!line.trim()) {
                return '';
            }

            // Porcelain v1 uses "XY path" and "XY old -> new" for renames.
            const pathText = line.slice(3);
            return pathText.includes(' -> ') ? pathText.split(' -> ').pop() : pathText;
        })
        .map(file => file.trim())
        .filter(Boolean)));
}

const files = changedFiles();
const changedTestFiles = files.filter(file =>
    file.startsWith('vrs-server/__tests__/')
    && /\.(test|spec)\.(js|ts)$/.test(file));
const contractRelevant = files.some(file =>
    file.startsWith('contracts/')
    || file.startsWith('react/features/shared/api-client/')
    || file.startsWith('react/features/interpreter-queue/')
    || file.startsWith('vrs-server/ws/')
    || file.startsWith('scripts/validate-vrs-stack.mjs'));
const vrsDistRelevant = files.some(file =>
    file.startsWith('vrs-server/src/server.ts')
    || file.startsWith('vrs-server/src/database.ts')
    || file.startsWith('vrs-server/src/lib/')
    || file.startsWith('vrs-server/src/billing/')
    || file.startsWith('vrs-server/ws/')
    || file === 'vrs-server/server.js'
    || file === 'vrs-server/database.js');

run('web TypeScript', 'npm', [ 'run', 'tsc:web' ]);
run('native TypeScript', 'npm', [ 'run', 'tsc:native' ]);
run('Twilio syntax check', 'node', [ '--check', 'twilio-voice-server/server.js' ]);
run('admin dashboard syntax check', 'node', [ '--check', 'vrs-admin-dashboard.js' ]);
run('queue WebSocket handler syntax check', 'node', [ '--check', 'vrs-server/ws/handler.js' ]);
run('backend smoke script syntax check', 'node', [ '--check', 'scripts/validate-vrs-stack.mjs' ]);
run('browser smoke script syntax check', 'node', [ '--check', 'scripts/smoke-vrs-pages.mjs' ]);

if (contractRelevant || changedTestFiles.length === 0) {
    run('shared API/WebSocket contract test', 'npm', [
        '--prefix',
        'vrs-server',
        'test',
        '--',
        'shared-contracts.test.ts',
        '--runInBand'
    ]);
}

if (changedTestFiles.length > 0) {
    run('changed VRS Jest tests', 'npm', [
        '--prefix',
        'vrs-server',
        'test',
        '--',
        ...changedTestFiles.map(file => path.relative('vrs-server', file)),
        '--runInBand'
    ]);
}

if (vrsDistRelevant) {
    run('VRS checked-in dist sync', 'npm', [ 'run', 'check:vrs-dist-sync' ]);
}
