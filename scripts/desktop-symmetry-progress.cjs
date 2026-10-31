'use strict';

const families = ['startup', 'point', 'line', 'plane', 'sphere', 'cylinder', 'axisline'];
const stages = ['startup', 'picking', 'author-preview', 'apply', 'history', 'edit-preview', 'edit-cancel', 'save', 'reopen', 'fresh-preview', 'fresh-cancel', 'capture', 'complete'];

/** Passive scalar checkpoint. It neither accepts a native result nor changes a
 * wait, action, file operation or deadline. No document/reference payloads. */
function createSymmetryProgress(now = () => performance.now()) {
  if (typeof now !== 'function') throw new TypeError('A monotonic clock function is required.');
  let last = 0;
  const clock = () => {
    try { const value = now(); if (Number.isFinite(value) && value >= 0) last = Math.max(last, Math.min(Number.MAX_SAFE_INTEGER, value)); }
    catch { /* Diagnostics must not replace the original workflow outcome. */ }
    return last;
  };
  const startedMs = clock(), record = { family: 'startup', stage: 'startup', startedMs, stageStartedMs: startedMs, completedCases: 0 };
  return { record,
    enter(family, stage) {
      if (!families.includes(family) || !stages.includes(stage)) throw new RangeError('Unknown original symmetry checkpoint.');
      record.family = family; record.stage = stage; record.stageStartedMs = clock();
    },
    caseCompleted() { record.completedCases = Math.min(6, record.completedCases + 1); },
  };
}

module.exports = { createSymmetryProgress };
