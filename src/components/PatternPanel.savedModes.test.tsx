import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Feature, RepetitionFeature } from '../cad/kernel.types';
import type { FeaturePatternOperation } from '../model/featurePatterns';
import PatternPanel from './PatternPanel';

// Original symbolic records. SSR observes saved-state presentation and render
// purity only; it neither invokes events nor supplies native availability proof.
const a = { bodyId: 'mode-ui-a', sourceFeatureId: 'create-a' };
const b = { bodyId: 'mode-ui-b', sourceFeatureId: 'create-b' };
const historical = { bodyId: a.bodyId, sourceFeatureId: 'parent-a' };
const current = { bodyId: a.bodyId, sourceFeatureId: 'child-a' };
const sources: Feature[] = [
  { id: a.sourceFeatureId, type: 'extrude', name: 'Base A', suppressed: false, sketchId: 'profile-a', depth: 4, symmetric: false,
    bodyOperation: { mode: 'new', bodyId: a.bodyId } },
  { id: b.sourceFeatureId, type: 'extrude', name: 'Base B', suppressed: false, sketchId: 'profile-b', depth: 4, symmetric: false,
    bodyOperation: { mode: 'new', bodyId: b.bodyId } },
  { id: historical.sourceFeatureId, type: 'extrude', name: 'Saliente histórico A', suppressed: false, sketchId: 'parent-profile', depth: 2,
    symmetric: false, bodyOperation: { mode: 'merge', target: a } },
  { id: current.sourceFeatureId, type: 'cut', name: 'Corte posterior A', suppressed: false, sketchId: 'child-profile', depth: -2,
    symmetric: false, bodyScope: [historical] },
];
const kinds = ['linearPattern', 'circularPattern', 'mirror'] as const;
type Mode = FeaturePatternOperation['mode'];
const cases = kinds.flatMap(kind => (['geometry', 'regenerate'] as const).map(mode => ({ kind, mode })));
function pattern(kind: RepetitionFeature['type'], mode: Mode): RepetitionFeature {
  const routes = { targets: [{ ...current }, { ...b }], bindings: [{ source: { ...historical }, targetBodyIds: [a.bodyId, b.bodyId] }] };
  const featurePattern: FeaturePatternOperation = mode === 'geometry' ? { mode, ...routes }
    : { mode, scope: 'selected', ...routes, referencePolicies: [], variation: { kind: 'none' } };
  const common = { id: 'mode-ui-pattern', name: 'Método guardado', suppressed: false, baseFeatureId: current.sourceFeatureId,
    source: { mode: 'features' as const, geometryPattern: mode === 'geometry', featureIds: [historical.sourceFeatureId] }, featurePattern };
  return kind === 'linearPattern'
    ? { ...common, type: kind, first: { direction: [1, 0, 0], spacing: 20, count: 2 }, second: null, secondSeedOnly: false, skipped: [] }
    : kind === 'circularPattern'
      ? { ...common, type: kind, axis: { origin: [0, 0, 0], direction: [0, 0, 1] }, count: 2, angle: 180, equalSpacing: false, reversed: false, skipped: [] }
      : { ...common, type: kind, support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false };
}
const unexpectedEdit = () => { throw new Error('Rendering must not change the saved method, refs or selection'); };
function render(feature: RepetitionFeature, existing = false, loading = false): string {
  return renderToStaticMarkup(<PatternPanel feature={feature} features={sources} planes={[]} onChange={unexpectedEdit}
    onPickFace={unexpectedEdit} pickingFace={false} canPickFace={false} onSourceKindChange={unexpectedEdit}
    bodyEditor={{ bodies: [{ ref: current, name: 'Destino A actual' }, { ref: b, name: 'Destino B actual' }],
      existing, loading, picking: false, onSelection: unexpectedEdit, onPicking: unexpectedEdit }} />);
}
function methodSelect(html: string): string {
  const selected = html.match(/<select aria-label="Método de repetición de operaciones"[^>]*>[\s\S]*?<\/select>/)?.[0];
  expect(selected).toBeDefined();
  return selected!;
}

describe('rendered saved feature calculation methods', () => {
  it.each(cases)('presents saved $mode for $kind without substituting newer source refs', ({ kind, mode }) => {
    const feature = pattern(kind, mode), before = structuredClone(feature), historyBefore = structuredClone(sources), html = render(feature);
    const method = methodSelect(html);
    expect(method).toContain(`<option value="${mode}" selected="">`);
    expect(method).toContain('Copiar geometría');
    expect(method).toContain('Recalcular operaciones');
    expect(html.includes('Cada instancia se recalcula sobre sus cuerpos destino.')).toBe(mode === 'regenerate');
    const seed = html.match(/aria-label="Resultados de la operación para repetir">([\s\S]*?)<\/div>/)?.[1];
    const targets = html.match(/aria-label="Cuerpos destino de la repetición de operaciones">([\s\S]*?)<\/div>/)?.[1];
    expect(seed).toContain('Base A — Saliente histórico A');
    expect(seed).not.toContain('Destino A actual');
    expect(targets).toContain('Destino A actual');
    expect(targets?.match(/type="checkbox"[^>]*checked=""/g)).toHaveLength(2);
    expect(html).toContain('La vista previa comprobará qué estados del historial están disponibles.');
    expect(feature).toEqual(before);
    expect(sources).toEqual(historyBefore);
  });

  it('keeps method editing available on an existing scoped feature while locking source-category conversion', () => {
    const html = render(pattern('linearPattern', 'regenerate'), true);
    expect(html).toContain('aria-label="Tipo de repetición en cuerpos" disabled=""');
    expect(methodSelect(html)).not.toContain('disabled=');
  });

  it('disables the method during loading and retains a stale selected target for explicit repair', () => {
    const feature = pattern('mirror', 'regenerate');
    feature.featurePattern!.targets[0] = { ...a };
    const before = structuredClone(feature), html = render(feature, true, true);
    expect(methodSelect(html)).toContain('disabled=""');
    expect(html).toContain('Quitar destino no disponible de la repetición');
    expect(html).toContain('Destino no disponible · vuelve a seleccionarlo');
    expect(feature).toEqual(before);
  });

  it('does not expose an opt-in method declaration for a legacy feature-source pattern', () => {
    const feature = pattern('circularPattern', 'geometry');
    delete feature.featurePattern;
    const before = structuredClone(feature), html = render(feature);
    expect(html).not.toContain('aria-label="Método de repetición de operaciones"');
    expect(html).toContain('aria-label="Tipo de elementos a repetir"');
    expect(feature).toEqual(before);
  });
});
