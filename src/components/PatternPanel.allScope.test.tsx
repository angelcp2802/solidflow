import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BodyReference, Feature, RepetitionFeature } from '../cad/kernel.types';
import { withFeaturePatternScope } from '../model/featurePatternCommands';
import PatternPanel from './PatternPanel';
import { bodyPatternHistoryChoices } from './BodyPatternPanel';

// Original symbolic UI fixtures. SSR proves presentation and render purity;
// no events, native materialization or interaction are exercised here.
const a = { bodyId: 'all-ui-a', sourceFeatureId: 'all-ui-create' };
const seed = { bodyId: a.bodyId, sourceFeatureId: 'all-ui-cut' };
const kinds = ['linearPattern', 'circularPattern', 'mirror'] as const;
const sources: Feature[] = [
  { id: a.sourceFeatureId, type: 'extrude', name: 'Base original', suppressed: false, sketchId: 'profile-a', depth: 4, symmetric: false,
    bodyOperation: { mode: 'new', bodyId: a.bodyId } },
  { id: seed.sourceFeatureId, type: 'cut', name: 'Corte histórico exacto', suppressed: false, sketchId: 'profile-cut', depth: 1, symmetric: false, bodyScope: [a] },
];
function pattern(kind: RepetitionFeature['type']): RepetitionFeature {
  const common = { id: 'all-ui-pattern', name: 'Alcance dinámico original', suppressed: false, baseFeatureId: seed.sourceFeatureId,
    source: { mode: 'features' as const, geometryPattern: false, featureIds: [seed.sourceFeatureId] },
    featurePattern: { mode: 'regenerate' as const, scope: 'all' as const, reevaluateAt: 'patternInput' as const,
      bindings: [{ source: { ...seed }, targetBodyIds: 'scope' as const }], referencePolicies: [] as [], variation: { kind: 'none' as const } } };
  return kind === 'linearPattern' ? { ...common, type: kind, first: { count: 2, direction: [1, 0, 0], spacing: 20 }, second: null, secondSeedOnly: false, skipped: [] }
    : kind === 'circularPattern' ? { ...common, type: kind, axis: { origin: [15, 0, 0], direction: [0, 0, 1] }, count: 2, angle: 180, equalSpacing: false, reversed: false, skipped: [] }
      : { ...common, type: kind, support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false };
}
const unexpectedEdit = () => { throw new Error('SSR must not update scope, refs or derived targets'); };
function render(feature: RepetitionFeature, bodies: { ref: BodyReference; name: string }[] = [{ ref: seed, name: 'Cuerpo actual' }], loading = false): string {
  return renderToStaticMarkup(<PatternPanel feature={feature} features={sources} planes={[]} onChange={unexpectedEdit}
    onPickFace={unexpectedEdit} pickingFace={false} canPickFace={false} onSourceKindChange={unexpectedEdit}
    bodyEditor={{ bodies, existing: true, loading, picking: false, onSelection: unexpectedEdit, onPicking: unexpectedEdit }} />);
}

describe('rendered dynamic ALL intent', () => {
  it.each(kinds)('presents %s ALL as dynamic intent and keeps exact historical source selection separate', kind => {
    const feature = pattern(kind), before = structuredClone(feature), html = render(feature);
    expect(html).toContain('aria-label="Alcance de los cuerpos de la repetición"');
    expect(html).toContain('<option value="all" selected="">Todos los cuerpos actuales</option>');
    expect(html).toContain('Catálogo actual para el alcance todos los cuerpos');
    expect(html).toContain('no se guarda como una lista fija');
    expect(html).toContain('Repetir geometría de Base original — Corte histórico exacto');
    expect(html).toContain('La vista previa comprobará qué estados del historial están disponibles.');
    expect(html).not.toContain('Aplicar repetición a Cuerpo actual');
    expect(html).not.toContain('Seleccionar destinos en la vista');
    expect(html).not.toContain('Destinos de esta geometría');
    expect(html).not.toContain('value="auto"');
    expect(html).toContain('salientes con todos los cuerpos siguen pendientes');
    expect(feature).toEqual(before);
  });

  it('requires explicit selected scope before changing to geometry copying', () => {
    const feature = pattern('linearPattern'), html = render(feature);
    expect(html).toContain('<option value="geometry" disabled="">Copiar geometría</option>');
    const selected = withFeaturePatternScope(feature, 'selected'), selectedHtml = render(selected);
    expect(selectedHtml).toContain('<option value="geometry">Copiar geometría</option>');
    expect(selectedHtml).toContain('Aplicar repetición a Cuerpo actual');
    expect(selected.featurePattern).toMatchObject({ targets: [], bindings: [{ source: seed, targetBodyIds: [] }] });
  });

  it('bounds the visible current ALL catalog at 64 names without generating 256 target checkboxes', () => {
    const bodies = Array.from({ length: 256 }, (_, index) => ({ ref: { bodyId: `all-visible-${index}`, sourceFeatureId: a.sourceFeatureId }, name: `Destino actual ${index}` }));
    const feature = pattern('mirror'), before = structuredClone(feature), html = render(feature, bodies);
    const list = html.match(/<ul aria-label="Catálogo actual para el alcance todos los cuerpos">([\s\S]*?)<\/ul>/)?.[1];
    expect(list?.match(/<li>/g)).toHaveLength(64);
    expect(html).toContain('1 / 4');
    expect(html).not.toContain('Destino actual 64');
    expect(html).not.toContain('Aplicar repetición a');
    expect(feature).toEqual(before);
  });

  it('locks dynamic scope and method while native source state is loading without modifying the declaration', () => {
    const feature = pattern('circularPattern'), before = structuredClone(feature), html = render(feature, [], true);
    expect(html).toContain('aria-label="Alcance de los cuerpos de la repetición" disabled=""');
    expect(html).toContain('aria-label="Método de repetición de operaciones" disabled=""');
    expect(html).toContain('aria-label="Operación para seleccionar su geometría" disabled=""');
    expect(feature).toEqual(before);
  });

  it('does not expand retired slots into ordinary ALL history choices but retains an exact selected repair ref', () => {
    const slots: RepetitionFeature = { id: 'all-ui-slots', type: 'linearPattern', name: 'Copias originales', suppressed: false,
      baseFeatureId: seed.sourceFeatureId, source: { mode: 'bodies', scope: 'current', bodies: [seed] },
      first: { count: 2, spacing: 20, direction: [1, 0, 0] }, second: null, secondSeedOnly: false, skipped: [],
      bodyPattern: { mode: 'new', instances: Array.from({ length: 8192 }, (_, index) => ({ seedBodyId: a.bodyId,
        address: '1,0', bodyId: `all-ui-slot-${index}`, retired: index !== 8191 })) } };
    const all = { ...pattern('linearPattern'), baseFeatureId: slots.id }, selected = { bodyId: 'all-ui-slot-0', sourceFeatureId: all.id };
    const history = bodyPatternHistoryChoices([...sources, slots, all], [selected]);
    const step = history.steps.find(item => item.id === all.id)!;
    expect(step.choices).toHaveLength(3);
    expect(step.choices.filter(item => !item.unavailable).map(item => item.ref.bodyId)).toEqual([a.bodyId, 'all-ui-slot-8191']);
    expect(history.selected).toMatchObject([{ ref: selected, unavailable: true }]);
    expect(step.choices.some(item => item.ref.bodyId === 'all-ui-slot-1')).toBe(false);
  });
});
