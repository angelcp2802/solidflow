import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Feature, RepetitionFeature } from '../cad/kernel.types';
import FeaturePatternPanel, { FeaturePatternWorldLimits } from './FeaturePatternPanel';
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
const FIRST = 'Mantener plano límite fijo de Corte hasta XY', SECOND = 'Mantener plano límite fijo de dirección 2 de Corte hasta XY';
interface ControlProps { children?: ReactNode; 'aria-label'?: string; checked?: boolean; disabled?: boolean; onChange?: (event: { target: { checked: boolean } }) => void }
function field(root: ReactNode, label: string): ReactElement<ControlProps> {
  let found: ReactElement<ControlProps> | undefined;
  const visit = (node: ReactNode) => Children.forEach(node, child => {
    if (!isValidElement<ControlProps>(child)) return;
    if (child.props['aria-label'] === label) found = child;
    else if (child.props.children) visit(child.props.children);
  });
  visit(root);
  if (!found) throw Error('Missing world-limit control: ' + label);
  return found;
}
function twoTargets() {
  const features = structuredClone(history), seed = features.at(-1);
  if (seed?.type !== 'cut') throw Error('Original cut required.');
  seed.secondDirection = { enabled: true, depth: 3, endCondition: { kind: 'upToSurface', target: { kind: 'principal', plane: 'XZ' } } };
  return { features, seed };
}

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

  it('offers D2 explicitly when D1 is Blind without changing either source declaration', () => {
    const { features, seed } = twoTargets(); delete seed.endCondition;
    const before = structuredClone(features), html = render(pattern(), features);
    expect(control(html)).toBeUndefined();
    expect(html).toContain(`aria-label="${SECOND}"`);
    expect(html.match(new RegExp(`<input[^>]*aria-label="${SECOND}"[^>]*>`))?.[0]).not.toContain('checked=""');
    expect(features).toEqual(before);
  });

  it('toggles each locator independently for the same seed and keeps both checkbox states truthful', () => {
    const { features } = twoTargets(), onChange = vi.fn();
    let feature = withFeaturePatternWorldLimit(withFeaturePatternWorldLimit(pattern(), current.sourceFeatureId, true), current.sourceFeatureId, true, 'secondDirection.endCondition.target');
    const original = structuredClone(feature);
    const root = () => FeaturePatternWorldLimits({ feature, features, loading: false, onChange });
    expect(field(root(), FIRST).props.checked).toBe(true); expect(field(root(), SECOND).props.checked).toBe(true);
    field(root(), FIRST).props.onChange?.({ target: { checked: false } });
    feature = { ...feature, ...onChange.mock.lastCall![0] };
    expect(feature.featurePattern).toMatchObject({ referencePolicies: [{ featureId: current.sourceFeatureId, path: 'secondDirection.endCondition.target', placement: 'world' }] });
    expect(field(root(), FIRST).props.checked).toBe(false); expect(field(root(), SECOND).props.checked).toBe(true);
    field(root(), FIRST).props.onChange?.({ target: { checked: true } });
    feature = { ...feature, ...onChange.mock.lastCall![0] };
    field(root(), SECOND).props.onChange?.({ target: { checked: false } });
    feature = { ...feature, ...onChange.mock.lastCall![0] };
    expect(feature.featurePattern).toMatchObject({ referencePolicies: [{ featureId: current.sourceFeatureId, path: 'endCondition.target', placement: 'world' }] });
    expect(field(root(), FIRST).props.checked).toBe(true); expect(field(root(), SECOND).props.checked).toBe(false);
    expect(original.featurePattern).toMatchObject({ referencePolicies: expect.any(Array) });
    expect(original.featurePattern?.mode === 'regenerate' && original.featurePattern.referencePolicies).toHaveLength(2);
  });

  it('retains an editable inactive principal-plane policy without marking the reference unavailable', () => {
    const { features, seed } = twoTargets(), onChange = vi.fn(); seed.secondDirection!.enabled = false;
    const feature = withFeaturePatternWorldLimit(withFeaturePatternWorldLimit(pattern(), current.sourceFeatureId, true), current.sourceFeatureId, true, 'secondDirection.endCondition.target');
    const root = FeaturePatternWorldLimits({ feature, features, loading: false, onChange });
    expect(field(root, FIRST).props.checked).toBe(true); expect(field(root, SECOND).props.checked).toBe(true);
    expect(field(root, SECOND).props.disabled).toBe(false);
    expect(renderToStaticMarkup(root)).not.toContain('no disponible');
    field(root, SECOND).props.onChange?.({ target: { checked: false } });
    expect(onChange.mock.lastCall![0].featurePattern.referencePolicies).toEqual([{ featureId: current.sourceFeatureId, path: 'endCondition.target', placement: 'world' }]);
    expect(seed.secondDirection).toMatchObject({ enabled: false, depth: 3, endCondition: { kind: 'upToSurface' } });
  });

  it.each(['face', 'datum', 'removed'] as const)('removes only a stale second policy after its source becomes %s', state => {
    const { features, seed } = twoTargets(), onChange = vi.fn();
    const feature = withFeaturePatternWorldLimit(withFeaturePatternWorldLimit(pattern(), current.sourceFeatureId, true), current.sourceFeatureId, true, 'secondDirection.endCondition.target');
    if (state === 'face') seed.secondDirection!.endCondition = { kind: 'upToSurface', target: { kind: 'face', face: { sourceFeatureId: base.sourceFeatureId, key: 'face-v1|original' } } };
    if (state === 'datum') seed.secondDirection!.endCondition = { kind: 'upToSurface', target: { kind: 'plane', planeId: 'datum' } };
    if (state === 'removed') delete seed.secondDirection!.endCondition;
    const root = FeaturePatternWorldLimits({ feature, features, loading: false, onChange });
    expect(field(root, FIRST).props.checked).toBe(true);
    const stale = field(root, 'Quitar plano límite no disponible de dirección 2');
    expect(stale.props.checked).toBe(true); stale.props.onChange?.({ target: { checked: false } });
    expect(onChange.mock.lastCall![0].featurePattern.referencePolicies).toEqual([{ featureId: current.sourceFeatureId, path: 'endCondition.target', placement: 'world' }]);
    expect(feature.featurePattern?.mode === 'regenerate' && feature.featurePattern.referencePolicies).toHaveLength(2);
  });

  it('withholds both toggles and stale-policy removal while loading', () => {
    const { features, seed } = twoTargets(), onChange = vi.fn();
    const feature = withFeaturePatternWorldLimit(pattern(), current.sourceFeatureId, true, 'secondDirection.endCondition.target');
    const root = FeaturePatternWorldLimits({ feature, features, loading: true, onChange });
    for (const label of [FIRST, SECOND]) {
      expect(field(root, label).props.disabled).toBe(true);
      field(root, label).props.onChange?.({ target: { checked: true } });
    }
    delete seed.secondDirection!.endCondition;
    const stale = field(FeaturePatternWorldLimits({ feature, features, loading: true, onChange }), 'Quitar plano límite no disponible de dirección 2');
    expect(stale.props.disabled).toBe(true); stale.props.onChange?.({ target: { checked: false } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
