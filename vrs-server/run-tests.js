#!/usr/bin/env node
/**
 * Lightweight test runner for vrs-server.
 * Runs tests without requiring jest in package.json devDependencies.
 * Usage: node run-tests.js
 */

const { execSync } = require('child_process');
const path = require('path');

const jestBin = path.resolve(__dirname, '..', 'node_modules', '.bin', 'jest');
const config = path.resolve(__dirname, 'jest.config.js');

try {
    const extraArgs = process.argv.slice(2).join(' ');
    execSync(`"${jestBin}" --config "${config}" --rootDir "${__dirname}" --verbose --forceExit ${extraArgs}`, {
        stdio: 'inherit',
        cwd: __dirname,
        env: { ...process.env }
    });
} catch (error) {
    process.exit(error.status || 1);
}
