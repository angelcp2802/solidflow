'use strict';

const CATEGORIES = ['evaluate', 'pointer', 'waitInspect', 'waitSleep', 'assemblyResponse'];
const PHASES = ['authoring', 'source', 'movement', 'drag', 'projection', 'interference', 'translation', 'bom', 'gear'];
const LIMIT = Number.MAX_SAFE_INTEGER;
const bounded = value => Math.min(LIMIT, Math.max(0, value));

/** Passive, constant-size accounting. No scheduling, payloads or wall-clock dates.
 * totalMs includes completed and pending intervals; pendingMs sums active
 * intervals, not their union. Categories overlap: evaluate can be included in
 * waitInspect and assemblyResponse. maxCompletedMs excludes pending intervals.
 * The caller closes each begin() in finally, including when its operation fails.
 */
function createWorkflowTiming(now = () => performance.now()) {
  if (typeof now !== 'function') throw new TypeError('A monotonic clock function is required.');
  let last = 0, origin;
  const clock = () => {
    let value;
    try { value = now(); } catch { return last; }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return last;
    if (origin === undefined) origin = value;
    last = Math.max(last, bounded(value - origin));
    return last;
  };
  clock();
  const categories = Object.fromEntries(CATEGORIES.map(name => [name, {
    count: 0, completedCount: 0, completedMs: 0, maxCompletedMs: 0, activeCount: 0, activeStarts: 0,
  }]));
  const phases = Object.fromEntries(PHASES.map(name => [name, { count: 0, durationMs: 0, status: 'idle' }]));
  let currentPhase = null, phaseStart = 0;
  function begin(category) {
    if (!CATEGORIES.includes(category)) throw new RangeError('Unknown workflow timing category.');
    const start = clock(), state = categories[category];
    state.count = bounded(state.count + 1); state.activeCount = bounded(state.activeCount + 1);
    state.activeStarts = bounded(state.activeStarts + start);
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      const duration = bounded(clock() - start);
      state.completedCount = bounded(state.completedCount + 1);
      state.completedMs = bounded(state.completedMs + duration);
      state.maxCompletedMs = Math.max(state.maxCompletedMs, duration);
      state.activeCount = bounded(state.activeCount - 1);
      state.activeStarts = state.activeCount ? bounded(state.activeStarts - start) : 0;
    };
  }
  function closePhase(time) {
    if (currentPhase === null) return;
    const state = phases[currentPhase];
    state.durationMs = bounded(state.durationMs + time - phaseStart);
    state.status = 'completed'; currentPhase = null;
  }
  function enterPhase(name) {
    if (!PHASES.includes(name)) throw new RangeError('Unknown workflow timing phase.');
    const time = clock(); closePhase(time);
    currentPhase = name; phaseStart = time;
    phases[name].count = bounded(phases[name].count + 1); phases[name].status = 'pending';
  }
  function completePhase() { closePhase(clock()); }
  function snapshot() {
    const time = clock();
    return {
      elapsedMs: time,
      overlap: 'Categories overlap; evaluate is included in waitInspect/assemblyResponse when nested. totalMs includes pendingMs, the sum of active intervals; maxCompletedMs excludes them.',
      categories: Object.fromEntries(CATEGORIES.map(name => {
        const state = categories[name], pendingMs = bounded(time * state.activeCount - state.activeStarts);
        return [name, { count: state.count, completedCount: state.completedCount,
          totalMs: bounded(state.completedMs + pendingMs), maxCompletedMs: state.maxCompletedMs,
          activeCount: state.activeCount, pendingMs }];
      })),
      phases: Object.fromEntries(PHASES.map(name => [name, { count: phases[name].count,
        durationMs: bounded(phases[name].durationMs + (currentPhase === name ? time - phaseStart : 0)), status: phases[name].status }])),
      currentPhase,
    };
  }
  return { begin, enterPhase, completePhase, snapshot };
}

module.exports = { createWorkflowTiming };
