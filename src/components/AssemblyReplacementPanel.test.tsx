import { isAssemblyProfileCenterEndpoint } from '../model/assemblyMateEndpoints'
import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AssemblyReplacementPanel, { assemblyReplacementChoices, assemblyReplacementPending, replacementEndpointKey } from './AssemblyReplacementPanel'
import type { AssemblyReplacementDecisions, AssemblyReplacementReview } from '../cad/kernel.assembly-replacement'
import type { AssemblyAxisReference, AssemblyVertexReference } from '../model/assemblyDocument'
import { createEmptyAssembly } from '../examples/assembly'
import { identityRigidPose } from '../model/rigidPose'
it('labels both hinge angular replacement roles and keeps their choices material-planar',()=>{
  for(const [side,label]of [['angle-0','Plano angular A de bisagra'],['angle-1','Plano angular B de bisagra']]as const){
    const r=fixture(),endpoint=r.endpoints[0];endpoint.locator.side=side
    if(!('kind'in endpoint.endpoint)||endpoint.endpoint.kind!=='face')throw Error('Original material face')
    endpoint.endpoint.support='plane'
    for(const b of r.replacementCatalog.bodies)for(const f of b.faces)f.support={kind:'plane',point:[10,0,2],normal:[1,0,0],xDirection:[0,1,0],tolerance:1e-7}
    const choices=assemblyReplacementChoices(r,endpoint);expect(choices.length).toBeGreaterThan(0)
    expect(choices.every(c=>'kind'in c.reference&&c.reference.kind==='face'&&c.reference.support==='plane')).toBe(true)
    expect(markup(r)).toContain(label)
  }
})
import type { AssemblyScene, AssemblySceneFace } from '../cad/kernel.assembly-types'

// Original symbolic UI DTOs only. No kernel, BRep or browser interaction runs.
const source = { id: 'original-A', revision: 'r1' }, replacement = { id: 'original-B', revision: 'r2' }
it('repairs a profile role atomically with an explicit current face, LINE and either parameter sense',()=>{
  const review=fixture(),endpoint=review.endpoints[0],old=endpoint.endpoint
  if(!('kind'in old)||old.kind!=='face')throw Error('Original face fixture required')
  endpoint.endpoint={face:{component:old.component,body:old.body,face:old.face},axis:{edge:{sourceFeatureId:'extrude',key:'edge-v1|'+'c'.repeat(64)},sense:-1}}
  const body=review.replacementCatalog.bodies[0],face=body.faces[0]
  face.support={kind:'plane',point:[0,0,3],normal:[0,0,1],xDirection:[1,0,0],tolerance:1e-7}
  body.edges=[{selection:{component:structuredClone(body.component),body:structuredClone(body.body),edge:{sourceFeatureId:'extrude',key:'edge-v1|'+'d'.repeat(64)}},support:{kind:'line',point:[-3,-2,3],axis:[1,0,0],tolerance:1e-7},worldSupport:null,lines:[]}]
  const before=structuredClone(review),choices=assemblyReplacementChoices(review,endpoint)
  expect(choices).toHaveLength(2)
  for(const [i,sense]of [1,-1].entries())expect(choices[i].reference).toEqual({face:{component:endpoint.desiredComponent,body:body.body,face:face.selection.face},axis:{edge:body.edges[0].selection.edge,sense}})
  expect(choices[0].key).not.toBe(choices[1].key);expect(review).toEqual(before)
  const reference=choices[0].reference;if(!isAssemblyProfileCenterEndpoint(reference) || !reference.axis)throw Error('Material profile axis required')
  reference.face.component.occurrencePath[0]='changed';reference.axis.sense=-1;expect(review).toEqual(before)
  endpoint.endpoint={...endpoint.endpoint,axis:null};expect(assemblyReplacementChoices(review,endpoint)).toHaveLength(1)
})
function pointReplacement():AssemblyReplacementReview{
  const review=fixture(),endpoint=review.endpoints[0],old=endpoint.endpoint
  if(!('kind' in old)||old.kind!=='face')throw Error('Original face fixture required')
  endpoint.endpoint={kind:'vertex',component:structuredClone(old.component),body:structuredClone(old.body),vertex:{sourceFeatureId:'extrude',key:'vertex-v1|'+'a'.repeat(64)},support:'point'}
  endpoint.locator.side='source'
  for(const body of review.replacementCatalog.bodies)body.vertexPoints=[{selection:{component:structuredClone(body.component),body:structuredClone(body.body),vertex:{sourceFeatureId:'extrude',key:'vertex-v1|'+'b'.repeat(64)}},point:[2,3,4],worldPoint:[2,3,4],tolerance:1e-7}]
  return review
}
it('offers detached current replacement vertices under the exact desired selected occurrence',()=>{
  const review=pointReplacement(),before=structuredClone(review),endpoint=review.endpoints[0],choices=assemblyReplacementChoices(review,endpoint)
  expect(choices).toHaveLength(1);const ref=choices[0].reference as AssemblyVertexReference
  expect(ref.kind).toBe('vertex');expect(ref.support).toBe('point');expect(ref.component).toEqual(endpoint.desiredComponent);expect(ref.component.occurrencePath).toEqual(['left','part'])
  expect(ref.vertex.key).toBe('vertex-v1|'+'b'.repeat(64));ref.component.occurrencePath[0]='changed';expect(review).toEqual(before)
  const second=structuredClone(endpoint);second.desiredComponent.occurrencePath=['right','part']
  expect(assemblyReplacementChoices(review,second)[0].reference).toMatchObject({component:{occurrencePath:['right','part']}})
  expect(markup(review)).toContain('· Origen ·')
  review.replacementCatalog.bodies.forEach(b=>{b.vertexPoints=[];b.vertices=[2,3,4]});expect(assemblyReplacementChoices(review,endpoint)).toEqual([])
})
it('rejects replacement vertex foreign body/source/path/revision and preserves point purpose',()=>{
  for(const change of ['body','source','path','revision'] as const){
    const review=pointReplacement(),v=review.replacementCatalog.bodies[0].vertexPoints![0]
    if(change==='body')v.selection.body!.bodyId='foreign'
    if(change==='source')v.selection.vertex.sourceFeatureId='foreign'
    if(change==='path')v.selection.component.occurrencePath=['foreign']
    if(change==='revision')v.selection.component.definition.revision='foreign'
    expect(assemblyReplacementChoices(review,review.endpoints[0])).toEqual([])
  }
  const review=pointReplacement();review.endpoints[0].desiredComponent.definition.revision='other'
  expect(assemblyReplacementChoices(review,review.endpoints[0])).toEqual([])
})
it('keeps all three replacement role labels and independent point repair decisions',()=>{
  const review=pointReplacement(),original=review.endpoints[0]
  review.endpoints=(['source','target','mirror'] as const).map(side=>({...structuredClone(original),locator:{...original.locator,side},
    ...(side==='mirror'?{endpoint:{kind:'principal-plane' as const,component:structuredClone((original.endpoint as AssemblyVertexReference).component),plane:'YZ' as const}}:{})}))
  expect(assemblyReplacementPending(review,empty())).toBe(3)
  const html=markup(review);for(const label of ['Origen','Destino','Plano de simetría'])expect(html).toContain('· '+label+' ·')
  const decisions=empty(),choice=assemblyReplacementChoices(review,review.endpoints[0])[0]
  decisions.repairs.push({locator:review.endpoints[0].locator,reference:choice.reference});expect(assemblyReplacementPending(review,decisions)).toBe(2)
})
const empty = (): AssemblyReplacementDecisions => ({ repairs: [], removed: [], recapture: [] })
function fixture(): AssemblyReplacementReview {
  const document = createEmptyAssembly('Original symbolic replacement'), scope = { id: document.id, revision: document.revision }
  const component = { occurrencePath: ['catalog-part'], definition: { ...replacement } }
  const body = { bodyId: 'body', sourceFeatureId: 'extrude' }, face = { sourceFeatureId: 'extrude', key: 'face-v1|' + 'a'.repeat(64) }
  const nativeFace: AssemblySceneFace = { selection: { component, body, face },
    support: { kind: 'cylinder', point: [0, 0, 0], axis: [0, 0, 1], xDirection: [1, 0, 0], radius: 2.5, tolerance: 1e-7 }, worldSupport: null, vertices: [], triangles: [] }
  const scene: AssemblyScene = { kind: 'assembly-scene', sceneId: 'symbolic-only', bodies: [], volume: 0, area: 0, solidCount: 0,
    prototypeCount: 0, bounds: null, visibleBounds: null, warnings: [] }
  const replacementCatalog = structuredClone(scene)
  replacementCatalog.bodies.push({ component, body, name: 'Original catalog body', visible: true, worldPose: identityRigidPose(),
    vertices: [], normals: [], triangles: [], edgeLines: [], faces: [nativeFace], volume: 0, area: 0, solidCount: 0,
    bounds: { min: [0, 0, 0], max: [0, 0, 0] } })
  const endpoint: AssemblyAxisReference = { kind: 'face', component: { occurrencePath: ['left', 'part'], definition: { ...source } }, body, face, support: 'axis' }
  const locator = { scope, mateId: 'original-mate', side: 'first' as const }
  document.mates.push({ id: locator.mateId, name: 'Relación original', type: 'parallel', suppressed: false,
    first: { kind: 'principal-plane', component: null, plane: 'XY' }, second: { kind: 'principal-plane', component: null, plane: 'XY' }, alignment: 'aligned' })
  return { kind: 'assembly-replacement-review', reviewId: 'staging-only', document, scene, source, replacement,
    replacementCatalog, scopeMap: [{ beforeScope: { id: 'sub', revision: 'r1' }, afterScope: { id: 'sub', revision: 'fork' }, scopePath: ['left'] }],
    expandedPaths: [['left', 'part']], occurrences: [{ originalScope: scope, scope, occurrenceId: 'part' }],
    endpoints: [{ originalLocator: structuredClone(locator), locator, endpoint, desiredComponent: { occurrencePath: ['left', 'part'], definition: { ...replacement } },
      retainFrame: false, status: 'needs-repair', message: 'Elige una referencia nueva.' }], mechanicalMates: [] }
}
function markup(review = fixture(), decisions = empty(), busy = false, cancelable = false) {
  return renderToStaticMarkup(<AssemblyReplacementPanel review={review} decisions={decisions} busy={busy} cancelable={cancelable}
    onRepair={() => undefined} onDecisionsChange={() => undefined} onSolve={() => undefined} onCancel={() => undefined} />)
}
it('keeps replacement staging separate from Apply and labels isolation of the selected expansion', () => {
  const review = fixture(), before = JSON.stringify(review), html = markup(review)
  expect(html).toContain('otras copias conservan sus definiciones originales'); expect(html).toContain('coordenadas locales')
  expect(html).toContain('historial conservan el documento confirmado'); expect(html).not.toContain('Aplicar ensamblaje')
  expect(html).toContain('Relación original · Referencia 1'); expect(html).not.toContain('<legend>original-mate first')
  expect(html).toMatch(/<button(?=[^>]*aria-label="Resolver sustitución de pieza")(?=[^>]*disabled="")[^>]*>/)
  expect(JSON.stringify(review)).toBe(before)
})
it('identifies the directed guide separately from the gear carrier when replacing a component', () => {
  const review = fixture(); review.endpoints[0].locator.side = 'guide'; review.endpoints[0].originalLocator.side = 'guide'
  const before = JSON.stringify(review), html = markup(review)
  expect(html).toContain('Relación original · Eje guía'); expect(html).toContain('aria-label="Referencia de sustitución original-mate guide"')
  expect(assemblyReplacementChoices(review, review.endpoints[0])).toHaveLength(1); expect(JSON.stringify(review)).toBe(before)
})
it('builds detached same-purpose choices at the exact desired path and keeps native identity fields', () => {
  const review = fixture(), before = JSON.stringify(review), choices = assemblyReplacementChoices(review, review.endpoints[0])
  expect(choices).toHaveLength(1)
  expect(choices[0].reference).toEqual({ ...review.endpoints[0].endpoint, component: review.endpoints[0].desiredComponent })
  expect(choices[0].label).toContain('Eje cilíndrico R2.5'); expect(choices[0].label).toContain('Original catalog body')
  const reference = choices[0].reference as AssemblyAxisReference; reference.component.occurrencePath[0] = 'mutated'
  expect(JSON.stringify(review)).toBe(before)
})
it('does not offer a catalog for another source identity or a different analytic purpose', () => {
  const review = fixture(), endpoint = review.endpoints[0]
  endpoint.desiredComponent.definition.id = 'not-catalog-part'; expect(assemblyReplacementChoices(review, endpoint)).toEqual([])
  endpoint.desiredComponent.definition = { ...replacement }
  review.replacementCatalog.bodies[0].faces[0].support = { kind: 'plane', point: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0], tolerance: 1e-7 }
  expect(assemblyReplacementChoices(review, endpoint)).toEqual([])
})
it('requires explicit repair and mechanical recapture decisions separately, with removal dominating both', () => {
  const review = fixture(), locator = review.endpoints[0].locator
  review.mechanicalMates.push({ scope: locator.scope, mateId: locator.mateId, type: 'gear', requiresRecapture: true })
  const decisions = empty(); expect(assemblyReplacementPending(review, decisions)).toBe(2)
  decisions.repairs.push({ locator, reference: assemblyReplacementChoices(review, review.endpoints[0])[0].reference })
  expect(assemblyReplacementPending(review, decisions)).toBe(1)
  decisions.recapture.push({ scope: locator.scope, mateId: locator.mateId }); expect(assemblyReplacementPending(review, decisions)).toBe(0)
  expect(markup(review, decisions)).toMatch(/<button(?=[^>]*aria-label="Resolver sustitución de pieza")(?![^>]*disabled=)[^>]*>/)
  decisions.repairs = []; decisions.recapture = []; decisions.removed.push({ scope: locator.scope, mateId: locator.mateId })
  expect(assemblyReplacementPending(review, decisions)).toBe(0); expect(markup(review, decisions)).toContain('Relación marcada para eliminar')
})
it('keeps both busy cancel policy and mechanical recapture visible without pretending a chart is retained', () => {
  const review = fixture(), locator = review.endpoints[0].locator
  review.mechanicalMates.push({ scope: locator.scope, mateId: locator.mateId, type: 'screw', requiresRecapture: true })
  const html = markup(review, empty(), true, true)
  expect(html).toContain('Solicitar nueva captura de tornillo · Relación original'); expect(html).toContain('ceros mecánicos')
  expect(html).toMatch(/<select(?=[^>]*aria-label="Referencia de sustitución original-mate first")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<button(?=[^>]*aria-label="Cancelar sustitución de pieza")(?![^>]*disabled=)[^>]*>/)
  expect(markup(review, empty(), true, false)).toMatch(/<button(?=[^>]*aria-label="Cancelar sustitución de pieza")(?=[^>]*disabled="")[^>]*>/)
})
it('disambiguates endpoint scope, revision and side even with delimiter-bearing IDs', () => {
  const review = fixture(), locator = review.endpoints[0].locator
  expect(replacementEndpointKey(locator)).not.toBe(replacementEndpointKey({ ...locator, side: 'second' }))
  expect(replacementEndpointKey(locator)).not.toBe(replacementEndpointKey({ ...locator, scope: { ...locator.scope, revision: 'other' } }))
  expect(replacementEndpointKey({ ...locator, mateId: 'a/b' })).not.toBe(replacementEndpointKey({ ...locator, mateId: 'a', scope: { id: 'b', revision: locator.scope.revision } }))
})
