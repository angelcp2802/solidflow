'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const reporter = require('./desktop-node-ci-reporter.cjs');
const reporterPath = pathToFileURL(path.join(__dirname, 'desktop-node-ci-reporter.cjs')).href;

async function collect(events) {
  const output = [];
  for await (const line of reporter((async function* () { yield* events; })())) output.push(line);
  return output;
}

test('reporter keeps actual assertion detail, escapes names and reads no hostile getters', async t => {
  const old = process.env.GITHUB_ACTIONS; process.env.GITHUB_ACTIONS = 'true';
  t.after(() => { if (old === undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS = old; });
  let reads = 0;
  const hostile = Object.defineProperty({}, 'message', { get() { reads++; throw Error('not read'); } });
  Object.defineProperty(hostile, 'cause', { get() { reads++; throw Error('not read'); } });
  const error = new Error('test failed', { cause: new Error('expected 42 but got 7\nC:\\private\\secret.txt') });
  const events = [
    { type: 'test:fail', data: { name: 'bad%\r\n::warning::fake /home/private/file', details: { error } } },
    { type: 'test:fail', data: { name: 'hostile', details: { error: hostile } } },
    { type: 'test:fail', data: { name: 'parent', details: { error: Object.assign(new Error('1 subtest failed'), { failureType: 'subtestsFailed' }) } } },
  ];
  const output = await collect(events);
  assert.equal(output.length, 2); assert.equal(reads, 0);
  assert.match(output[0], /expected 42 but got 7/); assert.match(output[0], /bad%25%0D%0A::warning::fake/);
  assert.ok(!output[0].includes('private')); assert.equal(output[0].split('\n').length, 2);
  assert.ok(Buffer.byteLength(output[0]) <= 4096);
  assert.match(output[1], /without a readable own error message/);
  const bounded = await collect([{ type: 'test:fail', data: { name: '😀%\n'.repeat(2000), details: { error: new Error('é'.repeat(10000)) } } }]);
  assert.equal(bounded.length, 1); assert.ok(Buffer.byteLength(bounded[0]) <= 4096);
  assert.equal(bounded[0].split('\n').length, 2);
  assert.deepEqual(await collect([{ type: 'test:fail', data: { name: 'expected todo', todo: true, details: { error } } }]), []);
});

test('additional reporter preserves subprocess pass/fail/skip and spec output without parent spam', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'solidflow-node-reporter-'));
  t.after(async () => {
    const resolved = await fs.realpath(directory), temporaryRoot = await fs.realpath(os.tmpdir());
    assert.equal(path.dirname(resolved), temporaryRoot, 'Cleanup stays in the real temporary directory');
    assert.equal(path.basename(resolved), path.basename(directory), 'Cleanup retains the exact owned directory');
    assert.ok(path.basename(resolved).startsWith('solidflow-node-reporter-'));
    await fs.rm(resolved, { recursive: true, force: true });
  });
  const file = path.join(directory, 'original.node.cjs');
  // A nested Node test process must be a fresh runner, not inherit the parent
  // runner's private child transport marker.
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const run = active => spawnSync(process.execPath, ['--test', '--test-reporter=spec', '--test-reporter=' + reporterPath,
    '--test-reporter-destination=stdout', '--test-reporter-destination=stdout', file],
  { encoding: 'utf8', env: { ...env, GITHUB_ACTIONS: active }, timeout: 10000, maxBuffer: 1024 * 1024 });
  await fs.writeFile(file, "const {test}=require('node:test');test('original pass',()=>{});test.skip('original skip',()=>{});\n");
  const passing = run('true'); assert.equal(passing.status, 0, passing.stderr); assert.match(passing.stdout, /original pass/);
  assert.match(passing.stdout, /original skip/); assert.ok(!passing.stdout.includes('::error title='));
  await fs.writeFile(file, "const {test}=require('node:test');const assert=require('node:assert/strict');test('parent',async t=>{await t.test('leaf assertion',()=>assert.equal(17,23));});\n");
  const failing = run('true'); assert.equal(failing.status, 1, failing.stderr);
  const annotations = failing.stdout.split('\n').filter(line => line.startsWith('::error title='));
  assert.equal(annotations.length, 1, failing.stdout); assert.match(annotations[0], /leaf assertion/);
  assert.match(annotations[0], /17/); assert.match(annotations[0], /23/); assert.match(failing.stdout, /tests 2/);
  const local = run('false'); assert.equal(local.status, 1); assert.ok(!local.stdout.includes('::error title='));
  assert.match(local.stdout, /leaf assertion/);
});
