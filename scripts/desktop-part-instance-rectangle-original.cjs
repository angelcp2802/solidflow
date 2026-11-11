'use strict';

// Original millimetre fixture extending the tracked instance-depth plate.
// The fixed lower-left corner and shared line endpoints make the two driving
// lengths independent. No solved geometry or material is embedded.
module.exports = (operation = 'cut') => {
  const document = require('./desktop-part-instance-depth-original.cjs')();
  document.id = 'original-instance-rectangle-plate';
  document.name = 'Original instance rectangle plate';
  const sketch = document.features[2];
  sketch.name = 'Rectángulo de cotas conductoras';
  sketch.profile = {
    kind: 'entities',
    points: [{ id: 'p0', x: 2, y: 3 }, { id: 'p1', x: 4, y: 3 },
      { id: 'p2', x: 4, y: 5 }, { id: 'p3', x: 2, y: 5 }],
    entities: [
      { id: 'bottom', type: 'line', start: 'p0', end: 'p1', construction: false },
      { id: 'right', type: 'line', start: 'p1', end: 'p2', construction: false },
      { id: 'top', type: 'line', start: 'p2', end: 'p3', construction: false },
      { id: 'left', type: 'line', start: 'p3', end: 'p0', construction: false },
    ],
    constraints: [
      { id: 'fixed-corner', type: 'fix', pointId: 'p0', x: 2, y: 3 },
      { id: 'horizontal-bottom', type: 'horizontal', entityId: 'bottom' },
      { id: 'vertical-right', type: 'vertical', entityId: 'right' },
      { id: 'horizontal-top', type: 'horizontal', entityId: 'top' },
      { id: 'vertical-left', type: 'vertical', entityId: 'left' },
      { id: 'driving-width', type: 'length', entityId: 'bottom', value: 2 },
      { id: 'driving-height', type: 'length', entityId: 'left', value: 2 },
    ],
  };
  if (operation === 'extrude') {
    document.id = 'original-instance-rectangle-boss-plate';
    document.name = 'Original instance rectangle boss plate';
    sketch.offset = 4;
    const { bodyScope, ...seed } = document.features[3];
    document.features[3] = { ...seed, name: 'Saliente semilla', type: 'extrude', depth: 2,
      bodyOperation: { mode: 'merge', target: bodyScope[0] } };
  }
  return document;
};
