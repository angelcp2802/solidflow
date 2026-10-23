import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AssemblySourceUpdatePanel, { assemblySourceActiveOccurrenceCount, assemblySourceEndpointKey, assemblySourceRepairChoices as compoundRepairChoices } from './AssemblySourceUpdatePanel'
import type { AssemblySourceUpdateReview } from '../cad/kernel.assembly-source-updates'
import type { AssemblySceneBody, AssemblySceneFace, AssemblySceneEdge } from '../cad/kernel.assembly-types'
import { createEmptyAssembly } from '../examples/assembly'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyVertexReference, type AssemblyAxisReference, type AssemblyCylinderSurfaceReference, type AssemblySphereSurfaceReference, type AssemblyEdgeReference } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'
import { validateDocument } from '../model/document'

// Existing single-support fixtures explicitly reject an unexpected compound role.
function assemblySourceRepairChoices(...args: Parameters<typeof compoundRepairChoices>) {
  return compoundRepairChoices(...args).map(choice => {
    const reference = choice.reference
    if ('axis' in reference) throw Error('This fixture requires one legacy geometry support.')
    return { ...choice, reference }
  })
}
// Original symbolic declarations and detached display DTOs only. These cases
// exercise scope/selection syntax and SSR, never native authority or a solve.
const source = { id: 'original-shared-part', revision: 'r1' }, replacement = { ...source, revision: 'r2' }
it('labels each hinge angular repair and offers only current material planes for that role',()=>{
  for(const [side,label] of [['angle-0','Plano angular A de bisagra'],['angle-1','Plano angular B de bisagra']] as const){
    const r=fixture(),endpoint=r.endpoints[0];endpoint.locator.side=side
    if(!('kind'in endpoint.endpoint)||endpoint.endpoint.kind!=='face')throw Error('Original face fixture')
    endpoint.endpoint.support='plane'
    for(const b of r.scene.bodies)for(const f of b.faces)f.support={kind:'plane',point:[10,0,2],normal:[1,0,0],xDirection:[0,1,0],tolerance:1e-7}
    const choices=compoundRepairChoices(r,r.document,endpoint);expect(choices.length).toBeGreaterThan(0)
    expect(choices.every(c=>'kind'in c.reference&&c.reference.kind==='face'&&c.reference.support==='plane')).toBe(true)
    expect(markup(r)).toContain(label);expect(markup(r)).toContain('Cara de reparación M '+side)
  }
})
it('keeps a profile face/edge/sense role atomic across source revision and exact occurrence scope',()=>{
  const review=fixture(),endpoint=review.endpoints[0],old=endpoint.endpoint
  if(!('kind'in old)||old.kind!=='face')throw Error('Original face fixture required')
  endpoint.endpoint={face:{component:old.component,body:old.body,face:old.face},axis:{edge:{sourceFeatureId:'last',key:'edge-v1|'+'c'.repeat(64)},sense:1}}
  for(const body of review.scene.bodies){body.faces[0].support={kind:'plane',point:[0,0,3],normal:[0,0,1],xDirection:[1,0,0],tolerance:1e-7};body.edges=[{selection:{component:structuredClone(body.component),body:structuredClone(body.body),edge:{sourceFeatureId:'last',key:'edge-v1|'+'d'.repeat(64)}},support:{kind:'line',point:[-3,-2,3],axis:[1,0,0],tolerance:1e-7},worldSupport:null,lines:[]}]}
  const before=structuredClone(review),choices=compoundRepairChoices(review,review.document,endpoint)
  expect(choices).toHaveLength(2)
  for(const [i,sense]of [1,-1].entries()){const reference=choices[i].reference;if(!('axis'in reference))throw Error('Compound role required');expect(reference.face.component).toEqual({occurrencePath:['left'],definition:replacement});expect(reference.axis).toEqual({edge:{sourceFeatureId:'last',key:'edge-v1|'+'d'.repeat(64)},sense})}
  expect(review).toEqual(before);endpoint.endpoint.face.component.occurrencePath=['missing'];expect(compoundRepairChoices(review,review.document,endpoint)).toEqual([])
})
function pointReview(reused=false):AssemblySourceUpdateReview{
  const review=fixture();if(reused)nested(review)
  const endpoint=review.endpoints[0],old=endpoint.endpoint
  if(!('kind' in old)||old.kind!=='face')throw Error('Original face fixture required')
  endpoint.endpoint={kind:'vertex',component:structuredClone(old.component),body:structuredClone(old.body),vertex:{sourceFeatureId:'last',key:'vertex-v1|'+'a'.repeat(64)},support:'point'}
  endpoint.locator.side='source'
  for(const body of review.scene.bodies)body.vertexPoints=[{selection:{component:structuredClone(body.component),body:structuredClone(body.body),vertex:{sourceFeatureId:'last',key:'vertex-v1|'+'b'.repeat(64)}},point:[2,3,4],worldPoint:[20,30,40],tolerance:1e-7}]
  return review
}
it('offers exact current material vertices for a source role without mesh or coordinate substitution',()=>{
  const review=pointReview(),before=structuredClone(review),choices=assemblySourceRepairChoices(review,review.document,review.endpoints[0])
  expect(choices).toHaveLength(1);const ref=choices[0].reference as AssemblyVertexReference
  expect(ref.kind).toBe('vertex');expect(ref.support).toBe('point');expect(ref.component).toEqual({occurrencePath:['left'],definition:replacement})
  expect(ref.vertex.key).toBe('vertex-v1|'+'b'.repeat(64));expect(ref.body).toEqual({bodyId:'B',sourceFeatureId:'last'})
  ref.component.occurrencePath[0]='changed';expect(review).toEqual(before)
  const html=markup(review);expect(html).toContain('· Origen</legend>');expect(html).toContain('aria-label="Vértice de reparación M source"')
  review.scene.bodies.forEach(b=>{b.vertexPoints=[];b.vertices=[2,3,4]});expect(assemblySourceRepairChoices(review,review.document,review.endpoints[0])).toEqual([])
})
it('collapses reused point declarations while retaining exact scope and revision identity',()=>{
  const review=pointReview(true),endpoint=review.endpoints[0]
  const choices=assemblySourceRepairChoices(review,review.document,endpoint)
  expect(choices).toHaveLength(1);expect(choices[0].reference.component.occurrencePath).toEqual(['pin'])
  endpoint.locator.scope={id:review.document.id,revision:review.document.revision}
  expect(assemblySourceRepairChoices(review,review.document,endpoint)).toEqual([])
  endpoint.endpoint=(pointReview().endpoints[0].endpoint)
  review.scene.bodies[0].vertexPoints![0].selection.component.definition.revision='foreign'
  expect(assemblySourceRepairChoices(review,review.document,endpoint)).toEqual([])
})
it('rejects foreign vertex body/source metadata and labels all three symmetry roles explicitly',()=>{
  for(const change of ['body','source','path','revision'] as const){
    const review=pointReview(),v=review.scene.bodies[0].vertexPoints![0]
    if(change==='body')v.selection.body!.bodyId='foreign'
    if(change==='source')v.selection.vertex.sourceFeatureId='foreign'
    if(change==='path')v.selection.component.occurrencePath=['right']
    if(change==='revision')v.selection.component.definition.revision='foreign'
    expect(assemblySourceRepairChoices(review,review.document,review.endpoints[0])).toEqual([])
  }
  const review=pointReview();for(const [side,label] of [['source','Origen'],['target','Destino'],['mirror','Plano de simetría']] as const){review.endpoints[0].locator.side=side;expect(markup(review)).toContain('· '+label+'</legend>')}
})
function axis(path: string[]): AssemblyAxisReference {
  return { kind: 'face', component: { occurrencePath: path, definition: { ...source } },
    body: { bodyId: 'B', sourceFeatureId: 'last' }, face: { sourceFeatureId: 'last', key: 'face-v1|' + 'a'.repeat(64) }, support: 'axis' }
}
function body(path: string[]): AssemblySceneBody {
  const selection = axis(path); selection.component.definition = { ...replacement }
  const face: AssemblySceneFace = { selection: { component: selection.component, body: selection.body, face: selection.face },
    support: { kind: 'cylinder', point: [1, 0, 0], axis: [0, 0, 1], xDirection: [1, 0, 0], radius: 2.5, tolerance: 1e-7 },
    worldSupport: null, vertices: [], triangles: [] }
  return { component: structuredClone(selection.component), body: structuredClone(selection.body), name: path.join('/'), visible: true,
    worldPose: identityRigidPose(), vertices: [], normals: [], triangles: [], edgeLines: [], faces: [face],
    volume: 0, area: 0, solidCount: 0, bounds: { min: [0, 0, 0], max: [0, 0, 0] } }
}
function fixture(): AssemblySourceUpdateReview {
  const document = createEmptyAssembly('Original symbolic source review'), stamp = '2026-10-15T00:00:00.000Z'
  const part = validateDocument({ version: 1, id: source.id, name: 'Original symbolic part', units: 'mm', createdAt: stamp, updatedAt: stamp, features: [] })
  document.definitions = [{ kind: 'part', ...source, document: part }, { kind: 'part', ...replacement, document: structuredClone(part) }]
  document.occurrences = ['left', 'right'].map(id => ({ id, name: id, definition: { ...replacement }, pose: identityRigidPose(), fixed: false, suppressed: false, visible: true }))
  document.mates = [{ id: 'M', name: 'Original retained declaration', type: 'concentric', first: axis(['left']), second: axis(['right']), alignment: 'aligned', rotationLock: null, suppressed: false }]
  const scope = { id: document.id, revision: document.revision }
  return { kind: 'assembly-source-review', source: { ...source }, replacement: { ...replacement }, document: validateAssemblyDocument(document),
    occurrences: [{ scope, occurrenceId: 'left' }, { scope, occurrenceId: 'right' }],
    endpoints: [{ locator: { scope, mateId: 'M', side: 'first' }, endpoint: axis(['left']), status: 'needs-repair', message: 'Original reference remains pending.' }],
    scene: { kind: 'assembly-scene', sceneId: 'display-not-proof', bodies: [body(['left']), body(['right'])], volume: 0, area: 0, solidCount: 0, prototypeCount: 1, bounds: null, visibleBounds: null, warnings: [] } }
}
function markup(review = fixture(), options: { busy?: boolean; cancelable?: boolean; repaired?: string[] } = {}): string {
  return renderToStaticMarkup(<AssemblySourceUpdatePanel review={review} document={review.document} repaired={options.repaired ?? []}
    busy={options.busy ?? false} cancelable={options.cancelable} onRepair={() => undefined} onSolve={() => undefined} onCancel={() => undefined} />)
}
it('renders saved-use and active-occurrence counts with explicit staging and no Apply authority', () => {
  const review = fixture(), before = JSON.stringify(review), html = markup(review)
  expect(html).toContain('2 usos guardados'); expect(html).toContain('2 ocurrencias activas'); expect(html).toContain('historial conservan el documento confirmado')
  expect(html).toContain('<strong>Original symbolic part</strong> · Nueva revisión de la pieza')
  expect(html.match(/<legend>[^<]*<\/legend>/g)).toEqual(['<legend>Original symbolic source review · Original retained declaration · Referencia 1</legend>'])
  expect(html).toContain('aria-label="Resolver actualización de pieza"'); expect(html).toContain('aria-label="Cancelar actualización de pieza"')
  expect(html).toContain('Necesita reparación'); expect(html).toMatch(/<button(?=[^>]*aria-label="Reparar referencia M first")(?=[^>]*disabled="")[^>]*>/)
  expect(html).not.toContain('aria-label="Aplicar ensamblaje"'); expect(JSON.stringify(review)).toBe(before)
})
it('labels a directed angular guide distinctly while retaining its exact repair locator and choices', () => {
  const review = fixture(); review.endpoints[0].locator.side = 'guide'
  const before = JSON.stringify(review), html = markup(review), choices = assemblySourceRepairChoices(review, review.document, review.endpoints[0])
  expect(html).toContain('Original retained declaration · Eje guía</legend>'); expect(html).toContain('aria-label="Cara de reparación M guide"')
  expect(choices).toHaveLength(1); expect(choices[0].reference.component.occurrencePath).toEqual(['left']); expect(JSON.stringify(review)).toBe(before)
})
it('keeps manual repairs pending native Solve and labels semantic/component retention separately', () => {
  const review = fixture(), original = review.endpoints[0]
  review.endpoints.push({ ...structuredClone(original), locator: { ...original.locator, mateId: 'semantic' }, status: 'retained-semantic' },
    { ...structuredClone(original), locator: { ...original.locator, mateId: 'component' }, endpoint: { occurrencePath: ['left'], definition: source }, status: 'retained-component' })
  const html = markup(review, { repaired: [assemblySourceEndpointKey(original)] })
  expect(html).toContain('Reparada manualmente · pendiente de resolver'); expect(html).toContain('Referencia semántica conservada'); expect(html).toContain('Componente conservado')
  expect(html.match(/Cara de reparación/g)).toHaveLength(1)
})
it('blocks repair and Solve during work but exposes Cancel only when the operation is cancelable', () => {
  const blocked = markup(fixture(), { busy: true }), cancelable = markup(fixture(), { busy: true, cancelable: true })
  expect(blocked).toMatch(/<select(?=[^>]*aria-label="Cara de reparación M first")(?=[^>]*disabled="")[^>]*>/)
  expect(blocked).toMatch(/<button(?=[^>]*aria-label="Resolver actualización de pieza")(?=[^>]*disabled="")[^>]*>/)
  expect(blocked).toMatch(/<button(?=[^>]*aria-label="Cancelar actualización de pieza")(?=[^>]*disabled="")[^>]*>/)
  expect(cancelable).toMatch(/<button(?=[^>]*aria-label="Cancelar actualización de pieza")(?![^>]*disabled=)[^>]*>/)
})
it('returns the exact current body/face with replacement revision and copies the scoped reference', () => {
  const review = fixture(), before = JSON.stringify(review), choices = assemblySourceRepairChoices(review, review.document, review.endpoints[0])
  expect(choices).toHaveLength(1); expect(choices[0].reference).toEqual({ ...axis(['left']), component: { occurrencePath: ['left'], definition: replacement } })
  expect(choices[0].key).toBe(JSON.stringify(choices[0].reference)); expect(choices[0].label).toContain('left · Cilindro R2.5')
  choices[0].reference.component.occurrencePath.push('mutated-local-copy'); expect(JSON.stringify(review)).toBe(before)
})
it.each(['other-occurrence', 'old-revision', 'other-source', 'wrong-support', 'unsupported'] as const)('does not offer %s as a substitute for the same component and support', fault => {
  const review = fixture(), face = review.scene.bodies[0].faces[0]
  if (fault === 'other-occurrence') face.selection.component.occurrencePath = ['right']
  if (fault === 'old-revision') face.selection.component.definition = { ...source }
  if (fault === 'other-source') face.selection.component.definition.id = 'another-part'
  if (fault === 'wrong-support') face.support = { kind: 'plane', point: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0], tolerance: 1e-7 }
  if (fault === 'unsupported') face.support = null
  expect(assemblySourceRepairChoices(review, review.document, review.endpoints[0])).toEqual([])
})
function nested(review: AssemblySourceUpdateReview): void {
  const document = review.document, scope = { id: 'original-subassembly', revision: 'sub-r1' }, sample = structuredClone(document.occurrences[0]), mate = document.mates[0]
  if (mate.type !== 'concentric') throw new Error('Original concentric declaration required')
  sample.id = 'pin'
  document.definitions.push({ kind: 'assembly', ...scope, name: 'Original reused subassembly', createdAt: document.createdAt, updatedAt: document.updatedAt,
    occurrences: [sample], mates: [{ ...mate, first: axis(['pin']), second: axis(['pin']) }] })
  document.occurrences = ['sub-a', 'sub-b'].map(id => ({ ...structuredClone(sample), id, definition: { ...scope } }))
  document.mates = []; review.endpoints[0] = { ...review.endpoints[0], locator: { scope, mateId: 'M', side: 'first' }, endpoint: axis(['pin']) }
  review.occurrences = [{ scope, occurrenceId: 'pin' }]; review.scene.bodies = [body(['sub-a', 'pin']), body(['sub-b', 'pin'])]
  review.document = validateAssemblyDocument(document)
}
it('repairs one reused scope declaration using the first real expansion without leaking its world path', () => {
  const review = fixture(); nested(review)
  const choices = assemblySourceRepairChoices(review, review.document, review.endpoints[0])
  expect(choices).toHaveLength(1); expect(choices[0].reference.component.occurrencePath).toEqual(['pin']); expect(choices[0].label).toContain('sub-a / pin')
  expect(markup(review)).toContain('<legend>Original reused subassembly · Original retained declaration · Referencia 1</legend>')
  expect(review.occurrences).toHaveLength(1); expect(assemblySourceActiveOccurrenceCount(review)).toBe(2)
})
it('keeps root declarations for two reused scopes distinct rather than matching only a path tail', () => {
  const review = fixture(); nested(review)
  review.endpoints[0].locator.scope = { id: review.document.id, revision: review.document.revision }; review.endpoints[0].endpoint = axis(['sub-b', 'pin'])
  const choices = assemblySourceRepairChoices(review, review.document, review.endpoints[0])
  expect(choices).toHaveLength(1); expect(choices[0].reference.component.occurrencePath).toEqual(['sub-b', 'pin']); expect(choices[0].label).toContain('sub-b / pin')
})
it('offers no synthetic native choices for a dormant scope or a suppressed occurrence with no scene', () => {
  const review = fixture(); nested(review); review.document.occurrences = []
  expect(assemblySourceRepairChoices(review, review.document, review.endpoints[0])).toEqual([])
  review.scene.bodies = []; expect(markup(review)).toContain('Se conserva la referencia pendiente')
})
it('does not turn component or principal declarations into a fitted face', () => {
  const review = fixture(), row = review.endpoints[0]
  row.endpoint = { occurrencePath: ['left'], definition: source }; expect(assemblySourceRepairChoices(review, review.document, row)).toEqual([])
  row.endpoint = { kind: 'principal-plane', component: { occurrencePath: ['left'], definition: source }, plane: 'XY' }
  expect(assemblySourceRepairChoices(review, review.document, row)).toEqual([])
})
it('retains separate exact body states while deduplicating repeated expansions only', () => {
  const review = fixture(), first = structuredClone(review.scene.bodies[0]), second = structuredClone(first)
  second.body = { bodyId: 'B2', sourceFeatureId: 'last2' }; second.faces[0].selection.body = structuredClone(second.body)
  review.scene.bodies.push(first, second)
  const choices = assemblySourceRepairChoices(review, review.document, review.endpoints[0])
  expect(choices).toHaveLength(2); expect(choices.map(value => value.reference.body?.bodyId)).toEqual(['B', 'B2'])
  expect(assemblySourceActiveOccurrenceCount(review)).toBe(2)
})
it('counts hidden active geometry once and excludes other revision/source bodies', () => {
  const review = fixture(); review.scene.bodies[0].visible = false
  const extra = body(['extra']); extra.component.definition = source; review.scene.bodies.push(extra, structuredClone(review.scene.bodies[0]))
  expect(assemblySourceActiveOccurrenceCount(review)).toBe(2)
})
it('offers only planes when repairing a saved plane support', () => {
  const review = fixture(), row = review.endpoints[0]
  if (!('kind' in row.endpoint) || row.endpoint.kind !== 'face') throw new Error('Original face fixture required')
  row.endpoint.support = 'plane'; const face = review.scene.bodies[0].faces[0]
  face.support = { kind: 'plane', point: [0, 0, 12], normal: [0, 0, 1], xDirection: [1, 0, 0], tolerance: 1e-7 }
  const choices = assemblySourceRepairChoices(review, review.document, row); expect(choices).toHaveLength(1); if (!('support' in choices[0].reference)) throw Error('Original simple support choice required'); expect(choices[0].reference.support).toBe('plane')
})
it('addresses equal mate IDs independently by scope revision and endpoint side', () => {
  const review = fixture(), row = review.endpoints[0]
  const keys = [assemblySourceEndpointKey(row), assemblySourceEndpointKey({ ...row, locator: { ...row.locator, side: 'second' } }),
    assemblySourceEndpointKey({ ...row, locator: { ...row.locator, scope: { ...row.locator.scope, revision: 'other' } } })]
  expect(new Set(keys).size).toBe(3)
})
function edgeReview(): AssemblySourceUpdateReview {
  const review = fixture(), original: AssemblyEdgeReference = { kind: 'edge', component: { occurrencePath: ['left'], definition: { ...source } }, body: { bodyId: 'B', sourceFeatureId: 'last' }, edge: { sourceFeatureId: 'last', key: 'edge-v1|original-line' }, support: 'line' }
  review.document.mates = [{ id: 'M', name: 'Original rack coupling', type: 'rack-pinion', first: axis(['right']), second: structuredClone(original), suppressed: false,
    conversion: { mode: 'diameter', override: null }, reverse: false, neutralRotation: [0, 0, 0, 1], angle: 0, neutralTravel: 0 }]
  review.endpoints[0] = { ...review.endpoints[0], locator: { ...review.endpoints[0].locator, side: 'second' }, endpoint: original }
  for (const body of review.scene.bodies) {
    const edge: AssemblySceneEdge = { selection: { component: structuredClone(body.component), body: structuredClone(body.body), edge: structuredClone(original.edge) },
      support: { kind: 'line', point: [1, 2, 3], axis: [1, 0, 0], tolerance: 1e-7 }, worldSupport: null, lines: [1, 2, 3, 2, 2, 3] }
    body.edges = [edge]
  }
  review.document = validateAssemblyDocument(review.document)
  return review
}
it('offers a detached exact native line-edge replacement with its body state and new revision', () => {
  const review = edgeReview(), before = JSON.stringify(review), choices = assemblySourceRepairChoices(review, review.document, review.endpoints[0])
  expect(choices).toHaveLength(1); if (!('kind' in choices[0].reference)) throw Error('Original simple edge choice required'); expect(choices[0].reference.kind).toBe('edge')
  expect(choices[0].reference.component).toEqual({ occurrencePath: ['left'], definition: replacement }); expect(choices[0].reference.body).toEqual({ bodyId: 'B', sourceFeatureId: 'last' })
  expect(choices[0].key).toBe(JSON.stringify(choices[0].reference)); expect(choices[0].label).toContain('Arista lineal · punto (1, 2, 3) · dirección (1, 0, 0)')
  choices[0].reference.component.occurrencePath[0] = 'changed'; expect(JSON.stringify(review)).toBe(before)
})
it.each(['unsupported', 'other-path', 'old-revision', 'other-source'] as const)('rejects an edge choice with %s instead of fitting an aggregate mesh', fault => {
  const review = edgeReview(), edge = review.scene.bodies[0].edges![0]
  if (fault === 'unsupported') edge.support = null
  else if (fault === 'other-path') edge.selection.component.occurrencePath = ['right']
  else if (fault === 'old-revision') edge.selection.component.definition = source
  else edge.selection.component.definition.id = 'other-source'
  expect(assemblySourceRepairChoices(review, review.document, review.endpoints[0])).toEqual([])
})
it('retains distinct body/edge identities while collapsing duplicate expanded edge DTOs only', () => {
  const review = edgeReview(), edge = review.scene.bodies[0].edges![0], other = structuredClone(edge)
  other.selection.body = { bodyId: 'B2', sourceFeatureId: 'last2' }
  review.scene.bodies[0].edges!.push(structuredClone(edge), other)
  const choices = assemblySourceRepairChoices(review, review.document, review.endpoints[0])
  expect(choices).toHaveLength(2); expect(choices.map(value => value.reference.body?.bodyId)).toEqual(['B', 'B2'])
})
it('renders a dedicated edge repair control and defers direction/zero continuity to native verification', () => {
  const html = markup(edgeReview())
  expect(html).toContain('aria-label="Arista de reparación M second"'); expect(html).toContain('Selecciona una arista lineal actual')
  expect(html).toContain('continuidad nativa de la dirección y del soporte'); expect(html).toContain('se requiere una nueva captura')
  expect(html).toMatch(/<button(?=[^>]*aria-label="Reparar referencia M second")(?=[^>]*disabled="")[^>]*>/)
})
it('blocks the edge repair selector while native update work is pending', () => {
  expect(markup(edgeReview(), { busy: true })).toMatch(/<select(?=[^>]*aria-label="Arista de reparación M second")(?=[^>]*disabled="")[^>]*>/)
})
it('offers no line reference from decorative edgeLines when the individual native catalog is absent', () => {
  const review = edgeReview(); review.scene.bodies.forEach(body => { body.edges = undefined; body.edgeLines = [1, 2, 3, 2, 2, 3] })
  expect(assemblySourceRepairChoices(review, review.document, review.endpoints[0])).toEqual([])
  expect(markup(review)).toContain('No hay una arista lineal compatible')
})
it('shows an empty affected-mate inventory without inventing a solved or valid result', () => {
  const review = fixture(); review.endpoints = []
  const before = serializeAssemblyDocument(review.document), html = markup(review)
  expect(html).toContain('No hay referencias de relaciones afectadas'); expect(html).not.toContain('grados de libertad'); expect(html).not.toContain('native-proof')
  expect(serializeAssemblyDocument(review.document)).toBe(before)
})
function surfaceReview(): AssemblySourceUpdateReview {
  const review = fixture(), original: AssemblyCylinderSurfaceReference = { ...axis(['left']), support: 'cylinder-surface' }
  review.document.mates = [{ id: 'M', name: 'Original surface tangency', type: 'tangent', first: { kind: 'principal-plane', component: null, plane: 'XY' }, second: original, side: 'positive', suppressed: false }]
  review.endpoints[0] = { ...review.endpoints[0], locator: { ...review.endpoints[0].locator, side: 'second' }, endpoint: original }
  review.document = validateAssemblyDocument(review.document); return review
}
it('repairs explicit cylindrical-surface purpose with an exact detached current face rather than an axis', () => {
  const review = surfaceReview(), before = JSON.stringify(review), choices = assemblySourceRepairChoices(review, review.document, review.endpoints[0])
  expect(choices).toHaveLength(1); expect(choices[0].reference).toMatchObject({ kind: 'face', support: 'cylinder-surface', component: { occurrencePath: ['left'], definition: replacement }, body: { bodyId: 'B', sourceFeatureId: 'last' } })
  expect(choices[0].label).toContain('Superficie cilíndrica'); choices[0].reference.component.occurrencePath[0] = 'local-mutation'
  expect(JSON.stringify(review)).toBe(before); expect(markup(review)).toContain('Cara de reparación M second')
})
it.each(['other-path', 'old-revision', 'other-source', 'plane', 'unsupported'] as const)('excludes %s from a cylindrical-surface repair instead of coercing support purpose', fault => {
  const review = surfaceReview(), candidate = review.scene.bodies[0].faces[0]
  if (fault === 'other-path') candidate.selection.component.occurrencePath = ['right']
  if (fault === 'old-revision') candidate.selection.component.definition = source
  if (fault === 'other-source') candidate.selection.component.definition.id = 'other'
  if (fault === 'plane') candidate.support = { kind: 'plane', point: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0], tolerance: 1e-7 }
  if (fault === 'unsupported') candidate.support = null
  expect(assemblySourceRepairChoices(review, review.document, review.endpoints[0])).toEqual([])
})
it('keeps legacy cylindrical axis repair purpose after adding explicit surface repair', () => {
  const review = fixture(), choices = assemblySourceRepairChoices(review, review.document, review.endpoints[0])
  expect(choices).toHaveLength(1); if (!('support' in choices[0].reference)) throw Error('Original axis choice required'); expect(choices[0].reference.support).toBe('axis'); expect(choices[0].label).not.toContain('Superficie cilíndrica')
})
it.each([['skew-cylinder-tangent', 'first'], ['skew-cylinder-tangent', 'second'], ['parallel-cylinder-tangent', 'first'], ['parallel-cylinder-tangent', 'second']] as const)('retains %s %s surface purpose during manual current-source repair', (type, side) => {
  const review = surfaceReview(), current: AssemblyCylinderSurfaceReference = { ...axis(['left']), support: 'cylinder-surface' }, other: AssemblyCylinderSurfaceReference = { ...axis(['right']), support: 'cylinder-surface' }
  review.document.mates = [{ id: 'M', name: 'Original cylinder pair', type, first: side === 'first' ? current : other, second: side === 'second' ? current : other, branch: { kind: 'external' }, suppressed: false }]
  review.endpoints[0] = { ...review.endpoints[0], locator: { ...review.endpoints[0].locator, side }, endpoint: current }
  review.document = validateAssemblyDocument(review.document)
  const before = JSON.stringify(review), choices = assemblySourceRepairChoices(review, review.document, review.endpoints[0])
  expect(choices).toHaveLength(1); expect(choices[0].reference).toMatchObject({ support: 'cylinder-surface', component: { occurrencePath: ['left'], definition: replacement }, body: { bodyId: 'B', sourceFeatureId: 'last' } })
  expect(markup(review)).toContain('Cara de reparación M ' + side); expect(JSON.stringify(review)).toBe(before)
})
function sphereReview(type: 'plane-sphere-tangent' | 'sphere-sphere-tangent' | 'cylinder-sphere-tangent' = 'plane-sphere-tangent', side: 'first' | 'second' = 'second'): AssemblySourceUpdateReview {
  const review = fixture(), current: AssemblySphereSurfaceReference = { ...axis(['left']), support: 'sphere-surface' }, sphereOther: AssemblySphereSurfaceReference = { ...axis(['right']), support: 'sphere-surface' }, cylinderOther: AssemblyCylinderSurfaceReference = { ...axis(['right']), support: 'cylinder-surface' }, plane = { kind: 'principal-plane' as const, component: null, plane: 'XY' as const }
  const common = { id: 'M', name: 'Original spherical relation', suppressed: false }
  review.document.mates = type === 'plane-sphere-tangent' ? [{ ...common, type, first: side === 'first' ? current : plane, second: side === 'second' ? current : plane, side: 'positive' }]
    : type === 'sphere-sphere-tangent' ? [{ ...common, type, first: side === 'first' ? current : sphereOther, second: side === 'second' ? current : sphereOther, branch: { kind: 'external' } }]
      : [{ ...common, type, first: side === 'first' ? current : cylinderOther, second: side === 'second' ? current : cylinderOther, branch: { kind: 'external' } }]
  review.endpoints[0] = { ...review.endpoints[0], locator: { ...review.endpoints[0].locator, side }, endpoint: current }
  review.scene.bodies[0].faces[0].support = null; review.scene.bodies[0].faces[0].sphereSurface = { kind: 'sphere-surface', center: [0, 0, 0], radius: 3, tolerance: 1e-7 }
  review.document = validateAssemblyDocument(review.document); return review
}
it.each([['plane-sphere-tangent', 'first'], ['plane-sphere-tangent', 'second'], ['sphere-sphere-tangent', 'first'], ['sphere-sphere-tangent', 'second'], ['cylinder-sphere-tangent', 'first'], ['cylinder-sphere-tangent', 'second']] as const)('repairs %s sphere endpoint %s without an axis fallback', (type, side) => {
  const review = sphereReview(type, side), before = JSON.stringify(review), choices = assemblySourceRepairChoices(review, review.document, review.endpoints[0])
  expect(choices).toHaveLength(1); expect(choices[0].reference).toMatchObject({ support: 'sphere-surface', component: { occurrencePath: ['left'], definition: replacement }, body: { bodyId: 'B', sourceFeatureId: 'last' } })
  expect(choices[0].label).toContain('Superficie esférica R3 · centro (0, 0, 0)'); expect(markup(review)).toContain('Cara de reparación M ' + side)
  choices[0].reference.component.occurrencePath[0] = 'local'; expect(JSON.stringify(review)).toBe(before)
})
it.each(['other-path', 'old-revision', 'other-source', 'missing-sphere-metadata', 'cylinder-only'] as const)('rejects %s spherical repair data instead of substituting the old face helper', fault => {
  const review = sphereReview(), candidate = review.scene.bodies[0].faces[0]
  if (fault === 'other-path') candidate.selection.component.occurrencePath = ['right']
  if (fault === 'old-revision') candidate.selection.component.definition = source
  if (fault === 'other-source') candidate.selection.component.definition.id = 'other'
  if (fault === 'missing-sphere-metadata' || fault === 'cylinder-only') candidate.sphereSurface = undefined
  if (fault === 'cylinder-only') candidate.support = { kind: 'cylinder', point: [0, 0, 0], axis: [0, 0, 1], xDirection: [1, 0, 0], radius: 3, tolerance: 1e-7 }
  expect(assemblySourceRepairChoices(review, review.document, review.endpoints[0])).toEqual([])
})
