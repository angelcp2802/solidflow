// Original synthetic push, event-file and receipt fixtures, generated below.
// Runs the shared guard and three in-process publisher calls; no controller,
// CAD, Electron, npm, WASM, Git, network or real GitHub action is launched.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { assertInitialPushInvocation, validateInitialPushContext, maximumEventBytes } from './invocation-guard.mjs';
import { publishSummary } from './publish-summary.mjs';

const zero = '0000000000000000000000000000000000000000';
const head = '1111111111111111111111111111111111111111';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const prefix = 'solidflow-sigbus-gate-';
const tempParent = realpathSync.native(tmpdir());
const fixtureRoot = mkdtempSync(join(tempParent, prefix));
const canonicalRoot = realpathSync.native(fixtureRoot);
const ownerToken = randomUUID();
const ownerFile = join(canonicalRoot, '.fixture-owner.json');
writeFileSync(ownerFile, JSON.stringify({ ownerToken }), { flag: 'wx' });
after(() => {
  // Refuse cleanup if canonical identity, direct parent, type or token changed.
  // A rejected cleanup retains the fixture instead of removing an unowned path.
  try {
    const info = lstatSync(fixtureRoot);
    if (!info.isDirectory() || info.isSymbolicLink()
      || realpathSync.native(fixtureRoot) !== canonicalRoot
      || dirname(canonicalRoot) !== tempParent
      || relative(tempParent, canonicalRoot) !== basename(canonicalRoot)
      || !basename(canonicalRoot).startsWith(prefix)
      || JSON.parse(readFileSync(ownerFile, 'utf8')).ownerToken !== ownerToken) {
      throw new Error('FIXTURE_CLEANUP_OWNERSHIP_REJECTED');
    }
    rmSync(canonicalRoot, { recursive: true, force: false });
  } catch {
    throw new Error('FIXTURE_CLEANUP_FAILED_OR_RETAINED');
  }
});

function valid() {
  return { env: { GITHUB_EVENT_NAME: 'push', GITHUB_REPOSITORY: 'angelcp2802/solidflow',
    GITHUB_REF: 'refs/heads/diagnostic/pr35-mac-sigbus', GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_ID: '123', GITHUB_SHA: head },
    event: { ref: 'refs/heads/diagnostic/pr35-mac-sigbus', before: zero, after: head,
      created: true, deleted: false, forced: false, head_commit: { id: head }, repository: { full_name: 'angelcp2802/solidflow' } } };
}
function caseFiles() {
  const dir = join(canonicalRoot, randomUUID()); mkdirSync(dir);
  const context = valid(), eventPath = join(dir, 'event.json');
  writeFileSync(eventPath, JSON.stringify(context.event), { flag: 'wx' });
  return { dir, context, eventPath, env: { ...context.env, GITHUB_EVENT_PATH: eventPath } };
}

test('accepts only the initial isolated push with matching environment/after/head commit', () => {
  const { env, event } = valid(), result = validateInitialPushContext(env, event);
  assert.deepEqual(result, { mode: 'ISOLATED_INITIAL_PUSH', harnessCommit: head });
  assert.equal(Object.isFrozen(result), true);
});
const negatives = [
  ['manual event', c => { c.env.GITHUB_EVENT_NAME = 'workflow_dispatch'; }],
  ['pull request event', c => { c.env.GITHUB_EVENT_NAME = 'pull_request'; }],
  ['other environment repository', c => { c.env.GITHUB_REPOSITORY = 'other/repo'; }],
  ['other environment ref', c => { c.env.GITHUB_REF = 'refs/heads/main'; }],
  ['rerun attempt two', c => { c.env.GITHUB_RUN_ATTEMPT = '2'; }],
  ['invalid environment head', c => { c.env.GITHUB_SHA = 'not-a-commit'; }],
  ['invalid run ID', c => { c.env.GITHUB_RUN_ID = 'synthetic invalid ID'; }],
  ['other payload repository', c => { c.event.repository.full_name = 'other/repo'; }],
  ['other payload ref', c => { c.event.ref = 'refs/tags/diagnostic/pr35-mac-sigbus'; }],
  ['second ordinary push', c => { c.event.before = '0a0ab22a0cd0b6295b9ff7c5761398b1ae457a4a'; c.event.created = false; }],
  ['nonzero before with created true', c => { c.event.before = head; }],
  ['created false with zero before', c => { c.event.created = false; }],
  ['force push', c => { c.event.forced = true; }],
  ['deletion', c => { c.event.deleted = true; }],
  ['after differs from actual head', c => { c.event.after = '2222222222222222222222222222222222222222'; }],
  ['expanded head identity differs', c => { c.event.head_commit.id = '2222222222222222222222222222222222222222'; }],
  ['missing boolean attestations', c => { delete c.event.created; delete c.event.deleted; delete c.event.forced; }],
  ['null event', c => { c.event = null; }],
  ['array event', c => { c.event = []; }],
];
for (const [name, mutate] of negatives) test('rejects ' + name, () => {
  const c = valid(); mutate(c);
  assert.throws(() => validateInitialPushContext(c.env, c.event), error =>
    /^INITIAL_PUSH_[A-Z_]+$/.test(error.code) && error.message === error.code);
});

test('reads a real bounded event file using the shared production guard', () => {
  const c = caseFiles(); assert.equal(assertInitialPushInvocation(c.env).harnessCommit, head);
});

test('rejects malformed JSON without printing its value', () => {
  const c = caseFiles(); writeFileSync(c.eventPath, 'PRIVATE synthetic malformed value');
  assert.throws(() => assertInitialPushInvocation(c.env), error => error.code === 'PUSH_EVENT_JSON_INVALID' && !String(error).includes('synthetic'));
});

test('rejects an actual oversized event file before parsing', () => {
  const c = caseFiles(); writeFileSync(c.eventPath, 'x'.repeat(maximumEventBytes + 1));
  assert.throws(() => assertInitialPushInvocation(c.env), error => error.code === 'PUSH_EVENT_SIZE_OR_TYPE');
});

test('rejects a directory in place of an event file', () => {
  const c = caseFiles(); c.env.GITHUB_EVENT_PATH = c.dir;
  assert.throws(() => assertInitialPushInvocation(c.env), error => error.code === 'PUSH_EVENT_SIZE_OR_TYPE');
});

function publication(c) {
  const path = join(c.dir, 'solidflow-sigbus-public-123-1.json');
  const summary = JSON.stringify({ diagnostic: 'ONE_SHOT_MAC_SIGBUS', harnessCommit: head,
    originalUnitStatus: 138, diagnosticExitStatus: 138, cause: 'UNKNOWN',
    source: { merge: 'b720c4f3eb6cf526fc6d3c23a6954c2e3243c733', tree: '741d8ed0c48d1b988fefd3c6393a6e73e6fd0ff4' },
    arbitraryRawValue: '/PRIVATE synthetic path with spaces/secret.txt' });
  writeFileSync(path, summary, { flag: 'wx' });
  writeFileSync(path + '.receipt.json', JSON.stringify({ summarySha256: hash(summary), harnessCommit: head,
    runId: '123', runAttempt: c.env.GITHUB_RUN_ATTEMPT }), { flag: 'wx' });
  return { ...c.env, RUNNER_TEMP: c.dir, SOLIDFLOW_SIGBUS_PUBLIC_SUMMARY: path };
}
function publish(c) {
  // The CLI calls this exact function. Real event/summary/receipt files are read;
  // only output sinks are captured. No process.env or global streams are patched.
  const result = { stdout: '', stderr: '' };
  result.status = publishSummary({ env: publication(c), argv: ['node', 'publish-summary.mjs'],
    stdout: { write(text) { result.stdout += text; } },
    stderr: { write(text) { result.stderr += text; } } });
  return result;
}

test('actual publisher preserves failed-status metadata under the valid initial-push gate', () => {
  const c = caseFiles(), child = publish(c);
  assert.equal(child.status, 0); assert.equal(child.stderr, '');
  const safe = JSON.parse(child.stdout);
  assert.equal(safe.originalUnitStatus, 138); assert.equal(safe.diagnosticExitStatus, 138);
  assert.equal(safe.cause, 'UNKNOWN'); assert.equal(safe.interpretation, 'DIAGNOSTIC_FAILED_CAUSE_UNKNOWN');
  assert.equal(child.stdout.includes('PRIVATE'), false); assert.ok(Buffer.byteLength(child.stdout, 'utf8') <= 850_000);
  // This checks publisher metadata/return status, not CLI process termination
  // or controller/native exit precedence.
});

test('actual publisher rejects attempt two despite a matching receipt', () => {
  const c = caseFiles(); c.env.GITHUB_RUN_ATTEMPT = '2';
  const child = publish(c);
  assert.equal(child.status, 1); assert.equal(child.stdout, '');
  assert.equal(JSON.parse(child.stderr).code, 'INITIAL_PUSH_ENV_REQUIRED');
});

test('actual publisher rejects a force event despite a valid context-bound receipt', () => {
  const c = caseFiles(); c.context.event.forced = true; writeFileSync(c.eventPath, JSON.stringify(c.context.event));
  const child = publish(c);
  assert.equal(child.status, 1); assert.equal(child.stdout, '');
  assert.equal(JSON.parse(child.stderr).code, 'INITIAL_PUSH_EVENT_REQUIRED');
});
