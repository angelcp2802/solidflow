import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BodyReference, Feature, RepetitionFeature } from '../cad/kernel.types';
import { MAX_BODY_PATTERN_SLOTS, reconcileBodyPatternDraft } from '../model/bodyPatterns';
import PatternPanel from './PatternPanel';
import BodyPatternPanel, { bodyPatternHistoryChoices } from './BodyPatternPanel';

const a = { bodyId: 'A', sourceFeatureId: 'create-a' }, b = { bodyId: 'B', sourceFeatureId: 'create-b' };
const currentA = { ...a, sourceFeatureId: 'cut-a' };
const sources: Feature[] = [
  { id: 'create-a', type: 'extrude', name: 'Semilla A', suppressed: false, sketchId: 'sketch-a', depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'A' } },
  { id: 'create-b', type: 'extrude', name: 'Semilla B', suppressed: false, sketchId: 'sketch-b', depth: 3, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'B' } },
  { id: 'cut-a', type: 'cut', name: 'Corte A', suppressed: false, sketchId: 'cut-sketch', depth: 1, symmetric: false, bodyScope: [a] },
];
const noop = () => {};
function pattern(type: RepetitionFeature['type'] = 'linearPattern', scope: 'current' | 'historical' = 'current'): RepetitionFeature {
  const common = { id: 'pattern', name: 'Copias', suppressed: false, baseFeatureId: 'cut-a',
    source: { mode: 'bodies' as const, scope, bodies: [scope === 'current' ? currentA : a, b] },
    bodyPattern: { mode: 'new' as const, instances: [] } };
  const feature: RepetitionFeature = type === 'linearPattern'
    ? { ...common, type, first: { count: 3, spacing: 10, direction: [1, 0, 0] }, second: null, secondSeedOnly: false, skipped: [] }
    : type === 'circularPattern' ? { ...common, type, axis: { origin: [0, 0, 0], direction: [0, 0, 1] }, count: 4, angle: 360, equalSpacing: true, reversed: false, skipped: [] }
      : { ...common, type, support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false };
  let index = 0;
  return reconcileBodyPatternDraft(feature, () => `copy-${++index}`);
}
function render(feature: RepetitionFeature, existing = false, bodies = [{ ref: currentA, name: 'A actual' }, { ref: b, name: 'B actual' }], message?: string) {
  return renderToStaticMarkup(<PatternPanel feature={feature} features={sources} planes={[]} onChange={noop}
    onPickFace={noop} pickingFace={false} canPickFace={false}
    bodyEditor={{ bodies, existing, picking: false, loading: false, onSelection: noop, onPicking: noop, message }} />);
}

describe('rendered explicit body pattern controls', () => {
  it.each(['linearPattern', 'circularPattern', 'mirror'] as const)('renders multiple current seeds and a separate output choice for %s', type => {
    const html = render(pattern(type));
    expect(html).toContain('aria-label="Cuerpos semilla"');
    expect(html).toContain('Repetir cuerpo A actual');
    expect(html).toContain('Repetir cuerpo B actual');
    const seeds = html.match(/aria-label="Cuerpos semilla">([\s\S]*?)<\/div>/)?.[1];
    expect(seeds?.match(/type="checkbox"[^>]*checked=""/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Resultado de las copias"');
    expect(html).not.toContain('aria-label="Tipo de elementos a repetir"');
    expect(html).not.toContain('Fusionar cuerpos reflejados');
  });

  it('renders exact historical choices without treating their absence from the current catalog as substitution', () => {
    const feature = pattern('linearPattern', 'historical'), before = structuredClone(feature);
    const html = render(feature);
    expect(html).toContain('value="historical" selected=""');
    expect(html).toContain('aria-label="Paso del historial para cuerpos semilla"');
    expect(html).toContain('value="create-a" selected=""');
    expect(html).toContain('Semilla A — Semilla A');
    expect(html).not.toContain('Semilla A — Corte A');
    expect(html).toContain('Semilla B — Semilla B');
    expect(html).toContain('aria-label="Semillas seleccionadas del historial"');
    expect(html).toContain('Quitar semilla 2: Semilla B — Semilla B');
    expect(html).not.toContain('Cuerpo no disponible · vuelve a seleccionarlo');
    expect(feature).toEqual(before);
  });

  it('falls back to the last available history step without rewriting a missing saved selection', () => {
    const feature = pattern('mirror', 'historical');
    if (feature.source.mode !== 'bodies') throw new Error('fixture');
    feature.source.bodies = [{ bodyId: 'missing-body', sourceFeatureId: 'missing-step' }];
    const before = structuredClone(feature), html = render(feature);
    expect(html).toContain('value="cut-a" selected=""');
    expect(html).toContain('Cuerpo no disponible — Paso no disponible · no disponible');
    expect(html).toContain('Quitar semilla 1: Cuerpo no disponible — Paso no disponible');
    expect(feature).toEqual(before);
  });

  it('bounds historical options for an 8192-slot ledger and keeps selected retired or omitted outputs visible for repair', () => {
    const owner = pattern('linearPattern');
    if (owner.type !== 'linearPattern' || owner.bodyPattern?.mode !== 'new') throw new Error('fixture');
    owner.id = 'large-history'; owner.name = 'Patrón de prueba'; owner.skipped = [[2, 0]];
    const originalSlots = owner.bodyPattern.instances;
    const retired = Array.from({ length: MAX_BODY_PATTERN_SLOTS - originalSlots.length }, (_, index) => ({
      ...originalSlots[0], bodyId: `retired-private-identity-${index}`, retired: true,
    }));
    owner.bodyPattern = { mode: 'new', instances: [...originalSlots, ...retired] };
    const selected: BodyReference[] = [
      { bodyId: retired[0].bodyId, sourceFeatureId: owner.id },
      { bodyId: originalSlots[1].bodyId, sourceFeatureId: owner.id },
      a,
    ];
    const features = [...sources, owner], history = bodyPatternHistoryChoices(features, selected);
    const step = history.steps.find(candidate => candidate.id === owner.id)!;
    expect(owner.bodyPattern.instances).toHaveLength(MAX_BODY_PATTERN_SLOTS);
    expect(step.choices).toHaveLength(4); // Two materialized outputs and two selected unavailable records.
    expect(step.choices.filter(choice => !choice.unavailable)).toHaveLength(2);
    expect(step.choices.filter(choice => choice.unavailable).map(choice => choice.ref)).toEqual([selected[1], selected[0]]);
    expect(history.selected.map(choice => choice.ref)).toEqual(selected);
    expect(history.selected.map(choice => choice.unavailable)).toEqual([true, true, false]);
    expect(history.steps.reduce((sum, candidate) => sum + candidate.choices.length, 0)).toBe(7);
    const pending = pattern('mirror', 'historical');
    pending.source = { mode: 'bodies', scope: 'historical', bodies: selected };
    const before = structuredClone(pending);
    const html = renderToStaticMarkup(<BodyPatternPanel feature={pending} features={features} onChange={noop}
      editor={{ bodies: [{ ref: currentA, name: 'A actual' }, { ref: b, name: 'B actual' }], existing: false,
        picking: false, loading: false, onSelection: noop, onPicking: noop }} />);
    expect(html.match(/type="checkbox"/g)).toHaveLength(4);
    expect(html.match(/<li>/g)).toHaveLength(3);
    const stepMarkup = html.match(/<select aria-label="Paso del historial para cuerpos semilla"[\s\S]*?<\/select>/)?.[0];
    expect(stepMarkup?.match(/<option /g)).toHaveLength(4);
    expect(stepMarkup).toContain('value="large-history" selected=""');
    expect(html).toContain('Quitar semilla 3: Semilla A — Semilla A');
    expect(html).toContain(' · no disponible');
    expect(html).not.toContain('retired-private-identity');
    expect(pending).toEqual(before);
  });

  it('shows an unavailable current seed for explicit removal', () => {
    const feature = pattern();
    if (feature.source.mode !== 'bodies') throw new Error('fixture');
    feature.source.bodies = [a, b];
    const html = render(feature);
    expect(html).toContain('Quitar cuerpo semilla no disponible');
    expect(html).toContain('Cuerpo no disponible · vuelve a seleccionarlo');
  });

  it('keeps a stale target visible and displays the current target choices separately from seeds', () => {
    const feature = pattern();
    feature.bodyPattern = { mode: 'merge', target: a };
    const html = render(feature, true, undefined, 'Recupera el destino');
    expect(html).toContain('aria-label="Cuerpo destino de las copias"');
    expect(html).toContain('Destino no disponible · vuelve a seleccionarlo');
    expect(html).toContain('aria-label="Resultado de las copias" disabled=""');
    expect(html).toContain('role="alert">Recupera el destino');
  });

  it('preserves the legacy selector and whole-body mirror option when explicit fields are absent', () => {
    const legacy: RepetitionFeature = { id: 'legacy', name: 'Simetría', suppressed: false, type: 'mirror', baseFeatureId: 'cut-a',
      source: { mode: 'body', sourceFeatureId: 'create-a' }, support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false };
    const html = render(legacy);
    expect(html).toContain('aria-label="Tipo de elementos a repetir"');
    expect(html).toContain('Fusionar cuerpos reflejados');
    expect(html).not.toContain('aria-label="Cuerpos semilla"');
  });
});
