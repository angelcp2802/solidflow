'use strict';

const KERNEL_WORKER = /^solidflow:\/\/app\/assets\/kernel\.worker-[\w-]+\.js$/;
const STEPS = Object.freeze([
  { kind: 'apply', action: 'apply-assembly' },
  { kind: 'discard', action: 'build' },
]);
const AUTO_SCOPE_STEPS = Object.freeze([{ kind: 'auto-scope', action: 'capture-feature-recipe-scope' }]);
const FACE_LIMIT_STEPS = Object.freeze([
  { kind: 'face-prefix-control', action: 'build', continueBreakpoint: true },
  { kind: 'face-obsolete-draft-control', action: 'build', continueBreakpoint: true },
  { kind: 'face-draft-control', action: 'build' },
  { kind: 'face-prefix-overlap', action: 'build', continueBreakpoint: true },
  { kind: 'face-obsolete-draft-overlap', action: 'build', continueBreakpoint: true },
  { kind: 'face-draft-overlap', action: 'build' },
]);

function checkpoint(step) {
  return { ...step, frame: null, hitBreakpoints: [], reason: null, request: null, releasing: false, resumed: false };
}

// Test-only CDP session under the owned production page. Break on the real
// worker's assigned message callback and resume it with the same trusted event.
// The normal worker API, queue, native code, response and UI remain in place.
function createPendingWorkerGate(debuggerTransport, check, workflow = 'embedded-part') {
  check(['embedded-part', 'auto-scope', 'face-limits'].includes(workflow), 'Only fixed owned-worker scenarios can pause a request');
  const steps = workflow === 'face-limits' ? FACE_LIMIT_STEPS : workflow === 'auto-scope' ? AUTO_SCOPE_STEPS : STEPS;
  let target, current, installed = false, disposed = false, enabled = false, step = 0, unexpected;
  const scripts = new Map();
  const workerCommand = (method, params = {}) => debuggerTransport.sendCommand(method, params, target.sessionId);
  function onMessage(_event, method, params, sessionId) {
    if (!sessionId && method === 'Target.attachedToTarget' && params.targetInfo?.type === 'worker') {
      if (target || params.waitingForDebugger) { unexpected = 'Expected one running dedicated worker'; return; }
      target = { sessionId: params.sessionId, url: params.targetInfo.url, detached: false };
    } else if (!sessionId && method === 'Target.detachedFromTarget' && target && params.sessionId === target.sessionId) {
      target.detached = true;
    } else if (sessionId && sessionId === target?.sessionId) {
      if (method === 'Debugger.scriptParsed' && KERNEL_WORKER.test(params.url)) scripts.set(params.scriptId, params.url);
      if (method === 'Debugger.paused') {
        if (!current || current.frame) { unexpected = 'Unexpected second worker pause'; return; }
        current.frame = params.callFrames[0];
        current.hitBreakpoints = params.hitBreakpoints ?? [];
        current.reason = params.reason;
      }
      if (method === 'Debugger.resumed') {
        if (!current?.releasing) { unexpected = 'Worker resumed before the recorded decision'; return; }
        current.resumed = true;
        if (current.following) current = current.following;
      }
    }
  }
  async function install() {
    check(!installed && !disposed && debuggerTransport.isAttached(), 'Pending observation requires the attached test-owned page');
    installed = true;
    debuggerTransport.on('message', onMessage);
    await debuggerTransport.sendCommand('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false,
      flatten: true, filter: [{ type: 'worker' }, { exclude: true }] });
  }
  async function arm(kind) {
    const next = steps[step];
    check(installed && !disposed && !unexpected && target && !target.detached && KERNEL_WORKER.test(target.url),
      unexpected ?? 'Exact owned production CAD worker target must be running');
    check(next?.kind === kind && (!current || current.resumed), 'Only the fixed ordered, non-overlapping pending checkpoints are allowed');
    if (!enabled) { await workerCommand('Debugger.enable'); enabled = true; }
    const { result, exceptionDetails } = await workerCommand('Runtime.evaluate', {
      expression: 'globalThis.onmessage', objectGroup: 'solidflow-pending-checkpoint',
    });
    check(!exceptionDetails && result?.type === 'function' && typeof result.objectId === 'string',
      'Read the actual dedicated worker message callback');
    current = checkpoint(next);
    const { breakpointId } = await workerCommand('Debugger.setBreakpointOnFunctionCall', { objectId: result.objectId });
    check(typeof breakpointId === 'string' && breakpointId.length > 0, 'Worker message breakpoint installed');
    current.breakpointId = breakpointId;
    step++;
  }
  async function sample() {
    check(current && !unexpected && !target.detached, unexpected ?? 'Pending observation requires the same armed worker');
    const { frame, hitBreakpoints } = current;
    const location = frame?.location;
    const url = scripts.get(location?.scriptId);
    if (frame && !current.request) {
      check(url === target.url && hitBreakpoints.length === 1 && hitBreakpoints[0] === current.breakpointId,
        'The exact one-shot breakpoint stopped inside the production worker callback');
      const localScope = frame.scopeChain.find(scope => scope.type === 'local');
      check(typeof localScope?.object?.objectId === 'string', 'Stopped worker callback exposes its real event parameter');
      const { result: locals } = await workerCommand('Runtime.getProperties', { objectId: localScope.object.objectId, ownProperties: true });
      const events = locals.filter(property => property.value?.className === 'MessageEvent' && property.value.objectId);
      check(events.length === 1, 'One actual MessageEvent in the stopped worker callback');
      const result = await workerCommand('Runtime.callFunctionOn', { objectId: events[0].value.objectId, returnByValue: true,
        functionDeclaration: 'function () { return { id: this.data.id, action: this.data.action, trusted: this.isTrusted }; }' });
      const request = result.result?.value;
      check(!result.exceptionDetails && request?.trusted === true && Number.isSafeInteger(request.id) && request.id > 0
        && request.action === current.action, 'Stopped worker event is the expected genuine dispatched request');
      current.request = request;
    }
    return { kind: current.kind, paused: !!frame && !current.resumed, resumed: current.resumed,
      pauseReason: current.reason, request: current.request,
      frame: location ? { url, line: location.lineNumber, column: location.columnNumber ?? 0 } : null };
  }
  async function release() {
    const state = await sample();
    check(state.paused && state.request && !current.releasing, 'Release the one observed worker message');
    current.releasing = true;
    if (current.continueBreakpoint) {
      // Keep the next exact face-build request observable without rearming
      // after the worker has already resumed.
      current.following = { ...checkpoint(steps[step++]), breakpointId: current.breakpointId };
    } else {
      await workerCommand('Debugger.removeBreakpoint', { breakpointId: current.breakpointId });
    }
    await workerCommand('Debugger.resume');
  }
  async function dispose() {
    if (disposed) return;
    disposed = true;
    try {
      if (installed && debuggerTransport.isAttached()) {
        try {
          if (enabled && target && !target.detached) {
            await workerCommand('Debugger.disable');
            await workerCommand('Runtime.releaseObjectGroup', { objectGroup: 'solidflow-pending-checkpoint' });
          }
        } finally {
          await debuggerTransport.sendCommand('Target.setAutoAttach', { autoAttach: false, waitForDebuggerOnStart: false, flatten: true });
        }
      }
    } finally { debuggerTransport.removeListener('message', onMessage); }
  }
  return Object.freeze({ install, arm, sample, release, dispose });
}

module.exports = { createPendingWorkerGate };
