// A second, bounded allowlist boundary. It never prints a raw parsed object.
import { lstatSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { constants } from 'node:os';
import { errorCode, safeBasename, safeSymbol, sha256 } from './collect-crash-reports.mjs';
import { assertInitialPushInvocation } from './invocation-guard.mjs';

const limit = 850_000;
const number = value => Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const exit = value => Number.isInteger(value) && value >= -1024 && value <= 255 ? value : undefined;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
const commit = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) ? value : undefined;
const bool = value => typeof value === 'boolean' ? value : undefined;
const choice = (value, values) => values.includes(value) ? value : undefined;
const code = value => typeof value === 'string' && /^[A-Z0-9_]{1,64}$/.test(value) ? value : undefined;
const version = value => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,60}$/.test(value) ? value : undefined;
const uuid = value => typeof value === 'string' && /^[a-fA-F0-9-]{32,36}$/.test(value) ? value : undefined;
const array = (value, count) => Array.isArray(value) ? value.slice(0, count) : [];
const symbol = value => typeof value === 'string' && /^\[redacted-symbol-sha256:[a-f0-9]{64}\]$/.test(value) ? value : safeSymbol(value);
const faultText = value => {
  if (typeof value !== 'string' || !value.length || value.length > 180) return undefined;
  const tokens = value.match(/0[xX][a-fA-F0-9]+|[A-Z_]+|[0-9]+|at|[(),.+ -]/g) ?? [];
  return tokens.join('') === value ? value : undefined;
};
function exception(value) { return { type: faultText(value?.type), signal: choice(value?.signal, Object.keys(constants.signals)),
  subtype: faultText(value?.subtype), codes: faultText(value?.codes) }; }
function frame(value) { return { image: safeBasename(value?.image), imageUUID: uuid(value?.imageUUID),
  imageOffset: number(value?.imageOffset), symbol: symbol(value?.symbol), symbolOffset: number(value?.symbolOffset) }; }
function native(value) { return { format: choice(value?.format, ['ips', 'crash']), victimPID: number(value?.victimPID),
  victim: safeBasename(value?.victim), exception: exception(value?.exception),
  termination: { namespace: code(value?.termination?.namespace), code: number(value?.termination?.code) },
  crashedThreadIndex: number(value?.crashedThreadIndex),
  threads: array(value?.threads, 128).map(thread => ({ index: number(thread?.index), nativeThreadId: number(thread?.nativeThreadId),
    crashed: bool(thread?.crashed), frames: array(thread?.frames, 256).map(frame) })),
  images: array(value?.images, 512).map(image => ({ basename: safeBasename(image?.basename), uuid: uuid(image?.uuid) })),
  truncated: bool(value?.truncated) }; }
const counts = value => Object.fromEntries(['passed', 'failed', 'skipped', 'todo'].map(key => [key, number(value?.[key])]));
function pending(value) { return { fileBasename: typeof value?.fileBasename === 'string' && /^[A-Za-z0-9_.+-]+\.test\.tsx?$/.test(value.fileBasename) ? value.fileBasename : '[unknown-module]',
  phase: choice(value?.phase, ['module-queued-before-import', 'module-start', 'case-ready', 'hook-start']),
  hook: choice(value?.hook, ['beforeAll', 'afterAll', 'beforeEach', 'afterEach', 'UNKNOWN']),
  caseNameSha256: hash(value?.caseNameSha256), logicalWorkerId: number(value?.logicalWorkerId), logicalConcurrencyId: number(value?.logicalConcurrencyId) }; }
function whitelist(value) {
  return { diagnostic: choice(value?.diagnostic, ['ONE_SHOT_MAC_SIGBUS', 'PUBLIC_SIZE_REDUCTION', 'PUBLIC_SIZE_LIMIT_FALLBACK']),
    harnessCommit: commit(value?.harnessCommit), cause: 'UNKNOWN', rawRetention: 'RUNNER_TEMP_ONLY_NOT_UPLOADED_NOT_PERSISTENT',
    originalUnitStatus: exit(value?.originalUnitStatus), diagnosticExitStatus: exit(value?.diagnosticExitStatus),
    interpretation: value?.diagnosticExitStatus === 0 ? 'ONE_NON_REPRODUCTION_NOT_A_FIX_OR_PLATFORM_CLAIM' : 'DIAGNOSTIC_FAILED_CAUSE_UNKNOWN',
    source: { merge: commit(value?.source?.merge), tree: commit(value?.source?.tree), trackedFiles: number(value?.source?.trackedFiles),
      beforeSha256: hash(value?.source?.beforeSha256), afterSha256: hash(value?.source?.afterSha256), unchanged: bool(value?.source?.unchanged) },
    tools: { node: version(value?.tools?.node), npm: version(value?.tools?.npm), arch: choice(value?.tools?.arch, ['arm64']),
      platform: choice(value?.tools?.platform, ['darwin']), nodeExecutableSha256: hash(value?.tools?.nodeExecutableSha256),
      macVersion: version(value?.tools?.macVersion), macBuild: version(value?.tools?.macBuild),
      imageOS: version(value?.tools?.imageOS), imageVersion: version(value?.tools?.imageVersion) },
    harness: array(value?.harness, 6).map(item => ({ basename: safeBasename(item?.basename), sha256: hash(item?.sha256) })),
    stages: array(value?.stages, 3).map(item => ({ stage: choice(item?.stage, ['install', 'build', 'unit']), pid: number(item?.pid),
      exitCode: exit(item?.exitCode), closeCode: exit(item?.closeCode), signal: choice(item?.signal, Object.keys(constants.signals)),
      closeSignal: choice(item?.closeSignal, Object.keys(constants.signals)), spawnError: code(item?.spawnError), rawLogSha256: hash(item?.rawLogSha256) })),
    errors: array(value?.errors, 256).map(item => ({ operation: typeof item?.operation === 'string' && /^[a-z-]{1,40}$/.test(item.operation) ? item.operation : undefined, code: code(item?.code) })),
    observerErrors: array(value?.observerErrors, 256).map(item => ({ code: code(item?.code), count: number(item?.count) })),
    unitProgress: { completedFileLines: number(value?.unitProgress?.completedFileLines),
      declaredCasesInCompletedLines: number(value?.unitProgress?.declaredCasesInCompletedLines), finalTests: counts(value?.unitProgress?.finalTests),
      finalFiles: counts(value?.unitProgress?.finalFiles), finalSummaryPresent: bool(value?.unitProgress?.finalSummaryPresent) },
    phases: { rawSha256: hash(value?.phases?.rawSha256), events: number(value?.phases?.events),
      coordinatorPids: array(value?.phases?.coordinatorPids, 16).map(number), specificationCount: number(value?.phases?.specificationCount),
      maxObservedProcessRssBytes: number(value?.phases?.maxObservedProcessRssBytes), minObservedSystemFreeBytes: number(value?.phases?.minObservedSystemFreeBytes),
      systemTotalBytes: number(value?.phases?.systemTotalBytes), availableParallelism: number(value?.phases?.availableParallelism),
      projects: array(value?.phases?.projects, 16).map(project => ({ pool: choice(project?.pool, ['threads', 'forks', 'vmThreads', 'vmForks', 'UNKNOWN']),
        isolate: bool(project?.isolate), maxWorkers: number(project?.maxWorkers), fileParallelism: bool(project?.fileParallelism),
        retry: number(project?.retry), testTimeout: number(project?.testTimeout), hookTimeout: number(project?.hookTimeout) })),
      pendingModules: array(value?.phases?.pendingModules, 74).map(pending), pendingCases: array(value?.phases?.pendingCases, 100).map(pending),
      pendingHooks: array(value?.phases?.pendingHooks, 100).map(pending), pendingTruncated: bool(value?.phases?.pendingTruncated),
      interpretation: 'COORDINATOR_RECEIVED_EVENTS_NOT_NATIVE_THREAD_OR_FAULT_PROOF' },
    osReports: { matched: number(value?.osReports?.matched), status: choice(value?.osReports?.status, ['MATCHED_REPORTS', 'NO_MATCHING_REPORT_AVAILABLE']),
      inventory: array(value?.osReports?.inventory, 16).map(report => ({ basename: safeBasename(report?.basename),
        scope: choice(report?.scope, ['user', 'system', 'user-retired', 'system-retired']), bytes: number(report?.bytes), sha256: hash(report?.sha256),
        status: choice(report?.status, ['MATCHED', 'PID_UNMATCHED', 'COLLECTOR_ERROR']), summary: report?.summary ? native(report.summary) : undefined })) },
    nodeReports: array(value?.nodeReports, 16).map(report => ({ basename: safeBasename(report?.basename), bytes: number(report?.bytes), sha256: hash(report?.sha256),
      status: choice(report?.status, ['MATCHED', 'PID_UNMATCHED', 'COLLECTOR_ERROR']),
      summary: report?.summary ? { victimPID: number(report.summary.victimPID), nativeStack: array(report.summary.nativeStack, 256).map(item => ({ symbol: symbol(item?.symbol) })),
        sharedImages: array(report.summary.sharedImages, 512).map(safeBasename),
        resources: Object.fromEntries(['rss', 'maxRss', 'free_memory', 'available_memory'].map(key => [key,
          /^\d{1,24}$/.test(String(report.summary.resources?.[key])) ? String(report.summary.resources[key]) : undefined])) } : undefined })),
    publicSummaryTruncated: bool(value?.publicSummaryTruncated), fullWhitelistSha256: hash(value?.fullWhitelistSha256),
    collectorErrorCount: number(value?.collectorErrorCount), observerErrorCount: number(value?.observerErrorCount) };
}
// The CLI and tracked synthetic tests use the same entry function. Importing this
// module performs no publication and does not mutate process streams or exitCode.
export function publishSummary({ env = process.env, argv = process.argv,
  stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    if (argv.length !== 2) throw new Error();
    assertInitialPushInvocation(env);
    const path = env.SOLIDFLOW_SIGBUS_PUBLIC_SUMMARY;
    if (!path || dirname(resolve(path)) !== resolve(env.RUNNER_TEMP ?? '') ||
        !/^solidflow-sigbus-public-\d+-\d+\.json$/.test(basename(path))) throw new Error();
    const stat = lstatSync(path), receiptStat = lstatSync(path + '.receipt.json');
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit || !receiptStat.isFile() || receiptStat.isSymbolicLink() || receiptStat.size > 4096) throw new Error();
    const bytes = readFileSync(path), receipt = JSON.parse(readFileSync(path + '.receipt.json'));
    if (receipt.summarySha256 !== sha256(bytes) || receipt.harnessCommit !== env.GITHUB_SHA ||
        receipt.runId !== env.GITHUB_RUN_ID || receipt.runAttempt !== env.GITHUB_RUN_ATTEMPT) throw new Error();
    const safe = whitelist(JSON.parse(bytes));
    let output = JSON.stringify(safe, null, 2);
    if (Buffer.byteLength(output + '\n', 'utf8') > limit) output = JSON.stringify({ diagnostic: 'PUBLISHER_SIZE_LIMIT',
      originalUnitStatus: safe.originalUnitStatus, diagnosticExitStatus: safe.diagnosticExitStatus,
      interpretation: safe.interpretation,
      fullWhitelistSha256: sha256(output), publicSummaryTruncated: true });
    stdout.write(output + '\n');
    return 0;
  } catch (error) {
    // Redirected by the workflow; never echo error.message, source bytes or paths.
    stderr.write(JSON.stringify({ diagnostic: 'PUBLICATION_REJECTED', code: errorCode(error) }) + '\n');
    return 1;
  }
}

if (import.meta.main) process.exitCode = publishSummary();
