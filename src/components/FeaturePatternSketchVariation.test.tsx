import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { Feature, LinearPatternFeature } from '../cad/kernel.types';
import { validateDocument } from '../model/document';
import { withFeaturePatternInstanceDepth, withFeaturePatternSketchDimension, withFeaturePatternSketchRadius } from '../model/featurePatternCommands';
import PatternPanel from './PatternPanel';

const require = createRequire(import.meta.url);
const sources = validateDocument(require('../../scripts/desktop-part-instance-radius-original.cjs')()).features;
const rectangle = validateDocument(require('../../scripts/desktop-part-instance-rectangle-original.cjs')()).features;
const primitive = validateDocument(require('../../scripts/desktop-part-instance-depth-original.cjs')()).features;
const owner = { bodyId: 'plate-body', sourceFeatureId: 'pocket' };
const feature = (): LinearPatternFeature => ({ id: 'original-radius-ui', name: 'Original radius panel', type: 'linearPattern', suppressed: false,
  baseFeatureId: 'pocket', source: { mode: 'features', geometryPattern: false, featureIds: ['pocket'] },
  first: { direction: [1, 0, 0], count: 3, spacing: 5 }, second: null, secondSeedOnly: false, skipped: [],
  featurePattern: { mode: 'regenerate', scope: 'selected', targets: [owner], bindings: [{ source: owner, targetBodyIds: [owner.bodyId] }], referencePolicies: [], variation: { kind: 'none' } } });
const unexpected = () => { throw Error('Rendering must not change the document or issue geometry'); };
function render(operation: LinearPatternFeature, features: readonly Feature[] = sources, loading = false) {
  return renderToStaticMarkup(<PatternPanel feature={operation} features={[...features]} planes={[]} onChange={unexpected}
    autoScope={{ available: true, pending: false, onCapture: unexpected }} onPickFace={unexpected} pickingFace={false} canPickFace={false}
    bodyEditor={{ bodies: [{ ref: owner, name: 'Placa' }], existing: true, loading, picking: false, onSelection: unexpected, onPicking: unexpected }} />);
}
it('offers driving radius or depth for an unvaried solved circular cut', () => {
  const operation = feature(), before = structuredClone(operation), html = render(operation);
  expect(html).toContain('aria-label="Instancia para variar su radio"');
  expect(html).toContain('<option value="1,0" selected="">Instancia 2, 1</option>');
  expect(html).toMatch(/aria-label="Radio del croquis de la instancia"[^>]*value="1"/);
  expect(html).toContain('aria-label="Instancia para variar su profundidad"');
  expect(html).toContain('Asignar profundidad');
  expect(operation).toEqual(before);
});
it('locks source, calculation method and automatic scope until radius assignments are cleared', () => {
  const operation = withFeaturePatternSketchRadius(feature(), sources, '1,0', .5) as LinearPatternFeature, html = render(operation);
  expect(html).toContain('<option value="geometry" disabled="">Copiar geometría</option>');
  expect(html).toContain('<option value="all" disabled="">Todos los cuerpos actuales</option>');
  expect(html).toContain('<option value="auto" disabled="">Detectar cuerpos automáticamente</option>');
  expect(html).toMatch(/aria-label="Repetir Corte semilla"[^>]*disabled=""/);
  expect(html).toContain('Quitar radio de Instancia 2, 1');
  expect(html).not.toContain('Asignar profundidad');
});
it('keeps obsolete assignments repairable and blocks editing while the preview is loading', () => {
  const operation = withFeaturePatternSketchRadius(feature(), sources, '1,0', .5) as LinearPatternFeature;
  operation.skipped = [[1, 0]];
  expect(render(operation)).toContain('Instancia 2, 1 · 0.5 mm · no disponible');
  expect(render(operation, sources, true)).toMatch(/disabled="" aria-label="Quitar radio de Instancia 2, 1"/);
});
it('keeps stale radius assignments removable after switching to a primitive sketch', () => {
  const radius = withFeaturePatternSketchRadius(feature(), sources, '1,0', .5) as LinearPatternFeature;
  const radiusStale = render(radius, primitive);
  expect(radiusStale).toContain('Quitar cota de Instancia 2, 1 (driving-radius)');
  expect(radiusStale).not.toContain('Asignar profundidad');
  expect(radiusStale).not.toContain('Asignar radio');
});

it('keeps depth assignments editable for an entity sketch and removable after changing to Through All', () => {
  const depth = withFeaturePatternInstanceDepth(feature(), '1,0', -2) as LinearPatternFeature;
  const depthRebased = render(depth, sources);
  expect(depthRebased).toContain('Instancia 2, 1 · 2 mm</span>');
  expect(depthRebased).toContain('Asignar profundidad');
  expect(depthRebased).not.toContain('Asignar radio');

  const throughAll = structuredClone(sources);
  const seed = throughAll[3];
  if (seed.type !== 'cut') throw Error('Original cut required');
  seed.endCondition = { kind: 'throughAll', baseFeatureId: 'plate', bothDirections: false };
  const depthStale = render(depth, throughAll);
  expect(depthStale).toContain('Instancia 2, 1 · 2 mm · no disponible');
  expect(depthStale).toContain('Quitar profundidad de Instancia 2, 1');
  expect(depthStale).not.toContain('Asignar radio');
  expect(depthStale).not.toContain('Asignar profundidad');
});

it('lists both independent rectangle dimensions and preserves their rows at one address', () => {
  const width = withFeaturePatternSketchDimension(feature(), rectangle, '1,0', 'driving-width', 1);
  const both = withFeaturePatternSketchDimension(width, rectangle, '1,0', 'driving-height', 3) as LinearPatternFeature;
  const html = render(both, rectangle);
  expect(html).toContain('aria-label="Cota del croquis para variar"');
  expect(html).toContain('<option value="driving-width" selected="">Anchura</option>');
  expect(html).toContain('<option value="driving-height">Altura</option>');
  expect(html).toMatch(/aria-label="Anchura del croquis de la instancia"[^>]*value="1"/);
  expect(html).toContain('Instancia 2, 1 · Anchura · 1 mm');
  expect(html).toContain('Instancia 2, 1 · Altura · 3 mm');
  expect(html).toContain('Quitar anchura de Instancia 2, 1');
  expect(html).toContain('Quitar altura de Instancia 2, 1');
  expect(html).not.toContain('Asignar profundidad');
  expect(html).toContain('<option value="auto" disabled="">Detectar cuerpos automáticamente</option>');
  const stale = render(both, primitive);
  expect(stale).toContain('Quitar cota de Instancia 2, 1 (driving-width)');
  expect(stale).toContain('Quitar cota de Instancia 2, 1 (driving-height)');
  expect(stale).not.toContain('Asignar anchura');
});

it('disables assignment until a stale sketch using the same constraint ID is explicitly removed', () => {
  const operation = withFeaturePatternSketchDimension(feature(), rectangle, '1,0', 'driving-width', 1) as LinearPatternFeature;
  const replacement = structuredClone(rectangle);
  const seed = replacement[3];
  if (seed.type !== 'cut') throw Error('Original cut required');
  replacement[2].id = 'replacement-profile';
  seed.sketchId = 'replacement-profile';
  const html = render(operation, replacement);
  expect(html).toMatch(new RegExp('<button[^>]*disabled=""[^>]*>Asignar anchura</button>'));
  expect(html).toContain('Quitar cota de Instancia 2, 1 (driving-width)');
  expect(html).toContain('Quita la cota no disponible antes de asignarla al croquis actual.');
});
