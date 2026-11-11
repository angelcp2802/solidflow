import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { LinearPatternFeature } from '../cad/kernel.types';
import { patternPlan } from '../cad/kernel.patterns';
import { validateDocument } from '../model/document';
import { extractRecipeClosure, requireInitialRecipeDeclaration, type RegenerationRequest } from '../model/featureRecipes';
import PatternPanel from './PatternPanel';

const require = createRequire(import.meta.url);
const original = () => validateDocument(require('../../scripts/desktop-part-recipe-availability-original.cjs')());
const target = { bodyId: 'plate-body', sourceFeatureId: 'hole' };
function pattern(seed: string, mode: 'geometry' | 'regenerate' = 'geometry'): LinearPatternFeature {
  const routes = { targets: [target], bindings: [{ source: { bodyId: target.bodyId, sourceFeatureId: seed }, targetBodyIds: [target.bodyId] }] };
  return { id: 'availability-pattern', name: 'Original availability pattern', type: 'linearPattern', suppressed: false, baseFeatureId: 'hole',
    source: { mode: 'features', geometryPattern: mode === 'geometry', featureIds: [seed] },
    first: { direction: [1, 0, 0], count: 2, spacing: 5 }, second: null, secondSeedOnly: false, skipped: [],
    featurePattern: mode === 'geometry' ? { ...routes, mode } : { ...routes, mode, scope: 'selected', referencePolicies: [], variation: { kind: 'none' } } };
}
const unexpected = () => { throw Error('Rendering availability must not change the document or invoke native work'); };
function render(feature: LinearPatternFeature) {
  return renderToStaticMarkup(<PatternPanel feature={feature} features={original().features} planes={[]} onChange={unexpected}
    onPickFace={unexpected} pickingFace={false} canPickFace={false} autoScope={{ available: true, pending: false, onCapture: unexpected }}
    bodyEditor={{ bodies: [{ ref: target, name: 'Original current plate' }], existing: false, loading: false, picking: false, onSelection: unexpected, onPicking: unexpected }} />);
}
function request(seed: string, dynamic = false): RegenerationRequest {
  const feature = pattern(seed, 'regenerate');
  return { mode: 'regenerate', geometryPattern: false, patternId: feature.id, patternKind: feature.type, beforeFeatureIndex: original().features.length,
    sourceFeatureIds: [seed], plan: patternPlan(feature), scope: dynamic ? { mode: 'all', reevaluateAt: 'patternInput' } : { mode: 'selected', targets: [target] },
    targetSnapshot: [target], bindings: [{ source: { bodyId: target.bodyId, sourceFeatureId: seed }, targets: dynamic ? 'scope' : [target.bodyId] }],
    referencePolicies: [], variation: { kind: 'none' } };
}

it('blocks a new Recalculate selection for Hole without changing its normal operation or saved intent', () => {
  const feature = pattern('hole'), before = structuredClone(feature), html = render(feature);
  expect(html).toContain('<option value="regenerate" disabled="">Recalcular operaciones</option>');
  expect(html).toContain('Esta operación admite su uso normal');
  const closure = extractRecipeClosure(original().features, request('hole'));
  expect(closure.diagnostics).toContainEqual(expect.objectContaining({ code: 'OPERATION_RECIPE_PENDING' }));
  expect(() => requireInitialRecipeDeclaration(closure)).toThrow(/Regeneration for hole/);
  expect(feature).toEqual(before);
});
it('blocks ALL and AUTO for the same Selected-only entity merge rejected by the unchanged native gate', () => {
  const html = render(pattern('boss', 'regenerate'));
  expect(html).toContain('<option value="all" disabled="">Todos los cuerpos actuales</option>');
  expect(html).toContain('<option value="auto" disabled="">Detectar cuerpos automáticamente</option>');
  expect(() => requireInitialRecipeDeclaration(extractRecipeClosure(original().features, request('boss')))).not.toThrow();
  const closure = extractRecipeClosure(original().features, request('boss', true));
  expect(closure.diagnostics).toContainEqual(expect.objectContaining({ code: 'ALL_POSITIVE_SCOPE_PENDING' }));
  expect(() => requireInitialRecipeDeclaration(closure)).toThrow(/Additive ALL currently requires/);
});

it('keeps a chosen unsupported seed and its Recalculate method visible and removable for repair', () => {
  const feature = pattern('hole', 'regenerate'), before = structuredClone(feature), html = render(feature);
  expect(html).toMatch(/aria-label="Repetir Normal hole seed"[^>]*checked=""/);
  const row = html.match(/<input[^>]*aria-label="Repetir Normal hole seed"[^>]*>/)?.[0];
  expect(row).toBeDefined(); expect(row).not.toContain('disabled');
  expect(html).toContain('<option value="regenerate" disabled="" selected="">Recalcular operaciones</option>');
  expect(feature).toEqual(before);
});

it('blocks only unchecked unsupported seeds in Recalculate and preserves missing-reference removal', () => {
  const html = render(pattern('pocket', 'regenerate'));
  expect(html).toMatch(/aria-label="Repetir Normal hole seed"[^>]*disabled=""/);
  expect(html).toMatch(/aria-label="Repetir Entity merge seed"[^>]*>/);
  const missing = render(pattern('missing', 'regenerate'));
  expect(missing).toContain('aria-label="Quitar referencia perdida missing"');
  const row = missing.match(/<input[^>]*aria-label="Quitar referencia perdida missing"[^>]*>/)?.[0];
  expect(row).toBeDefined(); expect(row).not.toContain('disabled');
});
