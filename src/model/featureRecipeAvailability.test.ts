import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';
import type { Feature, LinearPatternFeature } from '../cad/kernel.types';
import { validateDocument } from './document';
import { recipeSeedUnavailableReason, recipeSelectionUnavailableReason } from './featureRecipeAvailability';
import * as recipes from './featureRecipes';
import { withFeaturePatternInstanceDepth } from './featurePatternCommands';

const require = createRequire(import.meta.url);
function fixture() {
  const document = validateDocument(require('../../scripts/desktop-part-recipe-availability-original.cjs')());
  return { document, index: new Map(document.features.map(feature => [feature.id, feature])), cut: document.features[3], boss: document.features[5] };
}
function pattern(): LinearPatternFeature {
  const owner = { bodyId: 'plate-body', sourceFeatureId: 'hole' };
  return { id: 'availability-model', name: 'Original availability metadata', type: 'linearPattern', suppressed: false, baseFeatureId: 'hole',
    source: { mode: 'features', geometryPattern: false, featureIds: ['pocket'] }, first: { direction: [1, 0, 0], count: 2, spacing: 5 },
    second: null, secondSeedOnly: false, skipped: [], featurePattern: { mode: 'regenerate', scope: 'selected', targets: [owner],
      bindings: [{ source: { bodyId: owner.bodyId, sourceFeatureId: 'pocket' }, targetBodyIds: [owner.bodyId] }], referencePolicies: [], variation: { kind: 'none' } } };
}

it.each(['revolve', 'revolvedCut', 'hole', 'fillet', 'chamfer', 'shell', 'draft', 'sweep', 'loft', 'combine', 'linearPattern', 'circularPattern', 'mirror', 'importedSolid', 'importedBodies'] as const)(
  'distinguishes normal %s capability from its unavailable regeneration recipe', type => {
    const { index, cut } = fixture(), seed = { ...cut, type } as Feature, before = structuredClone(seed);
    expect(recipeSeedUnavailableReason(seed, index, 'selected')).toMatch(/uso normal/);
    expect(seed).toEqual(before);
  });

it('admits the existing cut and Selected entity merge while retaining the exact additive dynamic boundary', () => {
  const { index, cut, boss } = fixture();
  expect(recipeSeedUnavailableReason(cut, index, 'selected')).toBeNull();
  expect(recipeSeedUnavailableReason(cut, index, 'dynamic')).toBeNull();
  expect(recipeSeedUnavailableReason(boss, index, 'selected')).toBeNull();
  expect(recipeSeedUnavailableReason(boss, index, 'dynamic')).toMatch(/Este perfil/);
  const primitiveSketch = index.get('boss-profile');
  if (primitiveSketch?.type !== 'sketch') throw Error('Original profile required');
  primitiveSketch.profile = { kind: 'circle', center: [12, 4], radius: 1 };
  expect(recipeSeedUnavailableReason(boss, index, 'dynamic')).toBeNull();
});

it.each(['new-owner', 'legacy-merge', 'legacy-cut', 'support', 'face-limit', 'datum-limit', 'missing-sketch', 'suppressed-sketch', 'suppressed-seed'] as const)(
  'explains the known metadata rejection %s without mutating any source definition', fault => {
    const { index, cut, boss } = fixture();
    let seed = cut;
    if (cut.type !== 'cut' || boss.type !== 'extrude') throw Error('Original explicit operations required');
    const sketch = index.get(cut.sketchId);
    if (sketch?.type !== 'sketch') throw Error('Original source sketch required');
    if (fault === 'new-owner') { boss.bodyOperation = { mode: 'new', bodyId: 'new' }; seed = boss; }
    if (fault === 'legacy-merge') { delete boss.bodyOperation; seed = boss; }
    if (fault === 'legacy-cut') delete cut.bodyScope;
    if (fault === 'support') sketch.support = { kind: 'plane', planeId: 'associated-plane' };
    if (fault === 'face-limit') cut.endCondition = { kind: 'upToSurface', target: { kind: 'face', face: { sourceFeatureId: 'plate', key: 'opaque-original-face' } } };
    if (fault === 'datum-limit') cut.endCondition = { kind: 'upToSurface', target: { kind: 'plane', planeId: 'associated-plane' } };
    if (fault === 'missing-sketch') index.delete(cut.sketchId);
    if (fault === 'suppressed-sketch') sketch.suppressed = true;
    if (fault === 'suppressed-seed') cut.suppressed = true;
    const before = structuredClone(seed);
    expect(recipeSeedUnavailableReason(seed, index, 'selected')).not.toBeNull();
    expect(seed).toEqual(before);
  });

it('retains principal-limit policy repair and ignores an inactive second limit exactly as the native declaration gate does', () => {
  const { index, cut } = fixture();
  if (cut.type !== 'cut') throw Error('Original cut required');
  cut.endCondition = { kind: 'upToSurface', target: { kind: 'principal', plane: 'XY' } };
  expect(recipeSeedUnavailableReason(cut, index, 'selected')).toBeNull();
  cut.secondDirection = { enabled: false, depth: 2, endCondition: { kind: 'upToSurface', target: { kind: 'plane', planeId: 'old-disabled-limit' } } };
  expect(recipeSeedUnavailableReason(cut, index, 'selected')).toBeNull();
  cut.secondDirection.enabled = true;
  expect(recipeSeedUnavailableReason(cut, index, 'selected')).toMatch(/Hasta superficie/);
});

it.each(['limit', 'wall', 'second-off'] as const)('keeps the existing primitive dynamic exclusion for %s', field => {
  const { index, boss } = fixture();
  if (boss.type !== 'extrude') throw Error('Original merge required');
  const sketch = index.get(boss.sketchId);
  if (sketch?.type !== 'sketch') throw Error('Original circle required');
  sketch.profile = { kind: 'circle', center: [12, 4], radius: 1 };
  if (field === 'limit') boss.endCondition = { kind: 'throughAll', baseFeatureId: 'pocket', bothDirections: false };
  if (field === 'wall') boss.thinWall = { kind: 'one-side', thickness: .1, reversed: false };
  if (field === 'second-off') boss.secondDirection = { enabled: false, depth: 2 };
  expect(recipeSeedUnavailableReason(boss, index, 'selected')).toBeNull();
  expect(recipeSeedUnavailableReason(boss, index, 'dynamic')).not.toBeNull();
});

it('leaves assignments and stale IDs intact while explaining an unavailable dynamic choice', () => {
  const { index } = fixture(), varied = withFeaturePatternInstanceDepth(pattern(), '1,0', -2), before = structuredClone(varied);
  expect(recipeSelectionUnavailableReason(varied, index, 'dynamic')).toMatch(/variaciones/);
  expect(varied).toEqual(before);
  const missing = pattern(); missing.source = { mode: 'features', geometryPattern: false, featureIds: ['old-unavailable-operation'] };
  expect(recipeSelectionUnavailableReason(missing, index, 'selected')).toMatch(/Quita su referencia/);
  expect(missing.source.featureIds).toEqual(['old-unavailable-operation']);
});

it('uses bounded metadata lookups without extracting closures or solving when only draft fields change', () => {
  const { index, cut } = fixture(), feature = pattern(), extraction = vi.spyOn(recipes, 'extractRecipeClosure');
  const sourceIds = Array.from({ length: 32 }, (_, i) => `original-cut-${i}`);
  sourceIds.forEach(id => index.set(id, { ...cut, id }));
  feature.source = { mode: 'features', geometryPattern: false, featureIds: sourceIds };
  const lookup = vi.spyOn(index, 'get');
  try {
    for (let i = 0; i < 10; i++) {
      feature.first.spacing = i + 1;
      expect(recipeSelectionUnavailableReason(feature, index, 'selected')).toBeNull();
    }
    expect(lookup).toHaveBeenCalledTimes(32 * 2 * 10);
    expect(extraction).not.toHaveBeenCalled();
  } finally { lookup.mockRestore(); extraction.mockRestore(); }
});
