import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { createAssemblyConfiguredDocument, serializeAssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyConfiguredDocumentHistory } from '../model/assemblyConfiguredHistory'
import { createConfiguredUiRootVariant, createConfiguredUiScopeVariant, configuredUiPose, editConfiguredUiOccurrence, configuredUiTicket, configuredUiTicketMatches, configuredUiSceneMatches, configuredUiDisplayScene } from './configuredAssemblyUi'
import type { ConfiguredAssemblyScene } from '../cad/kernel.assembly-configuration-scene'
import ConfiguredAssemblyWorkspace from './ConfiguredAssemblyWorkspace'
import { buildConfiguredAssembly } from '../cad/kernel'

vi.mock('../cad/kernel', () => ({ buildConfiguredAssembly: vi.fn(), previewConfiguredAssembly: vi.fn(), previewConfiguredAssemblyRelationEdit: vi.fn(), previewConfiguredAssemblyMechanicalEdit: vi.fn(), previewConfiguredAssemblyOccurrenceEdit: vi.fn(), applyConfiguredAssembly: vi.fn(), discardConfiguredAssembly: vi.fn() }))
function fixture() { const { document, catalog } = assemblyConfigurationCoreFixture(); return createAssemblyConfiguredDocument(document, catalog, 'mixed') }
const effective = (document: ReturnType<typeof fixture>) => evaluateAssemblyConfiguration(document.source, document.catalog, document.rootConfiguration)
const scope = (document: ReturnType<typeof fixture>, owner: string) => effective(document).scopes.find(row => row.path.join('/') === owner)!

it('renders the actual configured format and bounded controls without triggering CAD during SSR', () => {
  const document = fixture(), html = renderToStaticMarkup(<ConfiguredAssemblyWorkspace initialDocument={document} initialSaved={serializeAssemblyConfiguredDocument(document)} onOpenDocument={() => undefined} />)
  for (const text of ['Ensamblaje configurado', 'Configuración raíz', 'Crear configuración basada en Base', 'Resolver configuración', 'Aplicar configuración', 'Piezas efectivas', 'Importar componente configurado', 'Definición registrada configurada', 'Inserción X en mm', 'Inserción Y en mm', 'Inserción Z en mm', 'left / a', 'right / b']) expect(html).toContain(text)
  expect(html).not.toContain(document.source.name + ' *'); expect(html).toContain('aún no están disponibles'); expect(buildConfiguredAssembly).not.toHaveBeenCalled()
  expect(html).toContain('Nueva relación mecánica configurada'); expect(html).toContain('Nueva relación compuesta configurada'); expect(html).not.toContain('las nuevas capturas mecánicas')
  for (const tab of ['assembly', 'relations', 'evaluate']) {
    expect(html).toMatch(new RegExp('<button(?=[^>]*id="configured-command-tab-' + tab + '")(?=[^>]*role="tab")(?=[^>]*aria-controls="configured-command-panel-' + tab + '")(?=[^>]*aria-selected="' + (tab === 'assembly') + '")[^>]*>'))
    expect(html).toMatch(new RegExp('<div(?=[^>]*id="configured-command-panel-' + tab + '")(?=[^>]*role="tabpanel")(?=[^>]*aria-labelledby="configured-command-tab-' + tab + '")' + (tab === 'assembly' ? '(?![^>]* hidden=)' : '(?=[^>]* hidden="")') + '[^>]*>'))
  }
  const ribbon = html.slice(html.indexOf('aria-label="Comandos del ensamblaje configurado"'), html.indexOf('aria-label="Inspector del ensamblaje configurado"'))
  const assemblyCommands = ribbon.slice(0, ribbon.indexOf('data-configured-command-panel="relations"'))
  const relationCommands = ribbon.slice(ribbon.indexOf('data-configured-command-panel="relations"'), ribbon.indexOf('data-configured-command-panel="evaluate"'))
  const confirmationStart = ribbon.search(/<div[^>]*role="group" aria-label="Resultado"/)
  expect(confirmationStart).toBeGreaterThan(ribbon.indexOf('data-configured-command-panel="evaluate"'))
  const evaluationCommands = ribbon.slice(ribbon.indexOf('data-configured-command-panel="evaluate"'), confirmationStart)
  expect(assemblyCommands).toContain('aria-controls="configured-component-name"'); expect(assemblyCommands).toContain('aria-controls="configured-root-state"')
  expect(assemblyCommands).toContain('aria-controls="configured-relation-inspector"')
  expect(relationCommands).not.toContain('aria-controls="configured-relation-inspector"'); expect(relationCommands).toContain('aria-controls="configured-relations"')
  expect(evaluationCommands).toContain('aria-label="Lista de materiales configurada"')
  for (const commands of [assemblyCommands, relationCommands, evaluationCommands]) expect(commands).not.toContain('Aplicar configuración')
  for (const label of ['Insertar componente', 'Nueva relación', 'Lista de materiales', 'Aplicar configuración', 'Resolver configuración'])
    expect(ribbon.split('<span>' + label + '</span>')).toHaveLength(2)
  expect(html).toContain('aria-label="Mostrar árbol del ensamblaje" aria-pressed="true"')
  expect(html).toContain('role="tree" aria-label="Componentes del ensamblaje configurado"')
  expect(html).toMatch(/<button[^>]*aria-label="Propiedades del componente seleccionado"[^>]*disabled=""/)
  const propertiesTab = html.match(/<button[^>]*aria-label="Mostrar propiedades del componente"[^>]*>/)?.[0]
  expect(propertiesTab).toBeDefined(); expect(propertiesTab).not.toContain('disabled=')
  expect(html).toContain('aria-label="Seleccionar Plano XY de Raíz"')
  expect(html).toContain('aria-label="Seleccionar Eje Z de right / b"')
  expect(html.match(/data-assembly-origin-tree-key=/g)).toHaveLength(42)
})

it('starts a genuinely empty root variant from Base instead of copying the selected child configuration', () => {
  const document = fixture(), saved = serializeAssemblyConfiguredDocument(document), next = createConfiguredUiRootVariant(document, 'demo')
  expect(next.rootConfiguration).toBe('demo'); expect(scope(document, 'right').configuration).toBe('compact'); expect(scope(next, 'right').configuration).toBeNull()
  expect(scope(next, 'right').occurrences.find(row => row.id === 'b')!.pose.translation).toEqual([10, 0, 0])
  expect(next.catalog[0].configurations.at(-1)).toEqual({ id: 'demo', name: 'demo', occurrences: [], mates: [] })
  expect(serializeAssemblyConfiguredDocument(document)).toBe(saved); expect(() => createConfiguredUiRootVariant(next, 'demo')).toThrow()
})

it('updates only the actual named child state and preserves the source and unrelated variants', () => {
  const document = fixture(), before = structuredClone(document), pose = { ...identityRigidPose(), translation: [3, 2, 1] as [number, number, number] }
  const next = editConfiguredUiOccurrence(document, ['right'], 'b', { pose, visible: false })
  expect(next.source).toEqual(before.source); expect(next.catalog[0]).toEqual(before.catalog[0]); expect(next.catalog[1].configurations[1]).toEqual(before.catalog[1].configurations[1])
  expect(scope(next, 'right').occurrences.find(row => row.id === 'b')).toMatchObject({ pose, visible: false })
  expect(scope(next, 'left').occurrences.find(row => row.id === 'b')!.pose.translation).toEqual([10, 0, 0])
  pose.translation[0] = 99; expect(scope(next, 'right').occurrences.find(row => row.id === 'b')!.pose.translation).toEqual([3, 2, 1]); expect(document).toEqual(before)
})

it('propagates a named intrinsic edit to both selected uses while Base remains unchanged', () => {
  const document = fixture(); document.rootConfiguration = 'both-compact'
  const next = editConfiguredUiOccurrence(document, ['left'], 'b', { suppressed: true })
  expect(effective(next).parts.filter(row => row.path[1] === 'b').every(row => row.suppressed)).toBe(true)
  expect(next.source).toEqual(document.source); expect(scope({ ...next, rootConfiguration: null }, 'left').occurrences.find(row => row.id === 'b')!.suppressed).toBe(false)
})

it('routes an explicit Base edit to the original state and leaves named overrides intact', () => {
  const document = fixture(), next = editConfiguredUiOccurrence(document, ['left'], 'b', { pose: { translation: [7, 0, 0], rotation: [0, 0, 0, 1] } })
  expect(next.catalog).toEqual(document.catalog); expect(scope(next, 'left').occurrences.find(row => row.id === 'b')!.pose.translation).toEqual([7, 0, 0])
  expect(scope(next, 'right').occurrences.find(row => row.id === 'b')!.pose.translation).toEqual([4, 0, 0])
})

it('requires a named parent for a child selector and preserves the complete graph in history', () => {
  const document = fixture(); document.rootConfiguration = null
  expect(() => editConfiguredUiOccurrence(document, [], 'right', { configuration: 'compact' })).toThrow(/padre/)
  const named = createConfiguredUiRootVariant(document, 'demo'), history = new AssemblyConfiguredDocumentHistory(named)
  const next = editConfiguredUiOccurrence(named, [], 'right', { configuration: 'single' })
  history.commitDocument(next); expect(scope(next, 'right').configuration).toBe('single'); expect(effective(next).parts.filter(row => !row.suppressed)).toHaveLength(3)
  expect(history.undo()).toEqual(named); expect(history.redo()).toEqual(next)
  expect(() => editConfiguredUiOccurrence(named, [], 'right', { configuration: 'missing' })).toThrow()
  expect(() => editConfiguredUiOccurrence(named, ['missing'], 'b', { visible: false })).toThrow()
})

it('rejects an invalid rigid orientation without altering any cached state', () => {
  const document = fixture(), before = serializeAssemblyConfiguredDocument(document)
  expect(() => editConfiguredUiOccurrence(document, ['right'], 'b', { pose: { translation: [0, 0, 0], rotation: [0, 0, 0, 0] } })).toThrow()
  expect(serializeAssemblyConfiguredDocument(document)).toBe(before)
})

it('creates a child configuration from Base and attaches only the selected use in its active named parent', () => {
  const document = fixture(), before = structuredClone(document)
  const next = createConfiguredUiScopeVariant(document, ['right'], 'Original child display name', 'child-authored')
  expect(next.rootConfiguration).toBe('mixed'); expect(scope(next, 'right').configuration).toBe('child-authored'); expect(scope(next, 'left').configuration).toBeNull()
  expect(scope(next, 'right').occurrences.find(row => row.id === 'b')!.pose.translation).toEqual([10, 0, 0])
  expect(next.catalog[1].configurations.at(-1)).toEqual({ id: 'child-authored', name: 'Original child display name', occurrences: [], mates: [] })
  expect(next.catalog[1].configurations.slice(0, 2)).toEqual(before.catalog[1].configurations)
  expect(next.catalog[0].configurations.slice(1)).toEqual(before.catalog[0].configurations.slice(1)); expect(next.source).toEqual(before.source); expect(document).toEqual(before)
  const changed = editConfiguredUiOccurrence(next, ['right'], 'b', { pose: { translation: [3, 0, 0], rotation: [0, 0, 0, 1] } })
  expect(scope(changed, 'right').occurrences.find(row => row.id === 'b')!.pose.translation).toEqual([3, 0, 0])
  expect(scope(changed, 'left').occurrences.find(row => row.id === 'b')!.pose.translation).toEqual([10, 0, 0])
})

it('can author the first child catalog in a converted assembly without any prebuilt named child fixture', () => {
  const { document } = assemblyConfigurationCoreFixture(), base = createAssemblyConfiguredDocument(document)
  const parent = createConfiguredUiRootVariant(base, 'parent-authored'), next = createConfiguredUiScopeVariant(parent, ['right'], 'child-authored')
  expect(next.catalog).toHaveLength(2); expect(scope(next, 'right').configuration).toBe('child-authored'); expect(scope(next, 'left').configuration).toBeNull()
  expect(next.catalog[0].configurations[0].occurrences).toEqual([{ occurrenceId: 'right', configuration: 'child-authored' }])
  expect(parent.catalog).toHaveLength(1); expect(base.catalog).toEqual([])
})

it('refuses child creation atomically when its parent is Base or the exact scope/ID is unavailable', () => {
  const document = fixture(), before = serializeAssemblyConfiguredDocument(document)
  expect(() => createConfiguredUiScopeVariant(document, ['missing'], 'child')).toThrow(/ámbito/)
  expect(() => createConfiguredUiScopeVariant(document, ['right'], 'duplicate', 'compact')).toThrow(/existe/)
  const base = { ...document, rootConfiguration: null }, baseline = serializeAssemblyConfiguredDocument(base)
  expect(() => createConfiguredUiScopeVariant(base, ['right'], 'child')).toThrow(/padre primero/)
  expect(serializeAssemblyConfiguredDocument(base)).toBe(baseline); expect(serializeAssemblyConfiguredDocument(document)).toBe(before)
})

it('keeps the existing 64 variants per exact owner bound when adding a configuration', () => {
  const document = fixture(), row = document.catalog[1]
  for (let n = row.configurations.length; n < 64; n++) row.configurations.push({ id: 'original-' + n, name: 'Original ' + n, occurrences: [], mates: [] })
  const before = serializeAssemblyConfiguredDocument(document)
  expect(() => createConfiguredUiScopeVariant(document, ['right'], 'too-many')).toThrow()
  expect(serializeAssemblyConfiguredDocument(document)).toBe(before); expect(row.configurations).toHaveLength(64)
})

it('changes translation without exposing or replacing the existing orientation when the incremental angle is zero', () => {
  const original = { translation: [7, 8, 9] as [number, number, number], rotation: [.5, -.5, .5, .5] as [number, number, number, number] }
  const result = configuredUiPose(original, [1, 2, 3], 'Z', 0)
  expect(result).toEqual({ translation: [1, 2, 3], rotation: original.rotation }); expect(result.rotation).not.toBe(original.rotation)
  expect(original.translation).toEqual([7, 8, 9])
})

it('composes a genuine local-axis increment after the existing proper orientation rather than replacing it', () => {
  // Rx90 * Ry90 = (1/2,1/2,1/2,1/2), distinct from reversed world-axis order.
  const original = { translation: [7, 8, 9] as [number, number, number], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] as [number, number, number, number] }
  const result = configuredUiPose(original, [1, 2, 3], 'Y', 90)
  result.rotation.forEach(value => expect(Math.abs(value - .5)).toBeLessThan(1e-14)); expect(result.translation).toEqual([1, 2, 3])
  expect(() => configuredUiPose(original, [0, 0, 0], 'Y', Infinity)).toThrow()
})

it.each(['document', 'catalog', 'rootConfiguration', 'generation', 'scope', 'path', 'occurrence'] as const)('rejects stale rendered or async tickets after a %s change', field => {
  const document = fixture(), old = configuredUiTicket(document, 10, '[]', 'original.solidflow', 'a'), changed = structuredClone(document)
  if (field === 'document') changed.source.name += ' changed'
  if (field === 'catalog') changed.catalog[1].configurations[0].name += ' changed'
  if (field === 'rootConfiguration') changed.rootConfiguration = null
  expect(configuredUiTicketMatches(old, configuredUiTicket(changed, field === 'generation' ? 12 : 10, field === 'scope' ? '["right"]' : '[]', field === 'path' ? 'other.solidflow' : 'original.solidflow', field === 'occurrence' ? 'b' : 'a'))).toBe(false)
})

it('rejects a previous rendered state even after its selector returns to the same exact source data', () => {
  const document = fixture(), rendered = configuredUiTicket(document, 40, '["right"]', 'saved.solidflow', 'b')
  expect(configuredUiTicketMatches(rendered, configuredUiTicket(document, 42, '["right"]', 'saved.solidflow', 'b'))).toBe(false)
  expect(configuredUiTicketMatches(rendered, configuredUiTicket(document, 40, '["right"]', 'saved.solidflow', 'a'))).toBe(false)
  expect(configuredUiTicketMatches(rendered, configuredUiTicket(structuredClone(document), 40, '["right"]', 'saved.solidflow', 'b'))).toBe(true)
})

it('binds scene display to complete normalized source/catalog/selector/generation and returns only a detached viewport copy', () => {
  const document = fixture(), scene: ConfiguredAssemblyScene = { kind: 'configured-assembly-scene', context: { generation: 7, root: { id: document.source.id, revision: document.source.revision }, rootConfiguration: document.rootConfiguration,
    sourceSignature: JSON.stringify(document.source), catalogSignature: JSON.stringify(document.catalog) }, scene: { kind: 'assembly-scene', sceneId: 'unattested-display-only', bodies: [], volume: 0, area: 0, solidCount: 0, prototypeCount: 0, bounds: null, visibleBounds: null, warnings: [] }, referenceDiagnostics: [] }
  // This pure display DTO has no native-proof or Apply role.
  expect(configuredUiSceneMatches(scene, document, 7)).toBe(true)
  expect(configuredUiSceneMatches(scene, document, 8)).toBe(false)
  for (const edit of [() => { document.source.name += ' changed' }, () => { document.catalog[1].configurations[0].name += ' changed' }, () => { document.rootConfiguration = null }]) {
    edit(); expect(configuredUiSceneMatches(scene, document, 7)).toBe(false)
  }
  const display = configuredUiDisplayScene(scene); display.warnings.push('changed')
  expect(scene.scene.warnings).toEqual([]); expect(display).not.toBe(scene.scene)
})

it('exposes authoring shortcuts with mounted inspector targets and preserves separate file/view navigation', () => {
  const document = fixture(), html = renderToStaticMarkup(<ConfiguredAssemblyWorkspace initialDocument={document} onOpenDocument={() => undefined} />)
  for (const label of ['Comandos del ensamblaje configurado', 'Inspector del ensamblaje configurado', 'Archivo del ensamblaje configurado', 'Vistas del ensamblaje configurado']) expect(html).toContain('aria-label="' + label + '"')
  for (const id of ['configured-component-name', 'configured-component-definition', 'configured-relation-inspector', 'configured-relations', 'configured-root-state']) {
    expect(html).toContain('aria-controls="' + id + '"'); expect(html).toContain('id="' + id + '"')
  }
  const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []
  for (const label of ['Insertar componente', 'Reutilizar componente', 'Nueva relación']) {
    const button = buttons.find(value => value.includes('<span>' + label + '</span>'))
    expect(button).toMatch(/<button[^>]*disabled=""/)
  }
  for (const id of ['configured-component-heading', 'configured-reuse-heading', 'configured-root-heading']) {
    expect(html).toContain(`data-inspector-anchor="${id}"`)
    expect(html).toContain(`id="${id}" tabindex="-1"`)
  }
  expect(html).toContain('Importar componente configurado'); expect(html).toContain('Nueva relación configurada')
  expect(buildConfiguredAssembly).not.toHaveBeenCalled()
})
