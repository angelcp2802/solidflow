import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AssemblyWorkspace, { assemblyFileTicketIsCurrent, AssemblyComponentTree, AssemblySolveSummary, assemblyHasVisibleDragBody, assemblyMateProposal, assemblyTreeRows, canApplyAssemblyPreview, insertAssemblyComponent, insertAssemblyPart, scopedAssemblyFace, scopedAssemblyPlaneFace, scopedAssemblyWidthPick, scopedAssemblyTangentFace, scopedAssemblyCylinderSurface, scopedAssemblySphereTangentFace, scopedAssemblyEdge, type AssemblyUiPreview } from './AssemblyWorkspace'
import { assemblyTangentUiProposal } from './AssemblyTangentMatePanel'
import { assemblyCylinderTangentUiProposal } from './AssemblyCylinderTangentMatePanel'
import { assemblySphereTangentUiProposal, type AssemblySphereTangentUiFields } from './AssemblySphereTangentMatePanel'
import { assemblyLimitDistanceUiProposal } from './AssemblyLimitDistanceMatePanel'
import { assemblyLimitAngleUiProposal } from './AssemblyLimitAngleMatePanel'
import { createAssemblyExample, createEmptyAssembly } from '../examples/assembly'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import { validateDocument } from '../model/document'
import type { AssemblyScene, AssemblySceneFace, AssemblySceneEdge } from '../cad/kernel.assembly-types'
import type { AssemblyScopeSolveReport } from '../cad/kernel.assembly-solve'
import { identityRigidPose } from '../model/rigidPose'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { buildAssemblyOriginTree } from './assemblyOriginTree'
import { buildAssembly, exportAssemblyCad, inspectAssemblyInterferences, moveAssemblyComponent, moveAssemblyWorldComponent, projectAssemblyDrag, previewAssembly, reviewAssemblyPartUpdate, translateAssemblyUntilContact } from '../cad/kernel'

vi.mock('../cad/kernel', () => ({ buildAssembly: vi.fn(), exportAssemblyCad: vi.fn(), exportAssemblyStep: vi.fn(), importAssemblyStep: vi.fn(), insertAssemblyStep: vi.fn(), previewAssembly: vi.fn(), applyAssemblyPreview: vi.fn(), discardAssemblyPreview: vi.fn(), reviewAssemblyPartReplacement: vi.fn(), previewAssemblyPartReplacement: vi.fn(), discardAssemblyPartReplacement: vi.fn(), captureAssemblyRotationLock: vi.fn(), captureAssemblyComponentLock: vi.fn(), captureAssemblyGear: vi.fn(), captureAssemblyScrew: vi.fn(), captureAssemblyRackPinion: vi.fn(), reviewAssemblyPartUpdate: vi.fn(), inspectAssemblyInterferences: vi.fn(), moveAssemblyComponent: vi.fn(), moveAssemblyComponentMotion: vi.fn(), moveAssemblyWorldComponent: vi.fn(), projectAssemblyDrag: vi.fn(), translateAssemblyUntilContact: vi.fn() }))
// Original symbolic document/DTO fixtures test rendering and pure UI boundaries.
// No native engine, worker, browser event or accepted mate solve runs here.
function face(path = ['sub-a', 'pin'], kind: 'plane' | 'cylinder' = 'cylinder'): AssemblySceneFace {
  return { selection: { component: { occurrencePath: path, definition: { id: 'pin', revision: 'r1' } }, body: { bodyId: 'body', sourceFeatureId: 'final' }, face: { sourceFeatureId: 'final', key: 'face-v1|' + 'b'.repeat(64) } },
    support: kind === 'plane' ? { kind, point: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0], tolerance: 1e-7 } : { kind, point: [0, 0, 0], axis: [0, 0, 1], xDirection: [1, 0, 0], radius: 2, tolerance: 1e-7 },
    worldSupport: null, vertices: [], triangles: [] }
}
function uiPreview(): AssemblyUiPreview {
  const document = createEmptyAssembly('Original token-gating fixture'), signature = serializeAssemblyDocument(document)
  return { baseSignature: signature, candidateSignature: signature, generation: 3, reply: { kind: 'assembly-preview', status: 'ready', token: 'symbolic-untrusted-token', document,
    scene: { kind: 'assembly-scene', sceneId: 'display-only', bodies: [], bounds: null, visibleBounds: null, volume: 0, area: 0, solidCount: 0, prototypeCount: 0, warnings: [] }, scopes: [], checks: [] } }
}
function widthPickScene(faces: AssemblySceneFace[], visible = true): AssemblyScene {
  return { ...uiPreview().reply.scene, bodies: [{ component: { ...faces[0].selection.component }, body: faces[0].selection.body,
    name: 'Original display-only width pick body', visible, worldPose: identityRigidPose(), vertices: [], normals: [], triangles: [], edgeLines: [],
    faces, volume: 0, area: 0, solidCount: 0, bounds: { min: [0,0,0], max: [0,0,0] } }] }
}
function nestedTreeFixture(): AssemblyDocument {
  const document = createAssemblyExample(), child = structuredClone(document.occurrences[1]); child.id = 'child'; child.fixed = true
  document.definitions.push({ kind: 'assembly', id: 'sub', revision: 'r1', name: 'Original nested source', createdAt: document.createdAt, updatedAt: document.updatedAt, occurrences: [child], mates: [] })
  document.occurrences = [{ ...structuredClone(document.occurrences[1]), id: 'a', definition: { id: 'sub', revision: 'r1' }, visible: false, fixed: false },
    { ...structuredClone(document.occurrences[2]), id: 'b', definition: { id: 'sub', revision: 'r1' }, suppressed: true }]
  return validateAssemblyDocument(document)
}
const treeAttribute = (tag: string, name: string) => tag.match(new RegExp('\\b' + name + '="([^"]*)"'))?.[1]
  .replaceAll('&quot;', '"').replaceAll('&amp;', '&')
it('offers origin-axis rotation capture but grants no Apply or capture authority before a current preview', () => {
  const document = createAssemblyExample(), occurrence = document.occurrences[1]
  document.mates.push({ id: 'origin-spin', name: 'Original origin spin', type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: null,
    first: { kind: 'principal-axis', component: { occurrencePath: [occurrence.id], definition: { ...occurrence.definition } }, axis: 'Z' },
    second: { kind: 'principal-axis', component: null, axis: 'Z' } })
  const before = serializeAssemblyDocument(document)
  const html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} initialSaved={before} onOpenPart={() => undefined} />)
  const capture = html.match(/<button\b[^>]*aria-label="Bloquear giro Original origin spin"[^>]*>/g)
  expect(capture).toHaveLength(1)
  expect(capture![0]).toContain('disabled=""')
  expect(capture![0]).toContain('Capturar bloqueo de giro desde la vista previa verificada')
  expect(serializeAssemblyDocument(document)).toBe(before)
})
it('lists saved coincident and concentric edits without exposing an implicit rotation unlock', () => {
  const document = createAssemblyExample(), occurrence = document.occurrences[1]
  const component = { occurrencePath: [occurrence.id], definition: { ...occurrence.definition } }
  document.mates.push({ id: 'saved-plane', name: 'Original plane relation', type: 'coincident', suppressed: false, alignment: 'aligned',
    first: { kind: 'principal-plane', component, plane: 'XY' }, second: { kind: 'principal-plane', component: null, plane: 'XY' } },
  { id: 'saved-axis', name: 'Original locked axis', type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: [0, 0, 0, 1],
    first: { kind: 'principal-axis', component, axis: 'Z' }, second: { kind: 'principal-axis', component: null, axis: 'Z' } })
  const before = serializeAssemblyDocument(document)
  const html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} initialSaved={before} onOpenPart={() => undefined} />)
  for (const label of ['Editar coincidencia Original plane relation', 'Editar concentricidad Original locked axis'])
    expect(html.match(new RegExp('<button\\b[^>]*aria-label="' + label + '"[^>]*>', 'g'))).toHaveLength(1)
  expect(html).toContain('giro bloqueado')
  expect(html).not.toContain('aria-label="Desbloquear giro"')
  expect(html).not.toContain('aria-label="Vista previa de la relación editada"')
  expect(html).toMatch(/<button(?=[^>]*aria-label="Bloquear giro Original locked axis")(?=[^>]*disabled="")[^>]*>/)
  expect(serializeAssemblyDocument(document)).toBe(before)
})
it('takes Width intent from the actual visible scene entry rather than an incoming face payload', () => {
  const actual = face(['sub-a','pin'],'plane'), scene = widthPickScene([actual]), incoming = face(['sub-a','pin'],'cylinder')
  const before = JSON.stringify(scene), selected = scopedAssemblyWidthPick(scene,incoming,['sub-a'])
  expect(selected?.face).toBe(actual)
  expect(selected?.reference).toEqual({kind:'face',component:{occurrencePath:['pin'],definition:{id:'pin',revision:'r1'}},body:actual.selection.body,face:actual.selection.face,support:'plane'})
  selected!.reference.component!.occurrencePath[0] = 'changed-copy'
  expect(JSON.stringify(scene)).toBe(before); expect(incoming.support?.kind).toBe('cylinder')
})
it('rejects missing, hidden, stale, ambiguous, wrong-purpose and out-of-scope Width picks', () => {
  const actual = face(['sub-a','pin'],'plane'), scene = widthPickScene([actual]), stale = structuredClone(actual)
  stale.selection.component.definition.revision = 'old'
  for (const value of [
    scopedAssemblyWidthPick(null,actual,[]), scopedAssemblyWidthPick(scene,null,[]), scopedAssemblyWidthPick(scene,stale,[]),
    scopedAssemblyWidthPick(widthPickScene([actual],false),actual,[]), scopedAssemblyWidthPick(widthPickScene([actual,structuredClone(actual)]),actual,[]),
    scopedAssemblyWidthPick(widthPickScene([face(['sub-a','pin'],'cylinder')]),actual,[]), scopedAssemblyWidthPick(scene,actual,['sub-b']),
    scopedAssemblyWidthPick(scene,actual,['sub-a','pin']),
  ]) expect(value).toBeNull()
})
it('keeps reused Width occurrence paths separate while producing only a scoped plane declaration', () => {
  const first = face(['reuse-a','pin'],'plane'), second = face(['reuse-b','pin'],'plane'), scene = widthPickScene([first,second])
  const selected = scopedAssemblyWidthPick(scene,second,[])
  expect(selected?.reference.component!.occurrencePath).toEqual(['reuse-b','pin'])
  expect(selected?.reference.component!.definition).toEqual({id:'pin',revision:'r1'})
  expect(selected && 'token' in selected).toBe(false); expect(selected && 'widthCentered' in selected).toBe(false)
})
it('renders the real assembly controls and keeps Apply blocked before an actual worker reply', () => {
  const document = createAssemblyExample(), before = serializeAssemblyDocument(document)
  const html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} initialSaved={before} onOpenPart={() => undefined} />)
  expect(html).toContain('Componentes del ensamblaje'); expect(html).toContain('Pasador izquierdo'); expect(html).toContain('Pasador derecho')
  expect(html).toContain('Tipo de relación'); expect(html).toContain('Ámbito de las relaciones'); expect(html).toContain('Importar componente')
  for (const id of ['file', 'edit', 'view', 'insert', 'tools', 'help']) expect(html).toContain('data-assembly-menu="' + id + '"')
  expect(html).not.toContain('data-assembly-command=')
  expect(html).toContain('aria-label="Orígenes visibles del ensamblaje"')
  expect(html).toContain('Mostrar ejes'); expect(html).toContain('Mostrar planos')
  expect(html).toContain('aria-label="Orígenes visibles de"')
  expect(html).toMatch(/<button(?=[^>]*aria-label="Seleccionar orígenes")(?=[^>]*aria-pressed="false")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toContain('aria-label="Crear revisión del ensamblaje"'); expect(html).toContain('Crear revisión…')
  expect(html).not.toContain('id="assembly-root-revision-title"')
  // SSR proves the initial navigation contract only; desktop flows exercise tabs.
  for (const tab of ['assembly', 'relations', 'evaluate']) {
    expect(html).toMatch(new RegExp('<button(?=[^>]*id="standard-command-tab-' + tab + '")(?=[^>]*role="tab")(?=[^>]*aria-controls="standard-command-panel-' + tab + '")(?=[^>]*aria-selected="' + (tab === 'assembly') + '")[^>]*>'))
    expect(html).toMatch(new RegExp('<div(?=[^>]*id="standard-command-panel-' + tab + '")(?=[^>]*role="tabpanel")(?=[^>]*aria-labelledby="standard-command-tab-' + tab + '")' + (tab === 'assembly' ? '(?![^>]* hidden=)' : '(?=[^>]* hidden="")') + '[^>]*>'))
  }
  const ribbon = html.slice(html.indexOf('aria-label="Herramientas de ensamblaje"'), html.indexOf('id="assembly-tab-components"'))
  const assemblyCommands = ribbon.slice(0, ribbon.indexOf('data-assembly-command-panel="relations"'))
  const relationCommands = ribbon.slice(ribbon.indexOf('data-assembly-command-panel="relations"'), ribbon.indexOf('data-assembly-command-panel="evaluate"'))
  const confirmationStart = ribbon.search(/<div[^>]*role="group" aria-label="Confirmación"/)
  expect(confirmationStart).toBeGreaterThan(ribbon.indexOf('data-assembly-command-panel="evaluate"'))
  const evaluationCommands = ribbon.slice(ribbon.indexOf('data-assembly-command-panel="evaluate"'), confirmationStart)
  expect(assemblyCommands).toContain('Importar componente'); expect(assemblyCommands).toContain('aria-label="Mover componente"')
  expect(assemblyCommands).toContain('aria-label="Relaciones y movimiento"'); expect(assemblyCommands).toContain('aria-label="Relación de ensamblaje"')
  expect(assemblyCommands).not.toContain('aria-label="Relaciones del ámbito"')
  expect(relationCommands).toContain('aria-label="Relaciones del ámbito"'); expect(relationCommands).not.toContain('aria-label="Relación de ensamblaje"')
  expect(relationCommands).not.toContain('aria-label="Mover componente"')
  expect(evaluationCommands).toContain('aria-label="Lista de materiales"'); expect(evaluationCommands).toContain('aria-label="Exportar geometría del ensamblaje"')
  for (const commands of [assemblyCommands, relationCommands, evaluationCommands]) expect(commands).not.toContain('aria-label="Aplicar ensamblaje"')
  for (const label of ['Relación de ensamblaje', 'Relaciones del ámbito', 'Lista de materiales', 'Aplicar ensamblaje', 'Cancelar vista previa del ensamblaje'])
    expect(ribbon.split('aria-label="' + label + '"')).toHaveLength(2)
  expect(html).toMatch(/<button(?=[^>]*id="assembly-tab-components")(?=[^>]*aria-selected="true")(?=[^>]*aria-controls="assembly-panel-components")[^>]*>/)
  expect(html).toMatch(/<div(?=[^>]*id="assembly-panel-components")(?![^>]* hidden=)[^>]*>/)
  for (const panel of ['properties', 'relations', 'evaluate']) {
    expect(html).toContain('aria-controls="assembly-panel-' + panel + '"')
    expect(html).toMatch(new RegExp('<div(?=[^>]*id="assembly-panel-' + panel + '")(?=[^>]*hidden="")[^>]*>'))
  }
  expect(html).toMatch(/<button(?=[^>]*aria-label="Aplicar ensamblaje")(?=[^>]*disabled="")[^>]*>/); expect(html).toContain('Sin guardar')
  expect(html.match(/Importar componente/g)).toHaveLength(1)
  expect(html).toMatch(/<button(?=[^>]*disabled="")[^>]*>(?:(?!<\/button>)[\s\S])*Importar componente(?:<\/span>)?<\/button>/)
  expect(html).not.toContain('Importar pieza')
  expect(html).toMatch(/<button(?=[^>]*aria-label="Propiedades del componente seleccionado")(?=[^>]*disabled="")[^>]*>/)
  expect(serializeAssemblyDocument(document)).toBe(before); expect(buildAssembly).not.toHaveBeenCalled(); expect(previewAssembly).not.toHaveBeenCalled()
})
it('owns component editors in one mounted Properties pane and leaves the model tree separate', () => {
  const document = createAssemblyExample(), before = serializeAssemblyDocument(document)
  const html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} initialSaved={before} onOpenPart={() => undefined} />)
  const modelStart = html.indexOf('id="assembly-panel-components"'), propertiesStart = html.indexOf('id="assembly-panel-properties"')
  const relationsStart = html.indexOf('id="assembly-panel-relations"')
  expect(modelStart).toBeGreaterThan(-1); expect(propertiesStart).toBeGreaterThan(modelStart); expect(relationsStart).toBeGreaterThan(propertiesStart)
  const model = html.slice(modelStart, propertiesStart), properties = html.slice(propertiesStart, relationsStart)
  expect(model).toContain('aria-label="Componentes del ensamblaje"')
  expect(model).toContain('aria-label="Propiedades del componente seleccionado"')
  expect(model).toContain('aria-label="Origen del componente"')
  expect(model).not.toContain('aria-label="Edición del componente seleccionado"')
  expect(properties).toContain('aria-label="Edición del componente seleccionado"')
  expect(properties).not.toContain('role="tree"')
  expect(html.match(/aria-label="Edición del componente seleccionado"/g)).toHaveLength(1)
  expect(properties).toContain('aria-label="Volver al árbol de componentes"')
  expect(properties).toContain('Selecciona un componente en el árbol para ver sus propiedades.')
  expect(html).toMatch(/<button(?=[^>]*id="assembly-tab-properties")(?=[^>]*aria-controls="assembly-panel-properties")(?=[^>]*aria-selected="false")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<div(?=[^>]*id="assembly-panel-properties")(?=[^>]*role="tabpanel")(?=[^>]*aria-labelledby="assembly-tab-properties")(?=[^>]*hidden="")[^>]*>/)
  expect(serializeAssemblyDocument(document)).toBe(before); expect(buildAssembly).not.toHaveBeenCalled(); expect(previewAssembly).not.toHaveBeenCalled()
})
it('offers principal angular limits as a distinct family without starting work or supplying a fresh measure', () => {
  const document = createAssemblyExample(), before = serializeAssemblyDocument(document)
  const html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} initialSaved={before} onOpenPart={() => undefined} />)
  expect(html).toContain('value="limit-angle"'); expect(html).toContain('Ángulo principal con límites'); expect(html).toContain('value="angle"'); expect(html).toContain('value="limit-distance"')
  expect(html).not.toContain('aria-label="Intervalos angulares verificados"'); expect(html).toMatch(/<button(?=[^>]*aria-label="Aplicar ensamblaje")(?=[^>]*disabled="")[^>]*>/)
  expect(serializeAssemblyDocument(document)).toBe(before); expect(buildAssembly).not.toHaveBeenCalled(); expect(previewAssembly).not.toHaveBeenCalled()
})
it('offers circular directed stops independently of principal limits and read-only measurement', () => {
  const document = createAssemblyExample(), before = serializeAssemblyDocument(document)
  const html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} initialSaved={before} onOpenPart={() => undefined} />)
  expect(html).toContain('value="limit-directed-angle"'); expect(html).toContain('Ángulo dirigido con límites')
  expect(html).toContain('value="limit-angle"'); expect(html).toContain('Medir ángulo dirigido'); expect(html).not.toContain('Límites dirigidos verificados')
  expect(html).toMatch(/<button(?=[^>]*aria-label="Aplicar ensamblaje")(?=[^>]*disabled="")[^>]*>/)
  expect(serializeAssemblyDocument(document)).toBe(before); expect(previewAssembly).not.toHaveBeenCalled()
})
it.each([false, true])('renders saved directed arc and lifecycle actions without a fabricated measurement, suppressed=%s', suppressed => {
  const document = createAssemblyExample()
  document.mates.push({ id: 'original-directed-stop', name: 'Original circular stop', type: 'limit-directed-angle', coordinate: 'directed-about-axis', suppressed,
    first: { kind: 'principal-plane', component: null, plane: 'YZ' }, second: { kind: 'principal-plane', component: { occurrencePath: ['right'], definition: { id: 'example-pin', revision: 'r1' } }, plane: 'YZ' },
    guide: { kind: 'principal-plane', component: null, plane: 'XY' }, arc: { start: 330, sweep: 60 } })
  const before = serializeAssemblyDocument(document), html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} initialSaved={before} onOpenPart={() => undefined} />)
  expect(html).toContain('Ángulo dirigido con límites · inicio 330° · recorrido 60°'); expect(html).toContain('aria-label="Editar límite dirigido Original circular stop"')
  expect(html).toContain('aria-label="Eliminar Original circular stop"'); expect(html).toContain('aria-label="Activar Original circular stop"')
  expect(html).not.toContain('Límites dirigidos verificados'); expect(serializeAssemblyDocument(document)).toBe(before); expect(previewAssembly).not.toHaveBeenCalled()
})
it.each([{ minimum: 30, maximum: 120 }, { minimum: 0, maximum: 0 }, { minimum: 180, maximum: 180 }])('renders the named saved angular interval $minimum..$maximum without claiming mobility or native verification', limits => {
  const document = createAssemblyExample(), first = { kind: 'principal-plane' as const, component: null, plane: 'XY' as const }, second = { kind: 'principal-plane' as const, component: { occurrencePath: ['right'], definition: { id: 'example-pin', revision: 'r1' } }, plane: 'XY' as const }
  document.mates.push({ ...assemblyLimitAngleUiProposal(first, second, { name: 'Original angular interval', minimum: String(limits.minimum), maximum: String(limits.maximum) }), id: 'original-angle-interval' })
  const before = serializeAssemblyDocument(document), html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} onOpenPart={() => undefined} />)
  expect(html).toContain('aria-label="Editar intervalo angular Original angular interval"'); expect(html).toContain(`Ángulo principal con límites · [${limits.minimum}, ${limits.maximum}]°`)
  expect(html).not.toContain('aria-label="Intervalos angulares verificados"'); expect(serializeAssemblyDocument(document)).toBe(before); expect(previewAssembly).not.toHaveBeenCalled()
})
it('renders separate occurrence tree entries for a reused source and distinguishes fixed state', () => {
  const document = createAssemblyExample(), html = renderToStaticMarkup(<AssemblyComponentTree document={document} selectedPath={['right']} onSelect={() => undefined} />)
  expect(html.match(/role="treeitem"/g)).toHaveLength(3); expect(html).toContain('aria-selected="true"'); expect(html).toContain('Fijo respecto a su padre')
  expect(assemblyTreeRows(document).filter(row => row.definition.id === 'example-pin').map(row => row.path)).toEqual([['left'], ['right']])
})
it('retains full nested occurrence paths and inherited visibility/suppression without a world-fixed shortcut', () => {
  const rows = assemblyTreeRows(nestedTreeFixture()), a = rows.find(row => row.path.join('/') === 'a/child')!, b = rows.find(row => row.path.join('/') === 'b/child')!
  expect(a.visible).toBe(false); expect(a.occurrence.fixed).toBe(true); expect(a.parent).toEqual({ id: 'sub', revision: 'r1' }); expect(b.suppressed).toBe(true)
})
it('renders actual origin leaves under each occurrence and selects one datum without selecting its body', () => {
  const document = createAssemblyExample(), before = serializeAssemblyDocument(document)
  const originRows = buildAssemblyOriginTree(evaluateAssemblyConfiguration(document, [], null), [])
  const chosen = originRows.find(entry => entry.ownerPath.join('/') === 'right' && entry.display.reference.kind === 'principal-plane' && entry.display.reference.plane === 'XZ')!
  const onSelect = vi.fn(), onOrigin = vi.fn()
  const html = renderToStaticMarkup(<AssemblyComponentTree document={document} selectedPath={['right']} originRows={originRows}
    selectedOriginKey={chosen.treeKey} onSelect={onSelect} onOrigin={onOrigin} />)
  const rows = html.match(/<button(?=[^>]*role="treeitem")[^>]*>/g) ?? []
  const leaves = rows.filter(tag => treeAttribute(tag, 'data-assembly-origin-tree-key'))
  expect(leaves).toHaveLength(24)
  expect(rows.filter(tag => treeAttribute(tag, 'aria-selected') === 'true')).toHaveLength(1)
  const selected = leaves.find(tag => treeAttribute(tag, 'aria-selected') === 'true')!
  expect(treeAttribute(selected, 'data-assembly-origin-tree-key')).toBe(chosen.treeKey)
  expect(treeAttribute(selected, 'data-assembly-origin-tree-owner')).toBe('["right"]')
  expect(treeAttribute(selected, 'data-assembly-origin-tree-reference')).toBe(JSON.stringify(chosen.display.reference))
  expect(treeAttribute(selected, 'aria-level')).toBe('2')
  const owner = rows.find(tag => treeAttribute(tag, 'data-assembly-tree-path') === '["right"]')!
  expect(treeAttribute(owner, 'aria-expanded')).toBe('true')
  expect(treeAttribute(selected, 'data-assembly-tree-parent')).toBe(treeAttribute(owner, 'data-assembly-tree-key'))
  expect(leaves.filter(tag => treeAttribute(tag, 'data-assembly-origin-tree-owner') === '[]')).toHaveLength(6)
  expect(onSelect).not.toHaveBeenCalled(); expect(onOrigin).not.toHaveBeenCalled()
  expect(serializeAssemblyDocument(document)).toBe(before); expect(buildAssembly).not.toHaveBeenCalled()
})
it('omits hidden and suppressed origin descendants and guards datum activation separately from component browsing', () => {
  const document = nestedTreeFixture(), originRows = buildAssemblyOriginTree(evaluateAssemblyConfiguration(document, [], null), [])
  const html = renderToStaticMarkup(<AssemblyComponentTree document={document} selectedPath={[]} originRows={originRows}
    onSelect={() => undefined} onOrigin={() => undefined} originDisabled />)
  const leaves = html.match(/<button(?=[^>]*data-assembly-origin-tree-key=)[^>]*>/g) ?? []
  expect(leaves).toHaveLength(6)
  for (const tag of leaves) {
    expect(treeAttribute(tag, 'data-assembly-origin-tree-owner')).toBe('[]')
    expect(tag).toContain('aria-disabled="true"')
    expect(tag).not.toContain(' disabled=""')
  }
  const components = html.match(/<button(?=[^>]*data-assembly-tree-path=)[^>]*>/g) ?? []
  expect(components).toHaveLength(4)
  expect(components.every(tag => !tag.includes('disabled=""'))).toBe(true)
})
it('keeps reused descendants mounted under distinct closed branches without changing the complete occurrence catalog', () => {
  const document = nestedTreeFixture(), before = serializeAssemblyDocument(document), onSelect = vi.fn()
  const html = renderToStaticMarkup(<AssemblyComponentTree document={document} selectedPath={[]} onSelect={onSelect} />)
  const rows = html.match(/<button(?=[^>]*role="treeitem")[^>]*>/g) ?? []
  const disclosures = html.match(/<button(?=[^>]*data-assembly-tree-disclosure=)[^>]*>/g) ?? []
  const groups = html.match(/<div(?=[^>]*role="group")[^>]*>/g) ?? []
  expect(rows).toHaveLength(4); expect(disclosures).toHaveLength(2); expect(groups).toHaveLength(2)
  expect(rows.map(row => JSON.parse(treeAttribute(row, 'data-assembly-tree-path')!))).toEqual([['a'], ['a', 'child'], ['b'], ['b', 'child']])
  expect(new Set(rows.map(row => treeAttribute(row, 'data-assembly-tree-key'))).size).toBe(4)
  expect(rows.filter(row => row.includes('tabindex="0"'))).toHaveLength(1)
  for (const [index, rootIndex] of [0, 2].entries()) {
    const parent = rows[rootIndex], child = rows[rootIndex + 1], key = treeAttribute(parent, 'data-assembly-tree-key')
    expect(treeAttribute(parent, 'data-assembly-tree-parent')).toBe('')
    expect(treeAttribute(child, 'data-assembly-tree-parent')).toBe(key)
    expect(treeAttribute(disclosures[index], 'data-assembly-tree-disclosure')).toBe(key)
    expect(treeAttribute(groups[index], 'data-assembly-tree-parent-key')).toBe(key)
    expect(treeAttribute(parent, 'aria-controls')).toBe(treeAttribute(groups[index], 'id'))
    expect(treeAttribute(parent, 'aria-owns')).toBe(treeAttribute(groups[index], 'id'))
    expect(parent).toContain('aria-expanded="false"'); expect(groups[index]).toContain('hidden=""')
    expect(child).toContain('aria-level="2"'); expect(child).not.toContain('aria-expanded=')
  }
  expect(assemblyTreeRows(document)).toHaveLength(4)
  expect(serializeAssemblyDocument(document)).toBe(before); expect(onSelect).not.toHaveBeenCalled()
})
it('reveals only the selected reused occurrence ancestors and assigns that row the keyboard entry point', () => {
  const document = nestedTreeFixture(), onSelect = vi.fn()
  const html = renderToStaticMarkup(<AssemblyComponentTree document={document} selectedPath={['b', 'child']} onSelect={onSelect} />)
  const rows = html.match(/<button(?=[^>]*role="treeitem")[^>]*>/g) ?? []
  const groups = html.match(/<div(?=[^>]*role="group")[^>]*>/g) ?? []
  expect(rows[0]).toContain('aria-expanded="false"'); expect(groups[0]).toContain('hidden=""')
  expect(rows[2]).toContain('aria-expanded="true"'); expect(groups[1]).not.toContain('hidden=')
  expect(rows[3]).toContain('aria-selected="true"'); expect(rows[3]).toContain('tabindex="0"')
  expect(rows.slice(0, 3).every(row => row.includes('aria-selected="false"') && row.includes('tabindex="-1"'))).toBe(true)
  expect(onSelect).not.toHaveBeenCalled()
})
it('keeps inactive tree navigation unfocusable and preserves the existing disabled selection guard', () => {
  const document = nestedTreeFixture(), onSelect = vi.fn()
  const inactive = renderToStaticMarkup(<AssemblyComponentTree document={document} selectedPath={['b', 'child']} onSelect={onSelect} active={false} />)
  expect(inactive).not.toContain('tabindex="0"'); expect(inactive).not.toContain('aria-expanded="true"')
  const blocked = renderToStaticMarkup(<AssemblyComponentTree document={document} selectedPath={[]} onSelect={onSelect} disabled />)
  const controls = blocked.match(/<button\b[^>]*>/g) ?? []
  expect(controls).toHaveLength(6); expect(controls.every(control => control.includes('disabled=""'))).toBe(true)
  expect(blocked).not.toContain('tabindex="0"'); expect(onSelect).not.toHaveBeenCalled()
})
it('converts a displayed actual face to the declaring scope without losing exact body or definition state', () => {
  const original = face(), before = JSON.stringify(original), result = scopedAssemblyFace(original, ['sub-a'])
  expect(result).toMatchObject({ component: { occurrencePath: ['pin'], definition: { id: 'pin', revision: 'r1' } }, body: { bodyId: 'body', sourceFeatureId: 'final' }, support: 'axis' })
  expect(JSON.stringify(original)).toBe(before); expect(scopedAssemblyFace(original, ['sub-b'])).toBeNull(); expect(scopedAssemblyFace(original, ['sub-a', 'pin'])).toBeNull()
})
it('refuses unsupported surface metadata instead of fitting a cylinder from mesh coordinates', () => {
  const unsupported = face(); unsupported.support = null; expect(scopedAssemblyFace(unsupported, [])).toBeNull()
})
it('scopes an exact native plane for limit-distance without modifying its body/revision or original DTO', () => {
  const original = face(['sub-a', 'pin'], 'plane'), before = JSON.stringify(original), value = scopedAssemblyPlaneFace(original, ['sub-a'])
  expect(value).toMatchObject({ support: 'plane', component: { occurrencePath: ['pin'], definition: original.selection.component.definition }, body: original.selection.body, face: original.selection.face })
  expect(JSON.stringify(original)).toBe(before); expect(scopedAssemblyPlaneFace(original, ['sub-b'])).toBeNull(); expect(scopedAssemblyPlaneFace(original, ['sub-a', 'pin'])).toBeNull()
})
it.each(['cylinder', 'sphere', 'unsupported'] as const)('does not turn a %s display face into a limit-distance plane', kind => {
  const value = face()
  if (kind !== 'cylinder') value.support = null
  if (kind === 'sphere') value.sphereSurface = { kind: 'sphere-surface', center: [0, 0, 0], radius: 3, tolerance: 1e-7 }
  expect(scopedAssemblyPlaneFace(value, [])).toBeNull()
})
it('exposes the distinct interval family without authorizing an initial preview or altering committed recovery data', () => {
  const document = createAssemblyExample(), before = serializeAssemblyDocument(document), html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} initialSaved={before} onOpenPart={() => undefined} />)
  expect(html).toContain('value="limit-distance"'); expect(html).toContain('Distancia con límites'); expect(html).not.toContain('Intervalos entre planos verificados'); expect(serializeAssemblyDocument(document)).toBe(before)
})
it('renders the named saved interval edit action without claiming a fresh coordinate during initial SSR', () => {
  const document = createAssemblyExample()
  document.mates.push({ ...assemblyLimitDistanceUiProposal({ kind: 'principal-plane', component: null, plane: 'XY' },
    { kind: 'principal-plane', component: { occurrencePath: ['right'], definition: { id: 'example-pin', revision: 'r1' } }, plane: 'XY' },
    { name: 'Original signed interval', alignment: 'opposed', minimum: '-30', maximum: '-10' }), id: 'original-interval' })
  const before = serializeAssemblyDocument(document), html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} onOpenPart={() => undefined} />)
  expect(html).toContain('aria-label="Editar intervalo entre planos Original signed interval"'); expect(html).toContain('Distancia con límites · [-30, -10] mm · opuesta')
  expect(html).not.toContain('aria-label="Intervalos entre planos verificados"'); expect(serializeAssemblyDocument(document)).toBe(before)
})
it('builds a concentric syntax proposal without equal-radius, solved-pose or rotation-lock invention', () => {
  const first = scopedAssemblyFace(face(['left']), [])!, second = scopedAssemblyFace(face(['right']), [])!
  const mate = assemblyMateProposal(first, second, 'concentric', 'opposed', 0)
  expect(mate).toMatchObject({ type: 'concentric', alignment: 'opposed', rotationLock: null }); expect('id' in mate).toBe(false); expect('relativePose' in mate).toBe(false)
})
it('preserves signed millimeters and degree targets while rejecting incompatible reference families', () => {
  const axis = scopedAssemblyFace(face(['a']), [])!, plane = scopedAssemblyFace(face(['b'], 'plane'), [])!
  expect(assemblyMateProposal(plane, { kind: 'principal-plane', component: null, plane: 'XY' }, 'distance', 'aligned', -5)).toMatchObject({ distance: -5 })
  expect(assemblyMateProposal(axis, plane, 'angle', 'aligned', 90)).toMatchObject({ angle: 90 })
  expect(() => assemblyMateProposal(axis, plane, 'concentric', 'aligned', 0)).toThrow('cilíndricas'); expect(() => assemblyMateProposal(axis, plane, 'coincident', 'aligned', 0)).toThrow('planas')
  expect(() => assemblyMateProposal(axis, plane, 'angle', 'aligned', 181)).toThrow(); expect(() => assemblyMateProposal(null, plane, 'angle', 'aligned', 90)).toThrow()
})
it('imports a v1 part as a reusable source without replacing the assembly document', () => {
  const document = createEmptyAssembly('Original import target'), stamp = '2026-10-15T00:00:00.000Z', part = validateDocument({ version: 1, id: 'original-part', name: 'Original empty part', units: 'mm', createdAt: stamp, updatedAt: stamp, features: [] })
  const before = serializeAssemblyDocument(document), inserted = insertAssemblyComponent(document, part), repeated = insertAssemblyPart(inserted, part)
  expect(inserted.id).toBe(document.id); expect(repeated.definitions).toHaveLength(1); expect(repeated.occurrences).toHaveLength(2)
  expect(repeated.occurrences[0].id).not.toBe(repeated.occurrences[1].id); expect(repeated.occurrences[0].definition).toEqual(repeated.occurrences[1].definition)
  expect(repeated.occurrences.every(value => JSON.stringify(value.pose) === JSON.stringify(identityRigidPose()))).toBe(true); expect(serializeAssemblyDocument(document)).toBe(before)
})
it('admits file contents only for the original document, generation and insertion scope', () => {
  const ticket = { purpose: 'insert' as const, signature: 'original-document', generation: 7, scopePath: '["left","inner"]' }
  expect(assemblyFileTicketIsCurrent(ticket, 'original-document', 7, '["left","inner"]')).toBe(true)
  expect(assemblyFileTicketIsCurrent(ticket, 'changed-document', 7, ticket.scopePath)).toBe(false)
  expect(assemblyFileTicketIsCurrent(ticket, ticket.signature, 8, ticket.scopePath)).toBe(false)
  expect(assemblyFileTicketIsCurrent(ticket, ticket.signature, 7, '["right","inner"]')).toBe(false)
  // Returning to the same scope cannot revive a ticket after scope changes advance generation.
  expect(assemblyFileTicketIsCurrent(ticket, ticket.signature, 9, ticket.scopePath)).toBe(false)
  expect(assemblyFileTicketIsCurrent({ ...ticket, purpose: 'open' }, ticket.signature, 7, '[]')).toBe(true)
  expect(assemblyFileTicketIsCurrent({ ...ticket, purpose: 'update' }, ticket.signature, 8, '[]')).toBe(false)
  expect(assemblyFileTicketIsCurrent({ ...ticket, purpose: 'replace-component' }, ticket.signature, 7, '[]')).toBe(true)
})
it('routes v2 component import without replacing its parent or changing local source declarations', () => {
  const parent = createEmptyAssembly('Original UI import parent'), source = createAssemblyExample()
  source.mates.push({ id: 'original-ui-import-distance', name: 'Original local distance', type: 'distance', suppressed: false,
    first: { kind: 'principal-plane', component: null, plane: 'XY' },
    second: { kind: 'principal-plane', component: { occurrencePath: ['left'], definition: { id: 'example-pin', revision: 'r1' } }, plane: 'XY' },
    alignment: 'aligned', distance: 2 })
  const originalParent = serializeAssemblyDocument(parent), originalSource = serializeAssemblyDocument(source)
  const once = insertAssemblyComponent(parent, source), twice = insertAssemblyComponent(once, source)
  expect(twice.id).toBe(parent.id); expect(twice.name).toBe(parent.name); expect(twice.mates).toEqual([])
  expect(twice.occurrences).toHaveLength(2); expect(twice.occurrences[0].definition).toEqual(twice.occurrences[1].definition)
  const imported = twice.definitions.find(value => value.kind === 'assembly' && value.id === source.id)
  if (!imported || imported.kind !== 'assembly') throw new Error('Expected imported assembly definition')
  expect(imported.occurrences).toEqual(source.occurrences); expect(imported.mates).toEqual(source.mates)
  for (const definition of source.definitions) expect(twice.definitions).toContainEqual(definition)
  expect(serializeAssemblyDocument(parent)).toBe(originalParent); expect(serializeAssemblyDocument(source)).toBe(originalSource)
})
it('shows one generic import action and retains the parent filename while the initial build is busy', () => {
  const document = createEmptyAssembly('Original empty parent'), saved = serializeAssemblyDocument(document)
  const html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} initialSaved={saved}
    initialPath="original-parent.solidflow" onOpenPart={() => undefined} />)
  expect(html).toContain('original-parent.solidflow'); expect(html).toContain('Importa un componente para comenzar.')
  expect(html.match(/Importar componente/g)).toHaveLength(1)
  expect(html).toMatch(/<button(?=[^>]*disabled="")[^>]*>(?:(?!<\/button>)[\s\S])*Importar componente(?:<\/span>)?<\/button>/)
  expect(html).not.toContain('Importar pieza'); expect(html).not.toContain('Importar ensamblaje')
  expect(serializeAssemblyDocument(document)).toBe(saved)
})
it('rejects an executable version discriminator without reading it during component import', () => {
  const parent = createEmptyAssembly('Original executable-source rejection'), before = serializeAssemblyDocument(parent)
  let calls = 0
  const source = Object.defineProperty({}, 'version', { enumerable: true, get: () => { calls++; return 2 } })
  expect(() => insertAssemblyComponent(parent, source as AssemblyDocument)).toThrow()
  expect(calls).toBe(0); expect(serializeAssemblyDocument(parent)).toBe(before)
})
it('adds a distinct revision for changed imported source data and rejects an assembly identity collision', () => {
  const original = createAssemblyExample(), pin = original.definitions.find(value => value.kind === 'part' && value.id === 'example-pin')!
  if (pin.kind !== 'part') throw new Error('Expected part')
  const changed = structuredClone(pin.document); changed.name = 'Explicit changed source'; const inserted = insertAssemblyPart(original, changed)
  expect(inserted.definitions.filter(value => value.id === 'example-pin')).toHaveLength(2); expect(inserted.definitions.find(value => value.id === 'example-pin' && value.revision === 'r1')).toEqual(pin)
  const collision = { ...changed, id: original.id }; expect(() => insertAssemblyPart(original, collision)).toThrow('ensamblaje')
})
it('gates Apply on the exact current document, candidate and generation while treating tokens as backend capabilities', () => {
  const p = uiPreview(); expect(canApplyAssemblyPreview(p, p.baseSignature, p.candidateSignature, 3, false)).toBe(true)
  expect(canApplyAssemblyPreview(null, p.baseSignature, p.candidateSignature, 3, false)).toBe(false)
  expect(canApplyAssemblyPreview(p, p.baseSignature + 'changed', p.candidateSignature, 3, false)).toBe(false)
  expect(canApplyAssemblyPreview(p, p.baseSignature, p.candidateSignature + 'changed', 3, false)).toBe(false)
  expect(canApplyAssemblyPreview(p, p.baseSignature, p.candidateSignature, 4, false)).toBe(false)
  expect(canApplyAssemblyPreview(p, p.baseSignature, p.candidateSignature, 3, true)).toBe(false)
})
it('does not display a fabricated zero DOF before any solver report exists', () => {
  const html = renderToStaticMarkup(<AssemblySolveSummary scopes={[]} />); expect(html).toContain('medir los grados de libertad'); expect(html).not.toContain('0 grados de libertad')
})
it('does not offer source update without a selected part or start a worker review during SSR', () => {
  const document = createAssemblyExample(), before = serializeAssemblyDocument(document)
  const html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} initialSaved={before} initialPath="original.solidflow" onOpenPart={() => undefined} />)
  expect(html).toContain('accept=".solidflow"'); expect(html).toContain('original.solidflow')
  expect(html).not.toContain('aria-label="Actualizar pieza"'); expect(html).not.toContain('aria-label="Actualizar origen compartido"')
  expect(reviewAssemblyPartUpdate).not.toHaveBeenCalled(); expect(serializeAssemblyDocument(document)).toBe(before)
})
it('renders committed-only interference controls without manufacturing a report or starting analysis during SSR', () => {
  const document = createAssemblyExample(), before = serializeAssemblyDocument(document)
  const html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} initialSaved={before} onOpenPart={() => undefined} />)
  expect(html).toContain('aria-label="Interferencias y holguras"'); expect(html).toContain('aria-label="Holgura de comprobación"')
  expect(html).toMatch(/<button(?=[^>]*aria-label="Comprobar interferencias")(?=[^>]*disabled="")[^>]*>/)
  expect(html).not.toContain('data-analysis-id='); expect(inspectAssemblyInterferences).not.toHaveBeenCalled(); expect(serializeAssemblyDocument(document)).toBe(before)
})
it('distinguishes interference choices with repeated display names using the complete occurrence path', () => {
  const document = createAssemblyExample()
  for (const occurrence of document.occurrences) occurrence.name = 'Nombre repetido'
  const before = serializeAssemblyDocument(document)
  const html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} initialSaved={before} onOpenPart={() => undefined} />)
  expect(html).toContain('Nombre repetido · [&quot;left&quot;] · Pieza')
  expect(html).toContain('Nombre repetido · [&quot;right&quot;] · Pieza')
  expect(html).toContain('aria-label="Componentes seleccionados para interferencias"')
  expect(html).toContain('aria-label="Componentes excluidos de interferencias"')
  expect(serializeAssemblyDocument(document)).toBe(before)
})
it('keeps the compact viewport command names unique and retains initial manipulation guards', () => {
  const html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={createAssemblyExample()} onOpenPart={() => undefined} />)
  const nav = html.match(/<nav\b[^>]*aria-label="Controles del visor del ensamblaje"[^>]*>([\s\S]*?)<\/nav>/)?.[1]
  expect(nav).toBeDefined()
  const orientation = nav!.match(/<select\b[^>]*aria-label="Orientación de vista"[^>]*>([\s\S]*?)<\/select>/)
  expect(orientation).not.toBeNull()
  expect([...orientation![1].matchAll(/<option value="([^"]+)"/g)].map(value => value[1])).toEqual(['front', 'back', 'left', 'right', 'top', 'bottom', 'iso', 'normal'])
  expect(nav!).toMatch(/<button(?=[^>]*aria-label="Vista anterior")(?=[^>]*disabled="")[^>]*>/)
  const buttons = nav!.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []
  expect(buttons.map(button => {
    // Match the whole button: one text-free SVG, then its only text label.
    const content = button.match(/^<button\b[^>]*><svg\b(?=[^>]*\baria-hidden="true")[^>]*>(?:<(path|circle|rect|line|polyline|polygon|ellipse)\b[^>]*><\/\1>)+<\/svg><span class="compact-viewport-label">([^<]*)<\/span><\/button>$/)
    expect(content).not.toBeNull()
    return content![2]
  })).toEqual([
    'Vistas guardadas', 'Normal a', 'Vista anterior', 'Isométrica', 'Frontal', 'Superior', 'Ajustar', 'Seleccionar caras',
    'Arrastrar posición', 'Arrastrar giro', 'Desactivar manipulador',
  ])
  for (const button of buttons) {
    expect(button).toContain('class="compact-viewport-label"')
    expect(button).toMatch(/<svg\b[^>]*aria-hidden="true"/)
    expect(button).toMatch(/title="[^"]+"/)
  }
  const named = buttons.filter(button => button.includes('aria-label="Vistas guardadas"'))
  expect(named).toHaveLength(1)
  expect(named[0]).toMatch(/<button[^>]*disabled=""/)
  for (const label of ['Arrastrar posición', 'Arrastrar giro', 'Desactivar manipulador']) {
    const matches = buttons.filter(button => button.includes(`<span class="compact-viewport-label">${label}</span>`))
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatch(/<button[^>]*disabled=""/)
  }
  expect(nav).toContain('class="compact-viewport-group assembly-drag-tools"')
})
it('does not start movement or expose a raw pose-write control during initial workspace rendering', () => {
  const document = createAssemblyExample(), before = serializeAssemblyDocument(document)
  const html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} initialSaved={before} onOpenPart={() => undefined} />)
  expect(html).not.toContain('Posición X del componente'); expect(html).not.toContain('Aplicar giro declarado')
  expect(moveAssemblyComponent).not.toHaveBeenCalled(); expect(serializeAssemblyDocument(document)).toBe(before)
})
it('labels only the driven scope as temporarily anchored instead of claiming saved zero mobility', () => {
  // Symbolic report for SSR labeling only; no kernel reply or accepted solve.
  const document = createAssemblyExample(), definition = { id: document.id, revision: document.revision }
  const anchored: AssemblyScopeSolveReport = { definition, temporaryAnchor: { occurrenceId: 'left' }, result: { status: 'fullyDefined', localDOF: 0, rank: 6, rankRange: [6, 6], localDOFRange: [0, 0], iterations: 0, certificates: [], evidence: { groups: [], diagnostics: [], maxLengthResidual: 0, maxAngleResidual: 0 } } }
  const html = renderToStaticMarkup(<AssemblySolveSummary document={document} scopes={[anchored]} />)
  expect(html).toContain(document.name); expect(html).toContain('0 grados de libertad con ancla temporal'); expect(html).toContain('rango 6 con ancla temporal')
  expect(html).toContain('Tras Aplicar, vuelve a Resolver'); expect(html).not.toContain('0 grados de libertad locales')
  const natural = { ...anchored, temporaryAnchor: undefined }, naturalHtml = renderToStaticMarkup(<AssemblySolveSummary scopes={[natural]} />)
  expect(naturalHtml).toContain('0 grados de libertad locales'); expect(naturalHtml).not.toContain('con ancla temporal')
})
it('starts with manipulation off and blocks its controls without a selected visible native scene', () => {
  const document = createAssemblyExample(), before = serializeAssemblyDocument(document)
  const html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} initialSaved={before} onOpenPart={() => undefined} />)
  for (const label of ['Arrastrar posición', 'Arrastrar giro']) expect(html).toMatch(new RegExp(`<button(?=[^>]*aria-label="${label}")(?=[^>]*aria-pressed="false")(?=[^>]*disabled="")[^>]*>`))
  expect(html).toMatch(/<button(?=[^>]*aria-label="Desactivar manipulador")(?=[^>]*disabled="")[^>]*>/)
  expect(moveAssemblyWorldComponent).not.toHaveBeenCalled(); expect(serializeAssemblyDocument(document)).toBe(before)
})
function displayScene(path: string[], visible = true): AssemblyScene {
  // Symbolic display eligibility only. Empty mesh data never authenticates CAD.
  return { kind: 'assembly-scene', sceneId: 'symbolic-display', volume: 0, area: 0, solidCount: 0, prototypeCount: 0, bounds: null, visibleBounds: null, warnings: [],
    bodies: [{ component: { occurrencePath: path, definition: { id: 'original-leaf', revision: 'r2' } }, body: null, name: 'Original display body', visible,
      worldPose: identityRigidPose(), vertices: [], normals: [], triangles: [], edgeLines: [], faces: [], volume: 0, area: 0, solidCount: 0,
      bounds: { min: [0, 0, 0], max: [0, 0, 0] } }] }
}
it('admits an exact visible leaf identity and a selected assembly prefix with a visible descendant', () => {
  const scene = displayScene(['group', 'leaf']), exact = { occurrencePath: ['group', 'leaf'], definition: { id: 'original-leaf', revision: 'r2' } }
  expect(assemblyHasVisibleDragBody(scene, exact)).toBe(true)
  expect(assemblyHasVisibleDragBody(scene, { occurrencePath: ['group'], definition: { id: 'original-group', revision: 'r1' } })).toBe(true)
})
it('rejects hidden or missing display bodies instead of allowing a scene-free drag', () => {
  const component = { occurrencePath: ['group', 'leaf'], definition: { id: 'original-leaf', revision: 'r2' } }
  expect(assemblyHasVisibleDragBody(null, component)).toBe(false); expect(assemblyHasVisibleDragBody(displayScene(['group', 'leaf'], false), component)).toBe(false)
  expect(assemblyHasVisibleDragBody({ ...displayScene(['group', 'leaf']), bodies: [] }, component)).toBe(false)
})
it('compares path segments and exact leaf revision rather than accepting textual prefixes or stale identities', () => {
  const scene = displayScene(['group-long', 'leaf']), component = { occurrencePath: ['group'], definition: { id: 'original-group', revision: 'r1' } }
  expect(assemblyHasVisibleDragBody(scene, component)).toBe(false)
  expect(assemblyHasVisibleDragBody(displayScene(['group', 'leaf']), { occurrencePath: ['group', 'leaf'], definition: { id: 'original-leaf', revision: 'r1' } })).toBe(false)
  expect(assemblyHasVisibleDragBody(displayScene(['group']), { occurrencePath: ['group', 'leaf'], definition: { id: 'original-leaf', revision: 'r2' } })).toBe(false)
  expect(assemblyHasVisibleDragBody(scene, { occurrencePath: [], definition: { id: 'original-group', revision: 'r1' } })).toBe(false)
})
it('does not invent a projection report or replace strict movement APIs during initial workspace rendering', () => {
  const document = createAssemblyExample(), before = serializeAssemblyDocument(document)
  const html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} initialSaved={before} onOpenPart={() => undefined} />)
  expect(html).not.toContain('aria-label="Proyección del arrastre"'); expect(projectAssemblyDrag).not.toHaveBeenCalled()
  expect(moveAssemblyWorldComponent).not.toHaveBeenCalled(); expect(moveAssemblyComponent).not.toHaveBeenCalled()
  expect(translateAssemblyUntilContact).not.toHaveBeenCalled()
  expect(serializeAssemblyDocument(document)).toBe(before)
})

it('offers the declaration BOM command without opening a table or changing the committed document during initial rendering', () => {
  const document = createAssemblyExample(), before = serializeAssemblyDocument(document)
  const html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} initialSaved={before} onOpenPart={() => undefined} />)
  expect(html).toContain('aria-label="Lista de materiales"'); expect(html).toContain('aria-controls="assembly-bom-panel"')
  expect(html).not.toContain('aria-label="Lista de materiales del ensamblaje"')
  expect(buildAssembly).not.toHaveBeenCalled(); expect(previewAssembly).not.toHaveBeenCalled()
  expect(serializeAssemblyDocument(document)).toBe(before)
})
it('scopes an exact line-edge reference without leaking its full world path or mutating its DTO', () => {
  const edge: AssemblySceneEdge = { selection: { component: { occurrencePath: ['sub', 'rack'], definition: { id: 'rack', revision: 'r2' } }, body: { bodyId: 'rack-body', sourceFeatureId: 'final' }, edge: { sourceFeatureId: 'final', key: 'edge-v1|original' } }, support: { kind: 'line', point: [0, 0, 0], axis: [1, 0, 0], tolerance: 0 }, worldSupport: null, lines: [] }
  const before = JSON.stringify(edge), result = scopedAssemblyEdge(edge, ['sub'])!
  expect(result.component.occurrencePath).toEqual(['rack']); expect(result.component.definition.revision).toBe('r2'); expect(result.edge).toEqual(edge.selection.edge)
  result.component.occurrencePath[0] = 'changed'; expect(JSON.stringify(edge)).toBe(before)
  expect(scopedAssemblyEdge(edge, ['other'])).toBeNull(); edge.support = null; expect(scopedAssemblyEdge(edge, [])).toBeNull()
})
it('offers rack/pinion without interpreting an edge as a plane or creating a relation during SSR', () => {
  const document = createAssemblyExample(), before = serializeAssemblyDocument(document)
  const html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} initialSaved={before} onOpenPart={() => undefined} />)
  expect(html).toContain('value="rack-pinion"'); expect(html).toContain('Cremallera y piñón')
  expect(serializeAssemblyDocument(document)).toBe(before); expect(previewAssembly).not.toHaveBeenCalled()
})
it('renders flat geometry export blocked until the committed scene is rebuilt without exporting during SSR', () => {
  const document = createAssemblyExample(), before = serializeAssemblyDocument(document)
  const html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} initialSaved={before} onOpenPart={() => undefined} />)
  expect(html).toContain('aria-label="Exportar geometría del ensamblaje"')
  for (const label of ['Exportar STEP plano del ensamblaje', 'Exportar STL del ensamblaje']) {
    expect(html).toMatch(new RegExp(`<button(?=[^>]*aria-label="${label}")(?=[^>]*disabled="")[^>]*>`))
  }
  expect(html).toContain('Incluye componentes ocultos; excluye suprimidos.')
  expect(exportAssemblyCad).not.toHaveBeenCalled(); expect(serializeAssemblyDocument(document)).toBe(before)
})
it('offers explicit direction families while retaining existing face/control labels and initial Apply blocking', () => {
  const document = createAssemblyExample(), before = serializeAssemblyDocument(document)
  const html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} onOpenPart={() => undefined} />)
  expect(html).toContain('value="parallel"'); expect(html).toContain('value="perpendicular"'); expect(html).toContain('aria-label="Cara de referencia"')
  expect(html).toContain('aria-label="Orientación de la relación"'); expect(html).not.toContain('aria-label="Arista de referencia"')
  expect(html).toMatch(/<button(?=[^>]*aria-label="Aplicar ensamblaje")(?=[^>]*disabled="")[^>]*>/)
  expect(previewAssembly).not.toHaveBeenCalled(); expect(serializeAssemblyDocument(document)).toBe(before)
})
it('maps plane/axis direction semantics without rewriting the legacy angular family', () => {
  const axis = scopedAssemblyFace(face(['left']), [])!, plane = scopedAssemblyFace(face(['right'], 'plane'), [])!
  expect(assemblyMateProposal(plane, axis, 'parallel', 'opposed', 25)).toMatchObject({ type: 'parallel', alignment: null })
  expect(assemblyMateProposal(plane, axis, 'perpendicular', 'opposed', 25)).toMatchObject({ type: 'perpendicular', alignment: 'opposed' })
  expect(assemblyMateProposal(plane, axis, 'angle', 'opposed', 25)).toMatchObject({ type: 'angle', angle: 25 })
})
it('keeps actual scoped LINE declaration identity in a directional proposal', () => {
  const edge: AssemblySceneEdge = { selection: { component: { occurrencePath: ['sub', 'left'], definition: { id: 'pin', revision: 'r2' } }, body: { bodyId: 'body', sourceFeatureId: 'final' }, edge: { sourceFeatureId: 'final', key: 'edge-v1|original-line' } }, support: { kind: 'line', point: [5, 3, 0], axis: [0, 0, 1], tolerance: 1e-7 }, worldSupport: null, lines: [] }
  const line = scopedAssemblyEdge(edge, ['sub'])!, plane = scopedAssemblyFace(face(['sub', 'right'], 'plane'), ['sub'])!
  const proposal = assemblyMateProposal(plane, line, 'perpendicular', 'aligned', 0)
  expect(proposal).toMatchObject({ type: 'perpendicular', alignment: 'aligned', second: { kind: 'edge', component: { occurrencePath: ['left'], definition: { id: 'pin', revision: 'r2' } }, body: edge.selection.body, edge: edge.selection.edge, support: 'line' } })
})
it('selects cylindrical surface purpose explicitly while legacy face selection still selects the axis', () => {
  const original = face(), before = JSON.stringify(original)
  expect(scopedAssemblyTangentFace(original, ['sub-a'])).toMatchObject({ kind: 'face', support: 'cylinder-surface', component: { occurrencePath: ['pin'], definition: original.selection.component.definition }, body: original.selection.body, face: original.selection.face })
  expect(scopedAssemblyFace(original, ['sub-a'])).toMatchObject({ support: 'axis' })
  expect(JSON.stringify(original)).toBe(before)
})
it('retains an exact current plane purpose for tangency without manufacturing a normal or cylinder radius', () => {
  const original = face(['sub-a', 'pin'], 'plane'), reference = scopedAssemblyTangentFace(original, ['sub-a'])
  expect(reference).toMatchObject({ kind: 'face', support: 'plane', component: { occurrencePath: ['pin'] }, face: original.selection.face })
  expect(reference && 'normal' in reference).toBe(false); expect(reference && 'radius' in reference).toBe(false)
})
it('does not turn unsupported or outside-scope faces into tangent selection intent', () => {
  const original = face(); expect(scopedAssemblyTangentFace(original, ['other'])).toBeNull(); expect(scopedAssemblyTangentFace(original, ['sub-a', 'pin'])).toBeNull()
  original.support = null; expect(scopedAssemblyTangentFace(original, [])).toBeNull()
})
it('offers tangent authoring/editing while keeping its support report absent before a fresh worker preview', () => {
  const document = createAssemblyExample(), selectedFace = face(['left'])
  selectedFace.selection.component.definition = { id: 'example-pin', revision: 'r1' }
  selectedFace.selection.body = { bodyId: 'pin-body', sourceFeatureId: 'bore' }; selectedFace.selection.face.sourceFeatureId = 'bore'
  const surface = scopedAssemblyTangentFace(selectedFace, [])!
  document.mates.push({ ...assemblyTangentUiProposal({ kind: 'principal-plane', component: null, plane: 'XY' }, surface, { name: 'Original symbolic tangency', side: 'positive' }), id: 'original-tangent' })
  const before = serializeAssemblyDocument(document), html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} onOpenPart={() => undefined} />)
  expect(html).toContain('value="tangent"'); expect(html).toContain('aria-label="Editar tangencia Original symbolic tangency"')
  expect(html).not.toContain('aria-label="Tangencias de soportes verificadas"'); expect(previewAssembly).not.toHaveBeenCalled()
  expect(serializeAssemblyDocument(document)).toBe(before)
})
it('selects only actual cylinder surfaces in the exact declaring scope and detaches reference data', () => {
  const original = face(), before = JSON.stringify(original), reference = scopedAssemblyCylinderSurface(original, ['sub-a'])!
  expect(reference).toMatchObject({ kind: 'face', support: 'cylinder-surface', component: { occurrencePath: ['pin'] }, body: original.selection.body, face: original.selection.face })
  reference.component.occurrencePath[0] = 'changed'; reference.face.key = 'local-change'
  expect(JSON.stringify(original)).toBe(before); expect(scopedAssemblyCylinderSurface(original, ['other'])).toBeNull(); expect(scopedAssemblyCylinderSurface(original, ['sub-a', 'pin'])).toBeNull()
})
it('does not convert a plane or unsupported face into cylinder-surface authoring intent', () => {
  expect(scopedAssemblyCylinderSurface(face(['left'], 'plane'), [])).toBeNull()
  const unsupported = face(); unsupported.support = null; expect(scopedAssemblyCylinderSurface(unsupported, [])).toBeNull()
})
it.each(['skew-cylinder-tangent', 'parallel-cylinder-tangent'] as const)('renders named %s editing without a verified support claim during SSR', type => {
  const document = createAssemblyExample(), first = face(['left']), second = face(['right'])
  for (const value of [first, second]) { value.selection.component.definition = { id: 'example-pin', revision: 'r1' }; value.selection.body = { bodyId: 'pin-body', sourceFeatureId: 'bore' }; value.selection.face.sourceFeatureId = 'bore' }
  document.mates.push({ ...assemblyCylinderTangentUiProposal(scopedAssemblyCylinderSurface(first, [])!, scopedAssemblyCylinderSurface(second, [])!, { type, name: 'Original cylindrical supports', branch: { kind: 'internal', larger: 'second' } }), id: 'original-cylinder-tangent' })
  const before = serializeAssemblyDocument(document), html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} onOpenPart={() => undefined} />)
  expect(html).toContain('value="' + type + '"'); expect(html).toContain('aria-label="Editar tangencia entre cilindros Original cylindrical supports"')
  expect(html).toContain('interna · mayor: referencia 2'); expect(html).not.toContain('aria-label="Tangencias entre cilindros verificadas"')
  expect(previewAssembly).not.toHaveBeenCalled(); expect(serializeAssemblyDocument(document)).toBe(before)
})
it.each(['plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent'] as const)('selects exact scoped sphere purpose for %s without giving it an axis', type => {
  const original = face(); original.support = null; original.sphereSurface = { kind: 'sphere-surface', center: [0, 0, 0], radius: 3, tolerance: 1e-7 }
  const before = JSON.stringify(original), reference = scopedAssemblySphereTangentFace(original, ['sub-a'], type)!
  expect(reference).toMatchObject({ kind: 'face', support: 'sphere-surface', component: { occurrencePath: ['pin'], definition: original.selection.component.definition }, body: original.selection.body, face: original.selection.face })
  reference.component!.occurrencePath[0] = 'local'; expect(JSON.stringify(original)).toBe(before); expect(scopedAssemblyFace(original, [])).toBeNull()
  expect(scopedAssemblySphereTangentFace(original, ['other'], type)).toBeNull(); expect(scopedAssemblySphereTangentFace(original, ['sub-a', 'pin'], type)).toBeNull()
})
it('admits only the explicit plane/cylinder surface purpose needed by each spherical family', () => {
  const planar = face(['left'], 'plane'), cylindrical = face(['left'])
  expect(scopedAssemblySphereTangentFace(planar, [], 'plane-sphere-tangent')).toMatchObject({ support: 'plane' })
  expect(scopedAssemblySphereTangentFace(planar, [], 'sphere-sphere-tangent')).toBeNull(); expect(scopedAssemblySphereTangentFace(planar, [], 'cylinder-sphere-tangent')).toBeNull()
  expect(scopedAssemblySphereTangentFace(cylindrical, [], 'cylinder-sphere-tangent')).toMatchObject({ support: 'cylinder-surface' })
  expect(scopedAssemblySphereTangentFace(cylindrical, [], 'plane-sphere-tangent')).toBeNull(); expect(scopedAssemblySphereTangentFace(cylindrical, [], 'sphere-sphere-tangent')).toBeNull()
})
it('does not manufacture spherical intent from a mesh or old unsupported metadata', () => {
  const original = face(); original.support = null; original.vertices = [0, 0, 3, 3, 0, 0, 0, 3, 0]; original.triangles = [0, 1, 2]
  expect(scopedAssemblySphereTangentFace(original, [], 'sphere-sphere-tangent')).toBeNull()
})
it.each(['plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent'] as const)('renders named %s editing without claiming a fresh support report or native sphere', type => {
  const document = createAssemblyExample(), left = face(['left']), right = face(['right'])
  for (const value of [left, right]) { value.selection.component.definition = { id: 'example-pin', revision: 'r1' }; value.selection.body = { bodyId: 'pin-body', sourceFeatureId: 'bore' }; value.selection.face.sourceFeatureId = 'bore' }
  right.support = null; right.sphereSurface = { kind: 'sphere-surface', center: [0, 0, 0], radius: 3, tolerance: 1e-7 }
  if (type === 'sphere-sphere-tangent') { left.support = null; left.sphereSurface = { kind: 'sphere-surface', center: [0, 0, 0], radius: 2, tolerance: 1e-7 } }
  const first = type === 'plane-sphere-tangent' ? { kind: 'principal-plane' as const, component: null, plane: 'XY' as const } : scopedAssemblySphereTangentFace(left, [], type)!
  const fields: AssemblySphereTangentUiFields = type === 'plane-sphere-tangent' ? { type, name: 'Original spherical intent', side: 'negative' } : { type, name: 'Original spherical intent', branch: { kind: 'internal', larger: 'second' } }
  document.mates.push({ ...assemblySphereTangentUiProposal(first, scopedAssemblySphereTangentFace(right, [], type)!, fields), id: 'original-spherical-intent' })
  const before = serializeAssemblyDocument(document), html = renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} onOpenPart={() => undefined} />)
  expect(html).toContain('value="' + type + '"'); expect(html).toContain('aria-label="Editar tangencia con esfera Original spherical intent"')
  expect(html).not.toContain('aria-label="Tangencias con esferas verificadas"'); expect(previewAssembly).not.toHaveBeenCalled(); expect(serializeAssemblyDocument(document)).toBe(before)
})

it('starts internal-body interference inclusion as an unchecked transient option without a report or document change', () => {
  const document=createAssemblyExample(),before=serializeAssemblyDocument(document)
  const html=renderToStaticMarkup(<AssemblyWorkspace initialDocument={document} onOpenPart={() => undefined} />)
  expect(html).toMatch(/<input(?=[^>]*aria-label="Incluir cuerpos de una misma pieza")(?![^>]*checked="")[^>]*>/)
  expect(html).toContain('No hay un informe vigente para estas opciones.')
  expect(html).not.toContain('data-analysis-id=')
  expect(serializeAssemblyDocument(document)).toBe(before)
  expect(before).not.toContain('includeWithinComponent')
})

it('exposes separate structural STEP replacement and export controls without consuming old flat actions', () => {
  const html=renderToStaticMarkup(<AssemblyWorkspace initialDocument={createAssemblyExample()} onOpenPart={()=>undefined} />)
  expect(html).toContain('aria-label="Importar STEP estructurado"')
  expect(html).toContain('aria-label="Exportar STEP estructurado del ensamblaje"')
  expect(html).toContain('aria-label="Exportar STEP plano del ensamblaje"')
  expect(html).toContain('accept=".step,.stp"')
})

it('keeps direct STEP insertion separate from structural replacement and gates its initial native build', () => {
  const html=renderToStaticMarkup(<AssemblyWorkspace initialDocument={createAssemblyExample()} onOpenPart={()=>undefined} />)
  const button=html.match(/<button(?=[^>]*aria-label="Insertar STEP estructurado")[^>]*>/)?.[0]
  expect(button).toBeDefined();expect(button).toContain('disabled=""')
  expect(html).toContain('aria-label="Importar STEP estructurado"')
  expect(html).toContain('aria-label="Origen del componente"')
  expect(html).toContain('Insertar otra ocurrencia')
})
