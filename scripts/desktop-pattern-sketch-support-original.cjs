'use strict';

// Original metric primitives. Positive 90 degrees about Y carries the -Z cut ray into -X.
module.exports = function original() {
  const base = structuredClone(require('../src/cad/fixtures/pattern-world-limit-original.json'));
  const box = (id, min, max) => [
    { id: 'profile-' + id, name: 'Original profile ' + id, type: 'sketch', suppressed: false, plane: 'XY', offset: min[2],
      profile: { kind: 'rectangle', center: [(min[0]+max[0])/2, (min[1]+max[1])/2], width: max[0]-min[0], height: max[1]-min[1] } },
    { id: 'create-' + id, name: 'Original ' + id, type: 'extrude', suppressed: false, sketchId: 'profile-' + id,
      depth: max[2]-min[2], symmetric: false, bodyOperation: { mode: 'new', bodyId: id } },
  ];
  const a = { id: 'datum-a', name: 'Plano inicial invertido', type: 'plane', suppressed: false,
    support: { kind: 'principal', plane: 'XY' }, reversed: true, offset: 6 };
  const b = { ...a, id: 'datum-b', name: 'Plano derivado', support: { kind: 'plane', planeId: a.id }, reversed: false, offset: 1 };
  const sketch = { id: 'profile-c', name: 'Perfil asociado', type: 'sketch', suppressed: false, support: { kind: 'plane', planeId: b.id },
    plane: 'XZ', offset: 1, profile: { kind: 'entities', points: [{ id: 'centre', x: 5, y: -5 }],
      entities: [{ id: 'circle', type: 'circle', center: 'centre', radius: 1, construction: false }],
      constraints: [{ id: 'anchor', type: 'fix', pointId: 'centre', x: 5, y: -5 },
        { id: 'radius', type: 'radius', entityId: 'circle', value: 2 },
        { id: 'measurement', type: 'radius', entityId: 'circle', value: 999, driven: true }] } };
  const seed = { id: 'seed-limit', name: 'Corte asociado', type: 'cut', suppressed: false, sketchId: sketch.id, depth: 2, symmetric: false,
    bodyScope: [{ bodyId: 'S', sourceFeatureId: 'create-S' }], endCondition: { kind: 'throughAll', baseFeatureId: 'create-S', bothDirections: false } };
  const prior = base.features.at(-1);
  const pattern = { id: prior.id, name: 'Patrón del croquis asociado', type: 'circularPattern', suppressed: false, baseFeatureId: 'create-A',
    source: prior.source, featurePattern: prior.featurePattern, axis: { origin: [12,0,0], direction: [0,1,0] }, count: 2,
    angle: 90, equalSpacing: false, reversed: false, skipped: [] };
  return { ...base, id: 'original-transformed-associative-profile', name: 'Croquis asociado original',
    features: [a, b, ...box('S', [0,0,0], [10,10,6]), sketch, seed, ...box('A', [8,0,2], [18,10,12]), pattern] };
};
