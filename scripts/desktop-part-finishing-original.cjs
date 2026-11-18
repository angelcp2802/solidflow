'use strict';

// Original two-prism recipe shared analytically with kernel.body-workflow.test.ts.
// No imported geometry or stored topology references. A=[0,10]x[0,6]x[0,4], B=A+[20,0,0].
module.exports = () => ({
  version: 1, id: 'original-part-finishing', name: 'Original two-body finishing', units: 'mm',
  createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z',
  features: ['a', 'b'].flatMap((id, index) => [
    { id: 'sketch-' + id, type: 'sketch', name: 'Original ' + id.toUpperCase() + ' rectangle',
      plane: 'XY', offset: 0, profile: { kind: 'rectangle', center: [5 + 20 * index, 3], width: 10, height: 6 }, suppressed: false },
    { id: 'create-' + id, type: 'extrude', name: 'Body ' + id.toUpperCase(), sketchId: 'sketch-' + id,
      depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'workflow-body-' + id }, suppressed: false },
  ]),
});
