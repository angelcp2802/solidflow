const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { runSmokeLaunch, launchFailureExitCode } = require('./desktop-smoke-launch.cjs');

// Original synthetic event sequences: no Electron, filesystem or process launch.
// The clock is advanced explicitly, so these tests do not spend a real 45s.
function harness({ spawnError, cleanup = () => {}, kill = () => true, unref = () => {} } = {}) {
  const events = [];
  const child = new EventEmitter();
  const clock = { callback: undefined, delay: undefined, active: false };
  let cleanupCount = 0;
  let killCount = 0;
  let unrefCount = 0;
  child.kill = () => { killCount++; events.push('kill'); return kill(child); };
  child.unref = () => { unrefCount++; events.push('unref'); return unref(child); };
  const result = runSmokeLaunch({
    spawn: () => {
      events.push('spawn');
      if (spawnError) throw spawnError;
      return child;
    },
    cleanup: async () => { cleanupCount++; events.push('cleanup'); await cleanup(); },
    setTimer: (callback, delay) => {
      clock.callback = callback;
      clock.delay = delay;
      clock.active = true;
      return clock;
    },
    clearTimer: () => { clock.active = false; events.push('clear-timer'); },
  }).then(() => ({ ok: true }), error => ({ ok: false, error }));
  return {
    child, clock, events, result,
    get cleanupCount() { return cleanupCount; },
    get killCount() { return killCount; },
    get unrefCount() { return unrefCount; },
    exit(code, signal = null) { child.emit('exit', code, signal); },
    close(code, signal = null) { child.emit('close', code, signal); },
    deadline() {
      assert.equal(clock.delay, 45_000);
      clock.callback();
    },
  };
}

async function failure(h) {
  const result = await h.result;
  assert.equal(result.ok, false, 'a failed launch or cleanup must reject');
  return result.error;
}

function busyError() {
  return Object.assign(new Error('isolated temporary directory is busy'), { code: 'EBUSY' });
}

test('successful close waits for cleanup to finish before resolving', async () => {
  let releaseCleanup;
  const cleanupFinished = new Promise(resolve => { releaseCleanup = resolve; });
  const h = harness({ cleanup: () => cleanupFinished });
  let settled = false;
  h.result.then(() => { settled = true; });
  h.close(0);
  await Promise.resolve();
  assert.equal(h.cleanupCount, 1);
  assert.equal(settled, false);
  releaseCleanup();
  assert.deepEqual(await h.result, { ok: true });
  assert.equal(h.clock.active, false);
  assert.equal(h.killCount, 0);
  assert.equal(h.unrefCount, 0);
});

test('exit before close cannot start cleanup or report success', async () => {
  const h = harness();
  let settled = false;
  h.result.then(() => { settled = true; });
  h.exit(0);
  await Promise.resolve();
  assert.equal(h.cleanupCount, 0);
  assert.equal(settled, false);
  h.close(0);
  assert.deepEqual(await h.result, { ok: true });
  assert.equal(h.cleanupCount, 1);
});

test('a nonzero child result remains a failure with its numeric exit code', async () => {
  const h = harness();
  h.exit(7);
  assert.equal(h.cleanupCount, 0);
  h.close(7);
  const error = await failure(h);
  assert.equal(error instanceof AggregateError, false);
  assert.equal(error.exitCode, 7);
  assert.equal(error.signal, null);
  assert.equal(launchFailureExitCode(error), 7);
  assert.equal(h.cleanupCount, 1);
  assert.equal(h.killCount, 0);
});

test('signal termination preserves a null code and signal alongside cleanup failure', async () => {
  const cleanupError = busyError();
  const h = harness({ cleanup: () => { throw cleanupError; } });
  h.exit(null, 'SIGTERM');
  h.close(null, 'SIGTERM');
  const error = await failure(h);
  assert.ok(error instanceof AggregateError);
  assert.equal(error.errors.length, 2);
  assert.equal(error.cause, error.errors[0]);
  assert.equal(error.errors[0].exitCode, null);
  assert.equal(error.errors[0].signal, 'SIGTERM');
  assert.equal(error.errors[1], cleanupError);
  assert.equal(error.signal, 'SIGTERM');
  assert.equal(launchFailureExitCode(error), 1);
});

test('synchronous spawn failure survives cleanup as the exact original object', async () => {
  const original = Object.freeze(Object.assign(new Error('spawn could not start'), { code: 'ENOENT' }));
  const h = harness({ spawnError: original });
  assert.equal(await failure(h), original);
  assert.equal(h.cleanupCount, 1);
  assert.equal(h.clock.callback, undefined);
  assert.equal(h.killCount, 0);
  assert.equal(h.unrefCount, 0);
});

test('an emitted child error waits for close and is not replaced by a synthetic exit error', async () => {
  const original = Object.freeze(new Error('spawn emitted an error'));
  const h = harness();
  h.child.emit('error', original);
  await Promise.resolve();
  assert.equal(h.cleanupCount, 0);
  h.close(null);
  assert.equal(await failure(h), original);
  assert.equal(h.cleanupCount, 1);
});

test('simultaneous child and cleanup errors preserve original identity, order and cause', async () => {
  const original = Object.freeze(new Error('primary child failure'));
  const cleanupError = busyError();
  const h = harness({ cleanup: () => { throw cleanupError; } });
  h.child.emit('error', original);
  h.close(null);
  const error = await failure(h);
  assert.ok(error instanceof AggregateError);
  assert.deepEqual(error.errors, [original, cleanupError]);
  assert.equal(error.errors[0], original);
  assert.equal(error.cause, original);
  assert.equal(launchFailureExitCode(error), 1);
});

test('cleanup failure after a successful child close cannot report PASS', async () => {
  const cleanupError = busyError();
  const h = harness({ cleanup: () => { throw cleanupError; } });
  h.exit(0);
  h.close(0);
  assert.equal(await failure(h), cleanupError);
  assert.equal(launchFailureExitCode(cleanupError), 1);
  assert.equal(h.cleanupCount, 1);
});

test('the deadline is recorded before kill can synchronously close with code zero', async () => {
  const h = harness({ kill: child => { child.emit('close', 0, null); return true; } });
  h.deadline();
  const error = await failure(h);
  assert.equal(error instanceof AggregateError, false);
  assert.equal(error.message, 'Electron no terminó en 45 segundos.');
  assert.equal(h.killCount, 1);
  assert.equal(h.cleanupCount, 1);
  assert.equal(h.unrefCount, 0);
});

test('deadline and subsequent cleanup failure are both observable', async () => {
  const cleanupError = busyError();
  const h = harness({
    kill: child => { child.emit('close', 0, null); return true; },
    cleanup: () => { throw cleanupError; },
  });
  h.deadline();
  const error = await failure(h);
  assert.ok(error instanceof AggregateError);
  assert.equal(error.errors.length, 2);
  assert.equal(error.errors[0].message, 'Electron no terminó en 45 segundos.');
  assert.equal(error.cause, error.errors[0]);
  assert.equal(error.errors[1], cleanupError);
  assert.equal(launchFailureExitCode(error), 1);
});

test('unconfirmed close fails at the deadline, retains the temporary data and ignores late outcome changes', async () => {
  const h = harness();
  h.deadline();
  const error = await failure(h);
  assert.ok(error instanceof AggregateError);
  assert.equal(error.errors.length, 2);
  const original = error.errors[0];
  assert.equal(original.message, 'Electron no terminó en 45 segundos.');
  assert.equal(error.cause, original);
  assert.equal(error.errors[1].code, 'SMOKE_CLOSE_UNCONFIRMED');
  assert.equal(h.cleanupCount, 0);
  assert.equal(h.unrefCount, 1);
  assert.ok(h.events.indexOf('kill') < h.events.indexOf('unref'));
  assert.equal(h.clock.active, false);
  // An error after rejection is consumed until close, without mutating the
  // captured diagnostics or rerunning cleanup on that later close.
  h.child.emit('error', new Error('late child error'));
  h.exit(0);
  h.close(0);
  await Promise.resolve();
  assert.equal(h.cleanupCount, 0);
  assert.equal(error.errors.length, 2);
  assert.equal(error.errors[0], original);
  assert.equal((await h.result).error, error);
});

test('a thrown kill error does not replace the deadline or allow cleanup before close', async () => {
  const killError = new Error('kill request threw');
  const h = harness({ kill: () => { throw killError; } });
  h.deadline();
  const error = await failure(h);
  assert.ok(error instanceof AggregateError);
  assert.equal(error.errors[0].message, 'Electron no terminó en 45 segundos.');
  assert.equal(error.errors[1], killError);
  assert.equal(error.errors[2].code, 'SMOKE_CLOSE_UNCONFIRMED');
  assert.equal(error.cause, error.errors[0]);
  assert.equal(h.cleanupCount, 0);
  assert.equal(h.unrefCount, 1);
});

test('an unsuccessful kill request remains separate from the unconfirmed-close observation', async () => {
  const h = harness({ kill: () => false });
  h.deadline();
  const error = await failure(h);
  assert.ok(error instanceof AggregateError);
  assert.equal(error.errors.length, 3);
  assert.equal(error.errors[0].message, 'Electron no terminó en 45 segundos.');
  assert.equal(error.errors[1].message, 'No se pudo enviar la señal de cierre a Electron.');
  assert.equal(error.errors[2].code, 'SMOKE_CLOSE_UNCONFIRMED');
  assert.equal(h.cleanupCount, 0);
});

test('an unref failure is retained without replacing the primary deadline', async () => {
  const unrefError = new Error('unref threw');
  const h = harness({ unref: () => { throw unrefError; } });
  h.deadline();
  const error = await failure(h);
  assert.ok(error instanceof AggregateError);
  assert.equal(error.errors.length, 3);
  assert.equal(error.errors[0].message, 'Electron no terminó en 45 segundos.');
  assert.equal(error.errors[1].code, 'SMOKE_CLOSE_UNCONFIRMED');
  assert.equal(error.errors[2], unrefError);
  assert.equal(error.cause, error.errors[0]);
  assert.equal(h.cleanupCount, 0);
});

test('nonzero exit value remains the launcher status when cleanup also fails', async () => {
  const cleanupError = busyError();
  const h = harness({ cleanup: () => { throw cleanupError; } });
  h.exit(7);
  h.close(7);
  const error = await failure(h);
  assert.ok(error instanceof AggregateError);
  assert.equal(error.errors[0].exitCode, 7);
  assert.equal(error.errors[0].signal, null);
  assert.equal(error.errors[1], cleanupError);
  assert.equal(error.cause, error.errors[0]);
  assert.equal(error.exitCode, 7);
  assert.equal(launchFailureExitCode(error), 7);
});

test('a failed exit without close stays bounded and does not delete data while stdio close is unconfirmed', async () => {
  const h = harness();
  h.exit(9);
  h.deadline();
  const error = await failure(h);
  assert.ok(error instanceof AggregateError);
  assert.equal(error.errors.length, 3);
  assert.equal(error.errors[0].exitCode, 9);
  assert.equal(error.errors[1].message, 'Electron no terminó en 45 segundos.');
  assert.equal(error.errors[2].code, 'SMOKE_CLOSE_UNCONFIRMED');
  assert.equal(launchFailureExitCode(error), 9);
  assert.equal(h.killCount, 0, 'an observed exit must not trigger a new kill request');
  assert.equal(h.unrefCount, 1);
  assert.equal(h.cleanupCount, 0);
});

test('a stale deadline callback after success cannot kill or clean a second time', async () => {
  const h = harness();
  h.close(0);
  assert.deepEqual(await h.result, { ok: true });
  h.deadline();
  assert.equal(h.killCount, 0);
  assert.equal(h.unrefCount, 0);
  assert.equal(h.cleanupCount, 1);
  assert.deepEqual(await h.result, { ok: true });
});

test('a close with no successful exit code and no signal is not treated as PASS', async () => {
  const h = harness();
  h.close(null);
  const error = await failure(h);
  assert.equal(error.exitCode, null);
  assert.equal(error.signal, null);
  assert.equal(launchFailureExitCode(error), 1);
  assert.equal(h.cleanupCount, 1);
});

test('the Node entry point reports the complete aggregate and preserves the primary child status', async () => {
  const primary = Object.assign(new Error('child exited'), { exitCode: 7, signal: null });
  const error = Object.assign(new AggregateError([primary, busyError()], 'launch and cleanup failed', { cause: primary }), { exitCode: 7 });
  const processDouble = { env: {}, versions: {}, platform: 'win32' };
  let report;
  let reported;
  const finished = new Promise(resolve => { reported = resolve; });
  const filename = path.join(__dirname, 'desktop-smoke.cjs');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    __dirname, __filename: filename, process: processDouble,
    console: { error(...args) { report = args; reported(); } },
    require(name) {
      if (name === 'node:fs/promises') return {
        access: async () => {},
        mkdtemp: async () => path.join(os.tmpdir(), 'solidflow-runtime-check-synthetic'),
      };
      if (name === 'node:child_process') return { spawn() { assert.fail('entry-point test must not launch a process'); } };
      if (name === './desktop-smoke-launch.cjs') return {
        runSmokeLaunch: async () => { throw error; }, launchFailureExitCode,
      };
      if (name === 'electron') assert.fail('entry-point test must not load Electron');
      return require(name);
    },
  });
  await finished;
  assert.equal(report.length, 1);
  assert.equal(report[0], error);
  assert.equal(report[0].cause, primary);
  assert.equal(report[0].errors[1].code, 'EBUSY');
  assert.equal(processDouble.exitCode, 7);
});
