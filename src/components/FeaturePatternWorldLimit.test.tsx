import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Feature, RepetitionFeature } from '../cad/kernel.types';
import FeaturePatternPanel from './FeaturePatternPanel';
import { withFeaturePatternWorldLimit } from '../model/featurePatternCommands';

// Original symbolic render inputs. These do not exercise pointer events or CAD.
const base = { bodyId: 'ui-world-owner', sourceFeatureId: 'ui-world-base' };
const current = { bodyId: base.bodyId, sourceFeatureId: 'ui-world-cut' };
const history: Feature[] = [
  { id: base.sourceFeatureId, name: 'Base original', type: 'extrude', suppressed: false,
    sketchId: 'ui-base-sketch', depth: 16, symmetric: false, bodyOperation: { mode: 'new', bodyId: base.bodyId } },
  { id: current.sourceFeatureId, name: 'Corte hasta XY', type: 'cut', suppressed: false, sketchId: 'ui-limit-sketch',
    depth: 6, symmetric: false, bodyScope: [base], endCondition: { kind: 'upToSurface', target: { kind: 'principal', plane: 'XY' } } },
];
function pattern(): RepetitionFeature {
  return { id: 'ui-world-pattern', name: 'Repetición original', type: 'linearPattern', suppressed: false,
    baseFeatureId: current.sourceFeatureId, source: { mode: 'features', geometryPattern: false, featureIds: [current.sourceFeatureId] },
    first: { direction: [.6, 0, .8], count: 2, spacing: 5 }, second: null, secondSeedOnly: false, skipped: [],
    featurePattern: { mode: 'regenerate', scope: 'selected', targets: [current],
      bindings: [{ source: current, targetBodyIds: [current.bodyId] }], referencePolicies: [], variation: { kind: 'none' } } };
}
function render(feature: RepetitionFeature, features = history, loading = false) {
  return renderToStaticMarkup(<FeaturePatternPanel feature={feature} features={features} onChange={() => {}}
    editor={{ bodies: [{ ref: current, name: 'Cuerpo original' }], existing: false, loading, picking: false,
      onPicking: () => {}, onSelection: () => {} }} />);
}
const control = (html: string) => html.match(/<input[^>]*aria-label="Mantener plano límite fijo de Corte hasta XY"[^>]*>/)?.[0];

describe('rendered principal-plane recipe choice', () => {
  it('shows a required explicit choice without selecting it on behalf of the user', () => {
    const feature = pattern(), before = structuredClone(feature), html = render(feature);
    expect(control(html)).toContain('type="checkbox"');
    expect(control(html)).not.toContain('checked=""');
    expect(html).toContain('Su profundidad se recalcula desde la posición de la copia.');
    expect(feature).toEqual(before);
  });

  it('renders the saved choice and disables edits while a rebuild is active', () => {
    const feature = withFeaturePatternWorldLimit(pattern(), current.sourceFeatureId, true), html = render(feature, history, true);
    expect(control(html)).toContain('checked=""');
    expect(control(html)).toContain('disabled=""');
  });

  it('keeps a stale saved choice removable after its source changes end condition', () => {
    const feature = withFeaturePatternWorldLimit(pattern(), current.sourceFeatureId, true), changed = structuredClone(history);
    const seed = changed.at(-1);
    if (seed?.type !== 'cut') throw new Error('Expected original cut.');
    delete seed.endCondition;
    const html = render(feature, changed);
    expect(control(html)).toBeUndefined();
    expect(html).toContain('aria-label="Quitar plano límite no disponible"');
    expect(html).toContain('Plano límite no disponible · quitar');
  });

  it('offers no principal-plane policy for an unsupported datum target', () => {
    const changed = structuredClone(history), seed = changed.at(-1);
    if (seed?.type !== 'cut') throw new Error('Expected original cut.');
    seed.endCondition = { kind: 'upToSurface', target: { kind: 'plane', planeId: 'unsupported-datum' } };
    expect(render(pattern(), changed)).not.toContain('Mantener plano límite fijo');
  });
});
