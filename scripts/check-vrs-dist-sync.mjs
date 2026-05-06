#!/usr/bin/env node
import { execFileSync } from 'child_process';
import path from 'path';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const checkedPaths = [
  'vrs-server/dist',
  'vrs-server/server.js',
  'vrs-server/database.js'
];

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    ...options
  });
}

run('npm', [ '--prefix', 'vrs-server', 'run', 'build' ]);

try {
  run('git', [ 'diff', '--quiet', '--', ...checkedPaths ]);
  run('git', [ 'diff', '--cached', '--quiet', '--', ...checkedPaths ]);
} catch {
  console.error('');
  console.error('vrs-server generated output is out of sync.');
  console.error('Run `npm --prefix vrs-server run build` and commit the updated checked-in output.');
  process.exit(1);
}
