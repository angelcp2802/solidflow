import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { LinearPatternFeature } from '../cad/kernel.types';
import { validateDocument } from '../model/document';
import { withFeaturePatternInstanceDepth } from '../model/featurePatternCommands';
import PatternPanel from './PatternPanel';

const require = createRequire(import.meta.url);
const sources = validateDocument(require('../../scripts/desktop-part-instance-depth-original.cjs')()).features;
const owner = { bodyId: 'plate-body', sourceFeatureId: 'pocket' };
const feature = (): LinearPatternFeature => ({
  id: 'original-ui-depth', type: 'linearPattern', name: 'Original depth panel', suppressed: false, baseFeatureId: 'pocket',
  source: { mode: 'features', geometryPattern: false, featureIds: ['pocket'] },
  first: { direction: [1, 0, 0], count: 4, spacing: 5 }, second: null, secondSeedOnly: false, skipped: [],
  featurePattern: { mode: 'regenerate', scope: 'selected', targets: [owner], bindings: [{ source: owner, targetBodyIds: [owner.bodyId] }],
    referencePolicies: [], variation: { kind: 'none' } },
});
const unexpected = () => { throw Error('Rendering must not change the document or issue geometry'); };
function render(operation: LinearPatternFeature, loading = false) {
  return renderToStaticMarkup(<PatternPanel feature={operation} features={sources} planes={[]} onChange={unexpected}
    autoScope={{ available: true, pending: false, onCapture: unexpected }}
    onPickFace={unexpected} pickingFace={false} canPickFace={false} bodyEditor={{ bodies: [{ ref: owner, name: 'Placa actual' }],
      existing: true, loading, picking: false, onSelection: unexpected, onPicking: unexpected }} />);
}

it('offers active copies and positive magnitudes without changing the negative source operation', () => {
  const operation = feature(), before = structuredClone(operation), html = render(operation);
  expect(html).toContain('aria-label="Instancia para variar su profundidad"');
  expect(html).toContain('<option value="1,0" selected="">Instancia 2, 1</option>');
  expect(html).toContain('<option value="3,0">Instancia 4, 1</option>');
  expect(html).toMatch(/aria-label="Profundidad de la instancia"[^>]*value="1"/);
  expect(operation).toEqual(before);
  expect(sources.at(-1)).toMatchObject({ depth: -1 });
});

it('keeps the method, scope and seed fixed until explicit assignments are cleared', () => {
  const operation = withFeaturePatternInstanceDepth(feature(), '1,0', -2) as LinearPatternFeature, html = render(operation);
  expect(html).toContain('<option value="geometry" disabled="">Copiar geometría</option>');
  expect(html).toContain('<option value="all" disabled="">Todos los cuerpos actuales</option>');
  expect(html).toContain('<option value="auto" disabled="">Detectar cuerpos automáticamente</option>');
  expect(html).toMatch(/aria-label="Repetir Corte semilla"[^>]*disabled=""/);
  expect(html).toContain('Quitar profundidad de Instancia 2, 1');
  expect(html).toMatch(/aria-label="Profundidad de la instancia"[^>]*value="2"/);
});

it('keeps an unavailable address removable and blocks every action while a preview is loading', () => {
  const operation = withFeaturePatternInstanceDepth(feature(), '1,0', -2) as LinearPatternFeature;
  operation.skipped = [[1, 0]];
  const html = render(operation), loading = render(operation, true);
  expect(html).toContain('Instancia 2, 1 · 2 mm · no disponible');
  expect(html).toContain('aria-label="Quitar profundidad de Instancia 2, 1"');
  expect(loading).toMatch(/disabled="" aria-label="Quitar profundidad de Instancia 2, 1"/);
});
