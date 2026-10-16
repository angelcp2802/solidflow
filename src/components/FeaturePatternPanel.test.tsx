import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Feature, RepetitionFeature } from '../cad/kernel.types';
import FeaturePatternPanel from './FeaturePatternPanel';
import PatternPanel from './PatternPanel';

// Original symbolic ownership fixtures. SSR checks controls, not native geometry or interaction.
const a = { bodyId: 'A', sourceFeatureId: 'create-a' };
const b = { bodyId: 'B', sourceFeatureId: 'create-b' };
const currentA = { bodyId: 'A', sourceFeatureId: 'cut-a' };
const sources: Feature[] = [
  { id: 'create-a', type: 'extrude', name: 'Base A', suppressed: false, sketchId: 'sketch-a', depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'A' } },
  { id: 'create-b', type: 'extrude', name: 'Base B', suppressed: false, sketchId: 'sketch-b', depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'B' } },
  { id: 'cut-a', type: 'cut', name: 'Corte A', suppressed: false, sketchId: 'cut-sketch', depth: 1, symmetric: false, bodyScope: [a] },
];
const noop = () => {};
const bodies = [{ ref: currentA, name: 'A actual' }, { ref: b, name: 'B actual' }];
function pattern(type: RepetitionFeature['type'] = 'linearPattern'): RepetitionFeature {
  const common = { id: 'pattern', name: 'Repetición', suppressed: false, baseFeatureId: 'cut-a',
    source: { mode: 'features' as const, geometryPattern: true as const, featureIds: ['create-a'] },
    featurePattern: { mode: 'geometry' as const, targets: [currentA, b], bindings: [{ source: a, targetBodyIds: ['A', 'B'] }] } };
  return type === 'linearPattern'
    ? { ...common, type, first: { count: 2, spacing: 10, direction: [1, 0, 0] }, second: null, secondSeedOnly: false, skipped: [] }
    : type === 'circularPattern'
      ? { ...common, type, axis: { origin: [0, 0, 0], direction: [0, 0, 1] }, count: 2, angle: 90, equalSpacing: true, reversed: false, skipped: [] }
      : { ...common, type, support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false };
}
function render(feature: RepetitionFeature, existing = false, loading = false, history: Feature[] = sources) {
  return renderToStaticMarkup(<PatternPanel feature={feature} features={history} planes={[]} onChange={noop}
    onPickFace={noop} pickingFace={false} canPickFace={false} onSourceKindChange={noop}
    bodyEditor={{ bodies, existing, loading, picking: false, onSelection: noop, onPicking: noop }} />);
}

describe('rendered scoped feature-pattern controls', () => {
  it.each(['linearPattern', 'circularPattern', 'mirror'] as const)('separates exact historical geometry and current targets for %s', type => {
    const feature = pattern(type), before = structuredClone(feature), html = render(feature);
    expect(html).toContain('aria-label="Tipo de repetición en cuerpos"');
    expect(html).toContain('value="features" selected=""');
    expect(html).toContain('aria-label="Operaciones para repetir"');
    expect(html).toContain('aria-label="Resultados de la operación para repetir"');
    expect(html).toContain('Repetir geometría de Base A — Base A');
    expect(html).toContain('aria-label="Cuerpos destino de la repetición de operaciones"');
    expect(html).toContain('Aplicar repetición a A actual');
    expect(html).toContain('Aplicar repetición a B actual');
    expect(html).toContain('Destinos de esta geometría');
    expect(html).toContain('La vista previa comprobará qué estados del historial están disponibles.');
    expect(html).not.toContain('aria-label="Tipo de elementos a repetir"');
    expect(html).not.toContain('aria-label="Cuerpos semilla"');
    expect(html).not.toContain('Fusionar cuerpos reflejados');
    expect(feature).toEqual(before);
  });

  it('keeps a historical source separate from the newer current state of the same body', () => {
    const html = render(pattern());
    const geometry = html.match(/aria-label="Resultados de la operación para repetir">([\s\S]*?)<\/div>/)?.[1];
    const targets = html.match(/aria-label="Cuerpos destino de la repetición de operaciones">([\s\S]*?)<\/div>/)?.[1];
    expect(geometry).toContain('Repetir geometría de Base A — Base A');
    expect(geometry).not.toContain('A actual');
    expect(targets).toContain('A actual');
    expect(targets).not.toContain('Base A — Base A');
    expect(geometry?.match(/type="checkbox"[^>]*checked=""/g)).toHaveLength(1);
    expect(targets?.match(/type="checkbox"[^>]*checked=""/g)).toHaveLength(2);
  });

  it('retains missing geometry and stale targets as explicit removal choices without substituting current refs', () => {
    const feature = pattern();
    feature.featurePattern = { mode: 'geometry', targets: [a],
      bindings: [{ source: { bodyId: 'missing-body', sourceFeatureId: 'missing-step' }, targetBodyIds: ['A'] }] };
    const before = structuredClone(feature), html = render(feature);
    expect(html).toContain('Quitar geometría 1: Cuerpo no disponible — Paso no disponible');
    expect(html).toContain('Quitar destino no disponible de la repetición');
    expect(html).toContain('Destino no disponible · vuelve a seleccionarlo');
    const targets = html.match(/aria-label="Cuerpos destino de la repetición de operaciones">([\s\S]*?)<\/div>/)?.[1];
    expect(targets).toContain('aria-label="Aplicar repetición a A actual"');
    expect(targets).not.toMatch(/aria-label="Aplicar repetición a A actual"[^>]*checked/);
    expect(feature).toEqual(before);
  });

  it('labels potential no-op pattern outputs for preview instead of claiming native availability', () => {
    const owner = pattern(); owner.id = 'earlier-pattern'; owner.name = 'Repetición anterior';
    const feature = pattern();
    feature.source = { mode: 'features', geometryPattern: true, featureIds: [owner.id] };
    feature.featurePattern = { mode: 'geometry', targets: [currentA], bindings: [{ source: { bodyId: 'A', sourceFeatureId: owner.id }, targetBodyIds: ['A'] }] };
    const before = structuredClone(feature), html = render(feature, false, false, [...sources, owner]);
    expect(html).toContain('Base A — Repetición anterior');
    expect(html).toContain('La vista previa comprobará qué estados del historial están disponibles.');
    expect(html).not.toContain('Geometría validada');
    expect(feature).toEqual(before);
  });

  it.each([{ existing: true, loading: false }, { existing: false, loading: true }])('locks source-category conversion with %j', flags => {
    const html = render(pattern(), flags.existing, flags.loading);
    expect(html).toContain('aria-label="Tipo de repetición en cuerpos" disabled=""');
  });

  it('paginates a large historical operation while keeping an off-page selected result visible for repair', () => {
    const slots = Array.from({ length: 127 }, (_, index) => ({ seedBodyId: 'A', address: `${index + 1},0`, bodyId: `copy-${index + 1}`, retired: false }));
    const owner: RepetitionFeature = { id: 'many-copies', name: 'Copias históricas', type: 'linearPattern', suppressed: false,
      baseFeatureId: 'cut-a', source: { mode: 'bodies', scope: 'current', bodies: [currentA] }, bodyPattern: { mode: 'new', instances: slots },
      first: { count: 128, spacing: 10, direction: [1, 0, 0] }, second: null, secondSeedOnly: false, skipped: [] };
    const feature = pattern();
    feature.source = { mode: 'features', geometryPattern: true, featureIds: [owner.id] };
    feature.featurePattern = { mode: 'geometry', targets: [currentA], bindings: [{ source: { bodyId: slots[126].bodyId, sourceFeatureId: owner.id }, targetBodyIds: ['A'] }] };
    const before = structuredClone(feature);
    const html = renderToStaticMarkup(<FeaturePatternPanel feature={feature} features={[...sources, owner]} onChange={noop}
      editor={{ bodies, existing: false, loading: false, picking: false, onSelection: noop, onPicking: noop }} />);
    const geometry = html.match(/aria-label="Resultados de la operación para repetir">([\s\S]*?)<\/div>/)?.[1];
    expect(geometry?.match(/type="checkbox"/g)).toHaveLength(64);
    expect(html).toContain('Página siguiente de geometrías');
    expect(html).toContain('1 / 2');
    expect(html).toContain('Quitar geometría 1: Copias históricas · Copia 128, 1 — Copias históricas');
    expect(geometry).not.toContain('Copia 128, 1');
    expect(feature).toEqual(before);
  });
});
