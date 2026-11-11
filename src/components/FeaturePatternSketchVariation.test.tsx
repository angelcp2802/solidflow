import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { Feature, LinearPatternFeature } from '../cad/kernel.types';
import { validateDocument } from '../model/document';
import { withFeaturePatternInstanceDepth, withFeaturePatternSketchRadius } from '../model/featurePatternCommands';
import PatternPanel from './PatternPanel';

const require = createRequire(import.meta.url);
const sources = validateDocument(require('../../scripts/desktop-part-instance-radius-original.cjs')()).features;
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
it('shows active instances and the driving radius, preserving the nominal source and ordinary blue editor', () => {
  const operation = feature(), before = structuredClone(operation), html = render(operation);
  expect(html).toContain('aria-label="Instancia para variar su radio"');
  expect(html).toContain('<option value="1,0" selected="">Instancia 2, 1</option>');
  expect(html).toMatch(/aria-label="Radio del croquis de la instancia"[^>]*value="1"/);
  expect(html).not.toContain('Asignar profundidad');
  expect(operation).toEqual(before);
});
it('locks source, calculation method and automatic scope until radius assignments are cleared', () => {
  const operation = withFeaturePatternSketchRadius(feature(), sources, '1,0', .5) as LinearPatternFeature, html = render(operation);
  expect(html).toContain('<option value="geometry" disabled="">Copiar geometría</option>');
  expect(html).toContain('<option value="all" disabled="">Todos los cuerpos actuales</option>');
  expect(html).toContain('<option value="auto" disabled="">Detectar cuerpos automáticamente</option>');
  expect(html).toMatch(/aria-label="Repetir Corte semilla"[^>]*disabled=""/);
  expect(html).toContain('Quitar radio de Instancia 2, 1');
});
it('keeps obsolete assignments repairable and blocks editing while the preview is loading', () => {
  const operation = withFeaturePatternSketchRadius(feature(), sources, '1,0', .5) as LinearPatternFeature;
  operation.skipped = [[1, 0]];
  expect(render(operation)).toContain('Instancia 2, 1 · 0.5 mm · no disponible');
  expect(render(operation, sources, true)).toMatch(/disabled="" aria-label="Quitar radio de Instancia 2, 1"/);
});
it('shows only the repairable variation family when an earlier edit changes primitive/entity eligibility', () => {
  const radius = withFeaturePatternSketchRadius(feature(), sources, '1,0', .5) as LinearPatternFeature;
  const radiusStale = render(radius, primitive);
  expect(radiusStale).toContain('Quitar radio de Instancia 2, 1');
  expect(radiusStale).not.toContain('Asignar profundidad');
  expect(radiusStale).not.toContain('Asignar radio');
  const depth = withFeaturePatternInstanceDepth(feature(), '1,0', -2) as LinearPatternFeature;
  const depthStale = render(depth, sources);
  expect(depthStale).toContain('Quitar profundidad de Instancia 2, 1');
  expect(depthStale).not.toContain('Asignar radio');
  expect(depthStale).not.toContain('Asignar profundidad');
});
