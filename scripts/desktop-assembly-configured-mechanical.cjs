'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
// Statically owned suite. Every child retains its own isolated profile,
// production observer and unchanged 180/170/35-second harness deadlines.
for (const family of ['lock', 'concentric', 'gear', 'screw', 'rack-pinion']) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'desktop-assembly-configured-' + family + '.cjs')], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal !== null) { process.exitCode = 1; break; }
}
