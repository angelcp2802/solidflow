'use strict';

module.exports = function createSymmetryResponseReader({ observe, waitFor, check }) {
  return async (serial, action) => waitFor('actual ' + action, async () => {
    const state = await observe.assemblyResponseAfter(serial, action);
    check(!state.workerErrors.length, 'Actual worker errors');
    // The projection retains the latest completed record. It is equivalent to
    // the former first-match read only while the exact count remains at most one.
    check(state.completedCount <= 1, 'Duplicate ' + action);
    if (!state.record) return false;
    check(state.record.response.ok, state.record.response.error || 'Actual operation failed');
    return state.record;
  });
};
