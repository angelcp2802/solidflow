// Original one-shot mac probe. All raw child/OS/Node output stays in RUNNER_TEMP.
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, mkdtempSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { constants } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectCrashReports, collectNodeReports, crashInventory, errorCode, safeBasename, sha256 } from './collect-crash-reports.mjs';
import { assertInitialPushInvocation } from './invocation-guard.mjs';

const expected = Object.freeze({ merge: 'b720c4f3eb6cf526fc6d3c23a6954c2e3243c733',
  tree: '741d8ed0c48d1b988fefd3c6393a6e73e6fd0ff4', node: 'v24.20.0', npm: '11.19.0', vitest: '5.0.3',
  config: 'b4eaa68140067a2225ad50ce76f74063c8d9142ac34653013808cff8d77772ad',
  lock: '624de72d77dcadd36dc3491311bc63a2283bafc931bc7492207338faada48def', files: 74, cases: 1492 });
const source = resolve(process.env.GITHUB_WORKSPACE ?? '', 'source');
const harness = dirname(fileURLToPath(import.meta.url));
let directory, before, unit, collectorBefore, publicationPath;
const errors = [], observerErrors = [], stages = [], summary = { diagnostic: 'ONE_SHOT_MAC_SIGBUS', expected,
  cause: 'UNKNOWN', rawRetention: 'RUNNER_TEMP_ONLY_NOT_UPLOADED_NOT_PERSISTENT', stages, errors, observerErrors };
// A child gets normal runtime inputs, but never a public output destination.
const childEnvironment = { ...process.env };
for (const name of ['GITHUB_STEP_SUMMARY', 'GITHUB_OUTPUT', 'GITHUB_ENV', 'GITHUB_STATE', 'GITHUB_PATH',
  'SOLIDFLOW_SIGBUS_PUBLIC_SUMMARY', 'GITHUB_TOKEN', 'GH_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_TOKEN', 'ACTIONS_RUNTIME_TOKEN']) delete childEnvironment[name];
function guard(condition, code) { if (!condition) throw Object.assign(new Error(), { code }); }
function command(file, args) { return execFileSync(file, args, { cwd: source, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }).trim(); }
function sourceSnapshot() {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: source, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 })
    .split('\0').filter(Boolean).sort();
  return files.map(path => ({ path, sha256: sha256(readFileSync(join(source, path))) }));
}
function fileHash(path) {
  const fd = openSync(path, 'r'), hash = createHash('sha256'), buffer = Buffer.alloc(64 * 1024);
  try {
    let count; while ((count = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, count));
    return hash.digest('hex');
  } finally { closeSync(fd); }
}
async function stage(name, args, env) {
  const logfile = join(directory, name + '.raw.log'), fd = openSync(logfile, 'wx');
  const result = { stage: name, startedUtc: new Date().toISOString() }; stages.push(result);
  try {
    await new Promise(resolveStage => {
      const child = spawn('npm', args, { cwd: source, shell: false, windowsHide: true,
        env, stdio: ['ignore', fd, fd] });
      result.pid = child.pid;
      child.once('error', error => { result.spawnError = errorCode(error); });
      child.once('exit', (code, signal) => { result.exitCode = code; result.signal = signal; });
      child.once('close', (code, signal) => { result.closeCode = code; result.closeSignal = signal; resolveStage(); });
    });
  } catch (error) { result.spawnError ??= errorCode(error); }
  finally { try { closeSync(fd); } catch (error) { errors.push({ operation: 'stage-log-close', code: errorCode(error) }); } }
  result.finishedUtc = new Date().toISOString();
  try { result.rawLogSha256 = fileHash(logfile); }
  catch (error) { errors.push({ operation: 'stage-log-hash', code: errorCode(error) }); }
  return result;
}
const status = result => Number.isInteger(result?.exitCode) && result.exitCode >= 0 && result.exitCode <= 255 ? result.exitCode
  : result?.signal && Number.isInteger(constants.signals[result.signal]) ? 128 + constants.signals[result.signal] : 1;
function phases() {
  const bytes = readFileSync(join(directory, 'phase-events.jsonl'));
  guard(bytes.length <= 32 * 1024 * 1024, 'PHASE_SIZE_LIMIT');
  const values = [], pendingModules = new Map(), pendingCases = new Map(), pendingHooks = new Map();
  for (const line of bytes.toString('utf8').split('\n').filter(Boolean)) {
    try { values.push(JSON.parse(line)); } catch { errors.push({ operation: 'phase-parse', code: 'MALFORMED_PHASE_JSON' }); }
  }
  const pids = new Set(values.map(value => value.pid).filter(Number.isSafeInteger)), rss = [], free = [];
  const knownFiles = new Set(before.map(item => item.path));
  const allowedPhases = new Set(['init', 'run-start', 'module-queued-before-import', 'module-start', 'module-end',
    'case-ready', 'case-result', 'hook-start', 'hook-end', 'run-end']);
  for (const value of values) {
    if (!allowedPhases.has(value.phase)) { errors.push({ operation: 'phase-schema', code: 'UNKNOWN_PHASE' }); continue; }
    const key = String(value.file ?? ''), caseKey = JSON.stringify([key, value.name]), hookKey = JSON.stringify([key, value.name, value.hook]);
    const publicPhase = { fileBasename: knownFiles.has(key) ? safeBasename(key) : '[unknown-module]', phase: value.phase,
      logicalWorkerId: Number.isSafeInteger(value.logicalWorkerId) ? value.logicalWorkerId : undefined,
      logicalConcurrencyId: Number.isSafeInteger(value.logicalConcurrencyId) ? value.logicalConcurrencyId : undefined,
      ...(value.name ? { caseNameSha256: sha256(String(value.name)) } : {}) };
    if (value.phase === 'module-queued-before-import' || value.phase === 'module-start') pendingModules.set(key, publicPhase);
    if (value.phase === 'module-end') pendingModules.delete(key);
    if (value.phase === 'case-ready') pendingCases.set(caseKey, publicPhase);
    if (value.phase === 'case-result') pendingCases.delete(caseKey);
    if (value.phase === 'hook-start') pendingHooks.set(hookKey, { ...publicPhase,
      hook: ['beforeAll', 'afterAll', 'beforeEach', 'afterEach'].includes(value.hook) ? value.hook : 'UNKNOWN' });
    if (value.phase === 'hook-end') pendingHooks.delete(hookKey);
    if (Number.isSafeInteger(value.processRssBytes) && value.processRssBytes >= 0) rss.push(value.processRssBytes);
    if (Number.isSafeInteger(value.systemFreeBytes) && value.systemFreeBytes >= 0) free.push(value.systemFreeBytes);
  }
  const run = values.find(value => value.phase === 'run-start'), init = values.find(value => value.phase === 'init');
  if (!init || run?.specificationCount !== expected.files) errors.push({ operation: 'phase-coverage', code: 'FULL_SELECTION_NOT_ATTESTED' });
  const projects = (Array.isArray(run?.projects) ? run.projects : Array.isArray(init?.projects) ? init.projects : []).map(project => ({
    pool: ['threads', 'forks', 'vmThreads', 'vmForks'].includes(project.pool) ? project.pool : 'UNKNOWN',
    isolate: typeof project.isolate === 'boolean' ? project.isolate : undefined,
    maxWorkers: Number.isInteger(project.maxWorkers) ? project.maxWorkers : undefined,
    fileParallelism: typeof project.fileParallelism === 'boolean' ? project.fileParallelism : undefined,
    retry: typeof project.retry === 'number' ? project.retry : undefined,
    testTimeout: typeof project.testTimeout === 'number' ? project.testTimeout : undefined,
    hookTimeout: typeof project.hookTimeout === 'number' ? project.hookTimeout : undefined }));
  summary.phases = { rawSha256: sha256(bytes), events: values.length, coordinatorPids: [...pids],
    specificationCount: Number.isSafeInteger(run?.specificationCount) ? run.specificationCount : undefined,
    projects, maxObservedProcessRssBytes: rss.length ? Math.max(...rss) : undefined,
    minObservedSystemFreeBytes: free.length ? Math.min(...free) : undefined,
    systemTotalBytes: Number.isSafeInteger(init?.systemTotalBytes) ? init.systemTotalBytes : undefined,
    availableParallelism: Number.isSafeInteger(init?.availableParallelism) ? init.availableParallelism : undefined,
    pendingModules: [...pendingModules.values()].slice(0, 74), pendingCases: [...pendingCases.values()].slice(0, 100),
    pendingHooks: [...pendingHooks.values()].slice(0, 100),
    pendingTruncated: pendingCases.size > 100 || pendingHooks.size > 100,
    interpretation: 'COORDINATOR_RECEIVED_EVENTS_NOT_NATIVE_THREAD_OR_FAULT_PROOF' };
  return pids;
}
function observerAndUnitSummary() {
  const bytes = readFileSync(join(directory, 'unit.raw.log'));
  guard(bytes.length <= 32 * 1024 * 1024, 'UNIT_LOG_SIZE_LIMIT');
  const raw = bytes.toString('utf8'), clean = raw.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  // Constant markers survive even if observer-errors.jsonl could not be written.
  const markerCount = (raw.match(/SOLIDFLOW_OBSERVER_ERROR /g) ?? []).length;
  if (markerCount) observerErrors.push({ code: 'OBSERVER_CALLBACK_OR_WRITE', count: markerCount });
  const completions = [...clean.matchAll(/(?:^|\s)(src\/\S+) \((\d+) tests?(?: \| [^)\r\n]*)?\)/gm)];
  const tests = /(?:^|\n)\s*Tests\s+([^\n]+)/.exec(clean), files = /(?:^|\n)\s*Test Files\s+([^\n]+)/.exec(clean);
  const counts = match => match ? Object.fromEntries([...match[1].matchAll(/(\d+)\s+(passed|failed|skipped|todo)/g)].map(item => [item[2], Number(item[1])])) : undefined;
  summary.unitProgress = { completedFileLines: completions.length,
    declaredCasesInCompletedLines: completions.reduce((total, item) => total + Number(item[2]), 0),
    finalTests: counts(tests), finalFiles: counts(files), finalSummaryPresent: !!tests && !!files };
  if (status(unit) === 0 && (summary.unitProgress.finalTests?.passed !== expected.cases ||
      summary.unitProgress.finalFiles?.passed !== expected.files ||
      ['failed', 'skipped', 'todo'].some(key => summary.unitProgress.finalTests?.[key] || summary.unitProgress.finalFiles?.[key]))) {
    errors.push({ operation: 'unit-counts', code: 'FULL_UNSKIPPED_COUNTS_NOT_ATTESTED' });
  }
}

try {
  guard(process.argv.length === 2, 'NO_ARGUMENTS_ALLOWED');
  guard(process.platform === 'darwin' && process.arch === 'arm64' && process.version === expected.node, 'ORIGINAL_NODE_PLATFORM_REQUIRED');
  assertInitialPushInvocation(process.env);
  guard(/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? ''), 'HARNESS_SHA_REQUIRED');
  summary.harnessCommit = process.env.GITHUB_SHA;
  guard(process.env.RUNNER_TEMP && process.env.GITHUB_WORKSPACE, 'RUNNER_PATHS_REQUIRED');
  guard(process.env.SOLIDFLOW_SIGBUS_PUBLIC_SUMMARY &&
    dirname(resolve(process.env.SOLIDFLOW_SIGBUS_PUBLIC_SUMMARY)) === resolve(process.env.RUNNER_TEMP) &&
    /^solidflow-sigbus-public-\d+-\d+\.json$/.test(basename(process.env.SOLIDFLOW_SIGBUS_PUBLIC_SUMMARY)), 'SUMMARY_PATH_REQUIRED');
  publicationPath = process.env.SOLIDFLOW_SIGBUS_PUBLIC_SUMMARY;
  guard(!process.env.NODE_OPTIONS?.trim(), 'UNCONTROLLED_NODE_OPTIONS');
  directory = mkdtempSync(join(process.env.RUNNER_TEMP, 'solidflow-sigbus-'));
  guard(!/\s|["\\]/.test(directory), 'REPORT_DIRECTORY_UNSUPPORTED');
  guard(command('git', ['rev-parse', 'HEAD']) === expected.merge, 'SOURCE_SHA_MISMATCH');
  guard(command('git', ['rev-parse', 'HEAD^{tree}']) === expected.tree, 'SOURCE_TREE_MISMATCH');
  guard(command('git', ['-C', resolve(harness, '../../..'), 'rev-parse', 'HEAD']) === process.env.GITHUB_SHA, 'HARNESS_CHECKOUT_SHA_MISMATCH');
  guard(command('git', ['-C', resolve(harness, '../../..'), 'rev-parse', 'HEAD^']) === '0a0ab22a0cd0b6295b9ff7c5761398b1ae457a4a', 'HARNESS_PARENT_MISMATCH');
  guard(command('npm', ['--version']) === expected.npm, 'ORIGINAL_NPM_REQUIRED');
  guard(fileHash(join(source, 'vitest.config.ts')) === expected.config, 'CONFIG_CHANGED');
  guard(fileHash(join(source, 'package-lock.json')) === expected.lock, 'LOCK_CHANGED');
  guard(JSON.parse(readFileSync(join(source, 'package.json'))).scripts['test:unit'] === 'vitest run --config vitest.config.ts', 'UNIT_SCRIPT_CHANGED');
  before = sourceSnapshot();
  summary.source = { merge: expected.merge, tree: expected.tree, trackedFiles: before.length, beforeSha256: sha256(JSON.stringify(before)) };
  const macVersion = command('/usr/bin/sw_vers', ['-productVersion']), macBuild = command('/usr/bin/sw_vers', ['-buildVersion']);
  guard(/^[0-9.]+$/.test(macVersion) && /^[A-Za-z0-9]+$/.test(macBuild), 'OS_METADATA_FORMAT');
  summary.tools = { node: process.version, npm: expected.npm, nodeExecutableSha256: fileHash(process.execPath),
    arch: process.arch, platform: process.platform, macVersion, macBuild,
    imageOS: /^[A-Za-z0-9_.-]+$/.test(process.env.ImageOS ?? '') ? process.env.ImageOS : undefined,
    imageVersion: /^[A-Za-z0-9_.-]+$/.test(process.env.ImageVersion ?? '') ? process.env.ImageVersion : undefined };
  summary.harness = ['run-diagnostic.mjs', 'phase-reporter.mjs', 'collect-crash-reports.mjs', 'publish-summary.mjs', 'invocation-guard.mjs', 'invocation-guard.test.mjs'].map(basename => ({ basename, sha256: fileHash(join(harness, basename)) }));
  guard(status(await stage('install', ['ci', '--no-audit', '--no-fund'], childEnvironment)) === 0, 'INSTALL_FAILED');
  guard(status(await stage('build', ['run', 'build'], childEnvironment)) === 0, 'BUILD_FAILED');
  guard(JSON.parse(readFileSync(join(source, 'node_modules/vitest/package.json'))).version === expected.vitest, 'ORIGINAL_VITEST_REQUIRED');
  collectorBefore = crashInventory(errors);
  const env = { ...childEnvironment, SOLIDFLOW_SIGBUS_DIAG: directory,
    NODE_OPTIONS: '--report-on-fatalerror --report-uncaught-exception --report-exclude-env --report-exclude-network --report-directory=' + directory };
  unit = await stage('unit', ['run', 'test:unit', '--', '--reporter=default', '--reporter=' + join(harness, 'phase-reporter.mjs')], env);
} catch (error) { errors.push({ operation: unit ? 'post-unit' : 'setup-or-stage', code: errorCode(error) }); }
finally {
  if (unit) {
    let pids = new Set([unit.pid].filter(Number.isSafeInteger));
    try { for (const pid of phases()) pids.add(pid); } catch (error) { errors.push({ operation: 'phase-collection', code: errorCode(error) }); }
    try { observerAndUnitSummary(); } catch (error) { errors.push({ operation: 'unit-summary', code: errorCode(error) }); }
    try { summary.osReports = await collectCrashReports(collectorBefore ?? new Map(), directory, pids, errors); }
    catch (error) { errors.push({ operation: 'os-collection', code: errorCode(error) }); }
    try { summary.nodeReports = collectNodeReports(directory, pids, errors); }
    catch (error) { errors.push({ operation: 'node-collection', code: errorCode(error) }); }
  }
  if (before) {
    try {
      const after = sourceSnapshot(); summary.source.afterSha256 = sha256(JSON.stringify(after));
      summary.source.unchanged = summary.source.beforeSha256 === summary.source.afterSha256;
      if (!summary.source.unchanged) errors.push({ operation: 'source-integrity', code: 'TRACKED_SOURCE_CHANGED' });
    } catch (error) { errors.push({ operation: 'source-integrity', code: errorCode(error) }); }
  }
  const originalUnitStatus = unit ? status(unit) : undefined;
  const finalStatus = () => originalUnitStatus ? originalUnitStatus : (!unit || errors.length || observerErrors.length ? 1 : 0);
  const publicJson = () => {
    summary.originalUnitStatus = originalUnitStatus; summary.diagnosticExitStatus = finalStatus();
    summary.interpretation = finalStatus() === 0 ? 'ONE_NON_REPRODUCTION_NOT_A_FIX_OR_PLATFORM_CLAIM' : 'DIAGNOSTIC_FAILED_CAUSE_UNKNOWN';
    const text = JSON.stringify(summary, null, 2), maxPublicBytes = 850_000;
    if (Buffer.byteLength(text, 'utf8') <= maxPublicBytes) return text;
    // Bound the final serialized output, including escaping/indentation overhead.
    // Oversized backtraces remain only in ephemeral raw data, never concatenated.
    const reduced = { diagnostic: 'PUBLIC_SIZE_REDUCTION', expected, source: summary.source, harnessCommit: summary.harnessCommit,
      originalUnitStatus, diagnosticExitStatus: finalStatus(), cause: 'UNKNOWN',
      rawRetention: summary.rawRetention, publicSummaryTruncated: true, fullWhitelistSha256: sha256(text),
      collectorErrorCount: errors.length, observerErrorCount: observerErrors.length,
      osReports: { status: summary.osReports?.status, matched: summary.osReports?.matched,
        inventory: (summary.osReports?.inventory ?? []).slice(0, 16).map(report => ({
        sha256: report.sha256, bytes: report.bytes, status: report.status,
        summary: report.summary ? { victimPID: report.summary.victimPID, victim: report.summary.victim,
          exception: report.summary.exception, crashedThreadIndex: report.summary.crashedThreadIndex,
          truncated: true } : undefined, backtraceOmittedForPublicSize: true })) },
      nodeReports: (summary.nodeReports ?? []).slice(0, 16).map(report => ({ sha256: report.sha256,
        bytes: report.bytes, status: report.status, summary: report.summary ? { victimPID: report.summary.victimPID } : undefined,
        backtraceOmittedForPublicSize: true })) };
    const bounded = JSON.stringify(reduced, null, 2);
    if (Buffer.byteLength(bounded, 'utf8') <= maxPublicBytes) return bounded;
    // All variable strings are omitted from the last fallback. Status stays intact.
    return JSON.stringify({ diagnostic: 'PUBLIC_SIZE_LIMIT_FALLBACK', originalUnitStatus,
      diagnosticExitStatus: finalStatus(), fullWhitelistSha256: sha256(text), publicSummaryTruncated: true });
  };
  // Only constructed whitelist objects reach public stdout/step summary.
  if (directory) {
    try { writeFileSync(join(directory, 'whitelist-summary.json'), publicJson()); }
    catch (error) { errors.push({ operation: 'summary-local-write', code: errorCode(error) }); }
  }
  if (publicationPath) {
    try {
      const publication = publicJson();
      writeFileSync(publicationPath, publication, { flag: 'wx' });
      // The publisher requires this successful-write receipt and verifies the bytes.
      writeFileSync(publicationPath + '.receipt.json', JSON.stringify({
        summarySha256: sha256(publication), harnessCommit: process.env.GITHUB_SHA,
        runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT }), { flag: 'wx' });
    }
    catch (error) { errors.push({ operation: 'summary-publication-write', code: errorCode(error) }); }
  }
  // Stdout is canonical if an earlier summary destination failed.
  process.stdout.write(publicJson() + '\n');
  process.exitCode = finalStatus();
}
