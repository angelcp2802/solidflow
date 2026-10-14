// Original diagnostic observer. It neither selects tests nor changes results.
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { freemem, totalmem, availableParallelism } from 'node:os';

const directory = process.env.SOLIDFLOW_SIGBUS_DIAG;
let sequence = 0, context;
const projects = ctx => ctx.projects.map(project => ({ pool: project.config.pool,
  isolate: project.config.isolate, maxWorkers: project.config.maxWorkers,
  fileParallelism: project.config.fileParallelism, retry: project.config.retry,
  testTimeout: project.config.testTimeout, hookTimeout: project.config.hookTimeout }));
function observerError(phase, error) {
  const value = { phase, code: typeof error?.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : 'OBSERVER_ERROR' };
  try { if (directory) appendFileSync(join(directory, 'observer-errors.jsonl'), JSON.stringify(value) + '\n'); } catch {}
  // The parent captures stderr privately and counts this constant marker too.
  try { process.stderr.write('SOLIDFLOW_OBSERVER_ERROR ' + JSON.stringify(value) + '\n'); } catch {}
}
function observe(phase, read, resources = false) {
  try {
    if (!directory) throw new Error('Missing diagnostic output directory.');
    const data = read();
    appendFileSync(join(directory, 'phase-events.jsonl'), JSON.stringify({ sequence: ++sequence,
      utc: new Date().toISOString(), monotonicMs: performance.now(), pid: process.pid, phase,
      ...(resources ? { processRssBytes: process.memoryUsage.rss(), systemFreeBytes: freemem() } : {}), ...data }) + '\n');
  } catch (error) { observerError(phase, error); }
}
function moduleData(module) {
  const diagnostic = module.diagnostic();
  return { file: module.relativeModuleId, logicalWorkerId: diagnostic.workerId,
    logicalConcurrencyId: diagnostic.concurrencyId };
}
function entityData(entity) {
  return { ...moduleData(entity.type === 'module' ? entity : entity.module), entityType: entity.type,
    ...(entity.type === 'module' ? {} : { name: entity.fullName }) };
}
export default {
  onInit(ctx) { context = ctx; observe('init', () => ({ node: process.version, arch: process.arch, platform: process.platform,
    vitest: ctx.version, projects: projects(ctx), systemTotalBytes: totalmem(), availableParallelism: availableParallelism() }), true); },
  onTestRunStart(specifications) { observe('run-start', () => ({ specificationCount: specifications.length,
    projects: projects(context) }), true); },
  onTestModuleQueued(module) { observe('module-queued-before-import', () => moduleData(module), true); },
  onTestModuleStart(module) { observe('module-start', () => moduleData(module), true); },
  onTestModuleEnd(module) { observe('module-end', () => ({ ...moduleData(module), state: module.state() }), true); },
  onTestCaseReady(test) { observe('case-ready', () => ({ ...entityData(test), declaredMode: test.options.mode })); },
  onTestCaseResult(test) { observe('case-result', () => ({ ...entityData(test), state: test.result().state })); },
  onHookStart(hook) { observe('hook-start', () => ({ ...entityData(hook.entity), hook: hook.name })); },
  onHookEnd(hook) { observe('hook-end', () => ({ ...entityData(hook.entity), hook: hook.name })); },
  onTestRunEnd(modules, errors, reason) { observe('run-end', () => ({ reason, moduleCount: modules.length,
    unhandledErrorCount: errors.length }), true); },
};
