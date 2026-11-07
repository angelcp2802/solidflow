'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const scenario of ['profile-center', 'profile-circle', 'line-path', 'circular-path']) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'desktop-assembly-configured-' + scenario + '.cjs')], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal !== null) { process.exitCode = 1; break; }
}
