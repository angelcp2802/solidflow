'use strict';

// Original millimetre plate extending the tracked instance-depth fixture.
// Three real historical seeds: an admitted cut, a Selected-only entity merge,
// and a normal supported Hole operation without a regeneration recipe.
module.exports = () => {
  const document = require('./desktop-part-instance-depth-original.cjs')();
  document.id = 'original-recipe-availability';
  document.name = 'Original recipe availability plate';
  document.features.push(
    { id: 'boss-profile', name: 'Original fixed circle', type: 'sketch', suppressed: false, plane: 'XY', offset: 5,
      profile: { kind: 'entities', points: [{ id: 'center', x: 12, y: 4 }],
        entities: [{ id: 'circle', type: 'circle', center: 'center', radius: 1, construction: false }],
        constraints: [{ id: 'fixed-center', type: 'fix', pointId: 'center', x: 12, y: 4 },
          { id: 'driving-radius', type: 'radius', entityId: 'circle', value: 1 }] } },
    { id: 'boss', name: 'Entity merge seed', type: 'extrude', suppressed: false, sketchId: 'boss-profile', depth: 1, symmetric: false,
      bodyOperation: { mode: 'merge', target: { bodyId: 'plate-body', sourceFeatureId: 'pocket' } } },
    { id: 'hole', name: 'Normal hole seed', type: 'hole', suppressed: false, baseFeatureId: 'boss', support: { kind: 'principal', plane: 'XY' },
      positions: [{ id: 'original-position', x: 17, y: 4 }], reversed: true, diameter: 1, endCondition: { kind: 'throughAll' }, head: { kind: 'simple' },
      bodyScope: [{ bodyId: 'plate-body', sourceFeatureId: 'boss' }] });
  return document;
};

// Structurally valid saved intent that the unchanged native recipe gate rejects.
// Opening/editing it must preserve the chosen IDs until an explicit repair.
module.exports.stale = () => {
  const document = module.exports();
  document.id = 'original-recipe-availability-stale';
  const owner = { bodyId: 'plate-body', sourceFeatureId: 'hole' };
  document.features.push({ id: 'stale-pattern', name: 'Original unavailable recipe', type: 'linearPattern', suppressed: false, baseFeatureId: 'hole',
    source: { mode: 'features', geometryPattern: false, featureIds: ['hole'] }, first: { direction: [1, 0, 0], count: 2, spacing: 5 },
    second: null, secondSeedOnly: false, skipped: [], featurePattern: { mode: 'regenerate', scope: 'selected', targets: [owner],
      bindings: [{ source: owner, targetBodyIds: [owner.bodyId] }], referencePolicies: [], variation: { kind: 'none' } } });
  return document;
};
