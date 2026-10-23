import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AssemblyDocumentSourceUpdatePanel, { assemblyDocumentUpdatePending } from './AssemblyDocumentSourceUpdatePanel'
import { assemblyDocumentUpdateChoices, assemblyDocumentUpdateEndpointKey, assemblyDocumentUpdateReferenceKey,
  type AssemblyDocumentUpdateReview, type AssemblyDocumentUpdateDecisions } from '../cad/kernel.assembly-document-update-types'
import type { AssemblyScene, AssemblySceneFace } from '../cad/kernel.assembly-types'
import { createEmptyAssembly } from '../examples/assembly'
import { identityRigidPose } from '../model/rigidPose'

// Original symbolic catalog only. No native body, worker or accepted solve.
const source = { id: 'original-source', revision: 'r0' }, replacement = { ...source, revision: 'r1' }
const material = { id: 'original-material', revision: 'r1' }, scope = { id: 'original-parent', revision: 'r0' }
const component = { occurrencePath: ['renamed'], definition: material }, body = { bodyId: 'original-body', sourceFeatureId: 'original-solid' }
function scene(): AssemblyScene {
  const face: AssemblySceneFace = { selection: { component, body, face: { sourceFeatureId: 'original-solid', key: 'face-v1|original-current' } },
    support: { kind: 'plane', point: [2,0,0], normal: [1,0,0], xDirection: [0,1,0], tolerance: 1e-7 }, worldSupport: null, vertices: [], triangles: [] }
  return { kind: 'assembly-scene', sceneId: 'display-only', bodies: [{ component, body, name: 'Original renamed child', visible: true, worldPose: identityRigidPose(),
    faces: [face], vertices: [], normals: [], triangles: [], edgeLines: [], volume: 0, area: 0, solidCount: 0, bounds: { min: [0,0,0], max: [0,0,0] },
    vertexPoints: [{ selection: { component, body, vertex: { sourceFeatureId: 'original-solid', key: 'vertex-v1|' + 'b'.repeat(64) } }, point: [2,0,0], worldPoint: [2,0,0], tolerance: 1e-7 }] }],
    bounds: null, visibleBounds: null, volume: 0, area: 0, solidCount: 0, prototypeCount: 0, warnings: [] }
}
function review(): AssemblyDocumentUpdateReview {
  const document = createEmptyAssembly('Original staged declarations'), catalog = scene()
  return { kind: 'assembly-document-source-review', reviewId: 'original-private-review', source, replacement, document, scene: catalog,
    replacementCatalog: catalog, occurrences: [{ scope, occurrenceId: 'left' }], capturedMates: [], unresolvedEndpoints: [],
    components: [{ path: [], definition: replacement, kind: 'assembly', name: 'Original source frame' }, { path: ['renamed'], definition: material, kind: 'part', name: 'Original renamed child' }],
    endpoints: [{ locator: { scope, mateId: 'original-width', side: 'width-0' }, endpoint: { kind: 'face', support: 'plane', component: { occurrencePath: ['left','deleted'], definition: { ...material, revision: 'r0' } }, body,
      face: { sourceFeatureId: 'old-solid', key: 'face-v1|old-unattested' } }, boundary: { occurrencePath: ['left'], source }, suffix: ['deleted'], status: 'needs-repair', beforeResolution: 'current', afterResolution: 'missing-path' }] }
}
const empty = (): AssemblyDocumentUpdateDecisions => ({ repairs: [], removed: [], recapture: [], unlocked: [] })
it('keeps both angular role labels and explicit pending decisions in subassembly-source repair',()=>{
  const r=review();r.endpoints[0].locator.side='angle-0';r.endpoints.push({...structuredClone(r.endpoints[0]),locator:{...r.endpoints[0].locator,side:'angle-1'}})
  const output=html(r);expect(output).toContain('Plano angular A de bisagra');expect(output).toContain('Plano angular B de bisagra')
  expect(output).toContain('2 decisiones pendientes');expect(output).toContain('angle-0');expect(output).toContain('angle-1')
})
const html = (r: AssemblyDocumentUpdateReview, d = empty(), busy = false, cancelable = false) => renderToStaticMarkup(<AssemblyDocumentSourceUpdatePanel review={r} decisions={d} busy={busy} cancelable={cancelable}
  onRepair={() => undefined} onMateDecision={() => undefined} onSolve={() => undefined} onCancel={() => undefined} />)
function repaired(r: AssemblyDocumentUpdateReview): AssemblyDocumentUpdateDecisions {
  return { ...empty(), repairs: r.endpoints.map(endpoint => ({ locator: endpoint.locator, reference: assemblyDocumentUpdateChoices(r, endpoint)[0].reference })) }
}
it('offers renamed current descendants inside the exact source boundary without auto-selecting or mutating the review', () => {
  const r = review(), before = JSON.stringify(r), choices = assemblyDocumentUpdateChoices(r, r.endpoints[0])
  expect(choices).toHaveLength(1); expect(choices[0].reference).toMatchObject({ component: { occurrencePath: ['left','renamed'], definition: material }, body, support: 'plane' })
  const output = html(r)
  expect(output).toContain('renamed · original-body'); expect(output).toContain('1 decisiones pendientes')
  expect(output).toMatch(/<option value="" selected="">Selecciona una referencia actual/)
  expect(output).toMatch(/<button(?=[^>]*aria-label="Resolver actualización de subensamblaje")(?=[^>]*disabled="")[^>]*>/)
  expect(output).not.toContain('Aplicar ensamblaje'); expect(JSON.stringify(r)).toBe(before)
  if (!('kind' in choices[0].reference)) throw new Error('Original face choice missing')
  choices[0].reference.component!.occurrencePath[0] = 'mutated-copy'; expect(JSON.stringify(r)).toBe(before)
})
it('requires every grouped role explicitly, rejects stale choice data and permits whole-mate removal', () => {
  const r = review(); r.endpoints.push({ ...structuredClone(r.endpoints[0]), locator: { ...r.endpoints[0].locator, side: 'tab-1' } })
  const decisions = repaired(r)
  expect(assemblyDocumentUpdatePending(r, empty())).toBe(2)
  expect(assemblyDocumentUpdatePending(r, { ...decisions, repairs: decisions.repairs.slice(0,1) })).toBe(1)
  expect(assemblyDocumentUpdatePending(r, decisions)).toBe(0)
  const stale = structuredClone(decisions)
  if (!('kind' in stale.repairs[0].reference) || stale.repairs[0].reference.kind !== 'face') throw new Error('Original face missing')
  stale.repairs[0].reference.face.key = 'face-v1|stale'
  expect(assemblyDocumentUpdatePending(r, stale)).toBe(1)
  const removed = { ...empty(), removed: [{ scope, mateId: 'original-width' }] }
  expect(assemblyDocumentUpdatePending(r, removed)).toBe(0)
  expect(html(r, removed)).toContain('Relación marcada para eliminar')
  expect(html(r, removed)).toMatch(/<select(?=[^>]*aria-label="Referencia de reparación )(?=[^>]*disabled="")[^>]*>/)
})
it.each(['concentric','lock','gear','screw','rack-pinion'] as const)('requires an explicit %s capture decision in addition to repaired roles', type => {
  const r = review(); r.capturedMates = [{ scope, mateId: 'original-width', type, suppressed: true, affectedRoles: ['width-0'] }]
  const d = repaired(r), locator = { scope, mateId: 'original-width' }
  expect(assemblyDocumentUpdatePending(r, d)).toBe(1)
  expect(assemblyDocumentUpdatePending(r, { ...d, recapture: [locator] })).toBe(0)
  expect(assemblyDocumentUpdatePending(r, { ...d, unlocked: [locator] })).toBe(type === 'concentric' ? 0 : 1)
  expect(assemblyDocumentUpdatePending(r, { ...d, recapture: [locator], unlocked: [locator] })).toBe(1)
  const output = html(r, d)
  expect(output).toContain('La captura puede rechazarse en un ámbito inactivo')
  expect(output.includes('Liberar bloqueo de giro')).toBe(type === 'concentric')
  expect(assemblyDocumentUpdatePending(r, { ...empty(), removed: [locator] })).toBe(0)
})
it('keeps native vertex, plane and component-frame purposes separate and retains exact body/producer data', () => {
  const r = review(), endpoint = r.endpoints[0]
  endpoint.endpoint = { kind: 'vertex', support: 'point', component: { occurrencePath: ['left','deleted'], definition: material }, body, vertex: { sourceFeatureId: 'old', key: 'vertex-v1|' + 'a'.repeat(64) } }
  const points = assemblyDocumentUpdateChoices(r, endpoint)
  expect(points).toHaveLength(1); expect(points[0].reference).toMatchObject({ kind: 'vertex', support: 'point', body, vertex: { sourceFeatureId: 'original-solid' }, component: { occurrencePath: ['left','renamed'] } })
  endpoint.endpoint = { kind: 'principal-plane', component: { occurrencePath: ['left'], definition: source }, plane: 'YZ' }
  const frames = assemblyDocumentUpdateChoices(r, endpoint)
  expect(frames).toHaveLength(6); expect(frames.every(value => 'kind' in value.reference && value.reference.kind === 'principal-plane')).toBe(true)
  expect(frames.some(value => 'kind' in value.reference && value.reference.kind === 'principal-plane' && JSON.stringify(value.reference.component?.occurrencePath) === '["left"]')).toBe(true)
  expect(new Set(frames.map(value => assemblyDocumentUpdateReferenceKey(value.reference))).size).toBe(6)
})
it('keeps busy controls disabled while allowing explicit cancellation only when cancelable', () => {
  const r = review(), output = html(r, repaired(r), true)
  expect(output).toMatch(/<select(?=[^>]*aria-label="Referencia de reparación )(?=[^>]*disabled="")[^>]*>/)
  expect(output).toMatch(/<button(?=[^>]*aria-label="Resolver actualización de subensamblaje")(?=[^>]*disabled="")[^>]*>/)
  expect(output).toMatch(/<button(?=[^>]*aria-label="Cancelar actualización de subensamblaje")(?=[^>]*disabled="")[^>]*>/)
  expect(html(r, repaired(r), true, true)).toMatch(/<button(?=[^>]*aria-label="Cancelar actualización de subensamblaje")(?![^>]*disabled="")[^>]*>/)
  expect(html(r, repaired(r))).toMatch(/<button(?=[^>]*aria-label="Resolver actualización de subensamblaje")(?![^>]*disabled="")[^>]*>/)
})
it('preserves unresolved diagnostics and empty compatible catalogs without manufacturing a replacement', () => {
  const r = review(); r.replacementCatalog.bodies = []
  r.unresolvedEndpoints = [{ locator: r.endpoints[0].locator, endpoint: r.endpoints[0].endpoint, reason: 'stale-path', boundaryCrossed: false }]
  const output = html(r)
  expect(output).toContain('No hay una referencia compatible'); expect(output).toContain('no atribuyen automáticamente el problema')
  expect(assemblyDocumentUpdatePending(r, empty())).toBe(1)
  expect(assemblyDocumentUpdateEndpointKey(r.endpoints[0].locator)).toContain('width-0')
})
