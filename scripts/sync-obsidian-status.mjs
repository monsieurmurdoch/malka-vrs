#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const statusPath = path.join(repoRoot, 'status.md');
const roadmapPath = path.join(repoRoot, 'ROADMAP.md');
const defaultVaultDir = path.join(
  process.env.HOME || '/Users/robertmalka',
  'Documents',
  'Obsidian Vault',
  'Coding',
  'Malka-App'
);
const vaultDir = process.env.OBSIDIAN_MALKA_APP_DIR || defaultVaultDir;
const mirrorOnly = process.argv.includes('--mirror-only');

const currentStart = '<!-- status:current:start -->';
const currentEnd = '<!-- status:current:end -->';
const archiveHeading = '## Archive';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

function changedFilesSummary() {
  const raw = git(['status', '--short'], '');
  if (!raw) {
    return 'No local changes at sync time.';
  }

  const lines = raw
    .split('\n')
    .filter(Boolean)
    .filter(line => !line.includes('libs/excalidraw-assets-dev/'))
    .slice(0, 18)
    .map(line => `  - \`${line.trim()}\``);

  return ['Local changes at sync time:', ...lines].join('\n');
}

function buildCurrentUpdate() {
  const branch = git(['branch', '--show-current'], 'unknown');
  const commit = git(['rev-parse', '--short', 'HEAD'], 'unknown');
  const update = process.env.STATUS_UPDATE || 'Pre-push project status sync.';

  return [
    `${currentStart}`,
    '## Current Update',
    '',
    `- Updated: ${today()}`,
    `- Branch: \`${branch}\``,
    `- HEAD: \`${commit}\``,
    `- Note: ${update}`,
    '- Snapshot:',
    changedFilesSummary(),
    '',
    `${currentEnd}`
  ].join('\n');
}

function readStatus() {
  if (!fs.existsSync(statusPath)) {
    return [
      '# MalkaVRS Status',
      '',
      'This file is the project-level running status log. The current update stays at the top; previous updates are kept below in the archive.',
      '',
      buildCurrentUpdate(),
      '',
      archiveHeading,
      '',
      'No archived updates yet.'
    ].join('\n');
  }

  return fs.readFileSync(statusPath, 'utf8');
}

function archiveCurrent(content) {
  const startIdx = content.indexOf(currentStart);
  const endIdx = content.indexOf(currentEnd);
  const archiveIdx = content.indexOf(archiveHeading);

  if (startIdx === -1 || endIdx === -1 || archiveIdx === -1 || endIdx <= startIdx) {
    return [
      '# MalkaVRS Status',
      '',
      'This file is the project-level running status log. The current update stays at the top; previous updates are kept below in the archive.',
      '',
      buildCurrentUpdate(),
      '',
      archiveHeading,
      '',
      'No archived updates yet.'
    ].join('\n');
  }

  const currentBlock = content.slice(startIdx, endIdx + currentEnd.length).trim();
  const beforeCurrent = content.slice(0, startIdx).trimEnd();
  let archiveBody = content.slice(archiveIdx + archiveHeading.length).trim();

  if (archiveBody === 'No archived updates yet.') {
    archiveBody = '';
  }

  const archived = [
    `### Archived Update - ${new Date().toISOString()}`,
    '',
    currentBlock,
    ''
  ].join('\n');

  return [
    beforeCurrent,
    '',
    buildCurrentUpdate(),
    '',
    archiveHeading,
    '',
    archived,
    archiveBody
  ].filter(part => part !== '').join('\n').trimEnd() + '\n';
}

function mirrorFile(source, targetName) {
  fs.mkdirSync(vaultDir, { recursive: true });
  fs.copyFileSync(source, path.join(vaultDir, targetName));
}

if (!mirrorOnly) {
  const nextStatus = archiveCurrent(readStatus());
  fs.writeFileSync(statusPath, nextStatus, 'utf8');
}
mirrorFile(statusPath, 'status.md');
mirrorFile(roadmapPath, 'ROADMAP.md');

console.log(`Synced status.md and ROADMAP.md to ${vaultDir}`);
