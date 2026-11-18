'use strict';

// Original analytical millimetre fixture, extending the tracked depth plate.
// A nominal radius of .8 deliberately differs from the driving radius 1: every
// material profile must come from the actual solve, including unvaried copies.
module.exports = () => {
  const document = require('./desktop-part-instance-depth-original.cjs')();
  document.id = 'original-instance-radius-plate';
  document.name = 'Original instance sketch-radius plate';
  const sketch = document.features[2];
  sketch.name = 'Círculo de radio conductor';
  sketch.profile = { kind: 'entities', points: [{ id: 'center', x: 3, y: 4 }],
    entities: [{ id: 'circle', type: 'circle', center: 'center', radius: .8, construction: false }],
    constraints: [{ id: 'fixed-center', type: 'fix', pointId: 'center', x: 3, y: 4 },
      { id: 'driving-radius', type: 'radius', entityId: 'circle', value: 1 }] };
  return document;
};
