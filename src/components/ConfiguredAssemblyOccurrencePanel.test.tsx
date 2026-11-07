import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { createAssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { assemblyDefinitionKey } from '../model/assemblyDocument'
import { applyAssemblyConfiguredOccurrenceEdit } from '../model/assemblyConfiguredOccurrenceEditing'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import ConfiguredAssemblyOccurrencePanel, { initialConfiguredOccurrenceFields, configuredOccurrenceImportIntent, configuredOccurrenceReuseIntent, configuredOccurrenceUiIntent } from './ConfiguredAssemblyOccurrencePanel'

// Original shared configuration fixture, declaration/SSR checks only.
function fixture() { const f = assemblyConfigurationCoreFixture(); return createAssemblyConfiguredDocument(f.document, f.catalog, 'mixed') }
it('preserves every imported v3 field and selected state rather than unwrapping its source', () => {
  const document = fixture(), incoming = fixture(), fields = initialConfiguredOccurrenceFields()
  incoming.rootConfiguration = 'both-compact'; fields.position = ['5', '8', '-2']; fields.fixed = true
  const intent = configuredOccurrenceImportIntent(document, ['right'], fields, JSON.stringify(incoming))
  expect(intent).toMatchObject({ scopePath: ['right'], definition: { id: 'configuration-S', revision: 's-r1' }, configuration: 'compact', change: { kind: 'insert', source: incoming, partRevision: null, pose: { translation: [5, 8, -2], rotation: [0, 0, 0, 1] }, fixed: true } })
  if (intent.change.kind !== 'insert' || intent.change.source.version !== 3) throw Error('Full configured input required')
  expect(intent.change.source.catalog).toEqual(incoming.catalog)
  incoming.catalog[0].configurations[0].name = 'Changed caller data'
  expect(intent.change.source.catalog[0].configurations[0].name).not.toBe('Changed caller data')
})
it('keeps explicit v1 revision and v2 assembly identity at the import boundary', () => {
  const document = fixture(), fields = initialConfiguredOccurrenceFields(), part = document.source.definitions.find(d => d.kind === 'part')!
  if (part.kind !== 'part') throw Error('Original part required')
  fields.partRevision = 'authored-r2'
  expect(configuredOccurrenceImportIntent(document, [], fields, JSON.stringify(part.document)).change).toMatchObject({ kind: 'insert', source: part.document, partRevision: 'authored-r2' })
  expect(configuredOccurrenceImportIntent(document, [], fields, JSON.stringify(document.source)).change).toMatchObject({ kind: 'insert', source: document.source, partRevision: null })
  fields.position[0] = ''; expect(() => configuredOccurrenceImportIntent(document, [], fields, JSON.stringify(part.document))).toThrow(/coordenadas/)
})
it('reuses only registered identities and scopes fixed edits to the selected effective state', () => {
  const document = fixture(), fields = initialConfiguredOccurrenceFields()
  fields.definition = assemblyDefinitionKey({ id: 'configuration-A', revision: 'r1' }); fields.position[1] = '8'
  expect(configuredOccurrenceReuseIntent(document, ['right'], fields)).toMatchObject({ configuration: 'compact', change: { kind: 'reuse', definition: { id: 'configuration-A', revision: 'r1' }, configuration: null, pose: { translation: [0, 8, 0] } } })
  fields.definition = 'stale'; expect(() => configuredOccurrenceReuseIntent(document, ['right'], fields)).toThrow(/registrada/)
  const fixed = configuredOccurrenceUiIntent(document, ['right'], { kind: 'set-fixed', occurrenceId: 'b', fixed: true })
  const next = applyAssemblyConfiguredOccurrenceEdit(document, fixed)
  const evaluation = evaluateAssemblyConfiguration(next.source, next.catalog, next.rootConfiguration)
  expect(evaluation.scopes.find(s => s.path.join('/') === 'right')!.occurrences.find(o => o.id === 'b')!.fixed).toBe(true)
  expect(evaluation.scopes.find(s => s.path.join('/') === 'left')!.occurrences.find(o => o.id === 'b')!.fixed).toBe(false)
  expect(next.source).toEqual(document.source)
  expect(() => configuredOccurrenceUiIntent(document, ['missing'], fixed.change)).toThrow(/ámbito/)
})
it('renders explicit state/inheritance, placement and private preview controls while blocked', () => {
  const onImport = vi.fn(), onReuse = vi.fn(), document = fixture(), fields = initialConfiguredOccurrenceFields()
  fields.definition = assemblyDefinitionKey({ id: 'configuration-S', revision: 's-r1' })
  const html = renderToStaticMarkup(<ConfiguredAssemblyOccurrencePanel document={document} scopePath={['right']} configuration="compact" fields={fields} disabled onChange={() => {}} onImport={onImport} onReuse={onReuse} />)
  for (const label of ['Importar componente configurado', 'Vista previa de inserción configurada', 'Inserción X en mm', 'Inserción Y en mm', 'Inserción Z en mm', 'suprimida en Base', 'respecto al padre', 'catálogo completo']) expect(html).toContain(label)
  expect(html.match(/<button disabled=""/g)).toHaveLength(2)
  expect(html).toContain('Compact'); expect(html).toContain('Single A')
  expect(onImport).not.toHaveBeenCalled(); expect(onReuse).not.toHaveBeenCalled()
})
