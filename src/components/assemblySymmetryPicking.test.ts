import { expect, it } from 'vitest'
import { validateAssemblyPlaneReference } from '../model/assemblyDocument'
import { sameSymmetryReference, currentSymmetryPick, nextSymmetryPick, scopedAssemblySymmetryPick, symmetryPickForReference, type SymmetryPickTicket } from './assemblySymmetryPicking'
import type { AssemblyScene, AssemblySceneFace, AssemblySceneVertex, AssemblySceneEdge } from '../cad/kernel.assembly-types'
// Synthetic detached scene metadata tests only; these fixtures do not claim
// native point/support authority. The worker boundary stays separate.
const component = { occurrencePath: ['scope', 'part'], definition: { id: 'part', revision: 'r1' } }, body = { bodyId: 'body', sourceFeatureId: 'solid' }
const vertex: AssemblySceneVertex = { selection: { component, body, vertex: { sourceFeatureId: 'solid', key: 'vertex-v1|' + 'a'.repeat(64) } }, point: [1,2,3], worldPoint: [4,5,6], tolerance: 1e-7 }
const plane = { selection: { component, body, face: { sourceFeatureId: 'solid', key: 'face-v1|plane' } }, support: { kind: 'plane', point: [0,0,0], normal: [1,0,0], xDirection: [0,1,0], tolerance: 1e-7 } } as AssemblySceneFace
const cylinder = { selection: { component, body, face: { sourceFeatureId: 'solid', key: 'face-v1|cylinder' } }, support: { kind: 'cylinder', point: [0,0,0], axis: [0,0,1], xDirection: [1,0,0], radius: 2, tolerance: 1e-7 } } as AssemblySceneFace
const sphere = { selection: { component, body, face: { sourceFeatureId: 'solid', key: 'face-v1|sphere' } }, support: null, sphereSurface: { kind: 'sphere-surface', center: [0,0,0], radius: 2, tolerance: 1e-7 } } as AssemblySceneFace
const edge = { selection: { component, body, edge: { sourceFeatureId: 'solid', key: 'edge-v1|line' } }, support: { kind: 'line', point: [0,0,0], axis: [0,0,1], tolerance: 1e-7 } } as AssemblySceneEdge
function scene(): AssemblyScene { return structuredClone({ sceneId: 'current', bodies: [{ visible: true, component, body, vertexPoints: [vertex], faces: [plane,cylinder,sphere], edges: [edge] }] }) as AssemblyScene }
const ticket: SymmetryPickTicket = { slot: 0, family: 'point', producer: 'vertex', lineProducer: null, signature: 'doc', scope: '["scope"]', generation: 4, sceneId: 'current' }
const purpose = (value: ReturnType<typeof scopedAssemblySymmetryPick>) => value && 'support' in value.reference ? value.reference.support : null
const context = { signature: 'doc', scope: '["scope"]', generation: 4, sceneId: 'current', family: 'point' as const, blocked: false }
it('uses the unique visible current vertex rather than payload coordinates and scopes its declared intent', () => {
 const current = scene(), payload = structuredClone(vertex); payload.point = [999,999,999]
 const picked = scopedAssemblySymmetryPick(current,payload,['scope'],'point',0,'vertex')!
 expect(picked.actual).toBe(current.bodies[0].vertexPoints![0]); expect(picked.actual).not.toBe(payload)
 expect(picked.reference.component!.occurrencePath).toEqual(['part']); expect(vertex.selection.component.occurrencePath).toEqual(['scope','part'])
 expect(symmetryPickForReference(current,['scope'],'point',0,picked.reference)?.actual).toBe(picked.actual)
})
it('fails closed for duplicate, hidden, wrong-body, wrong-owner, stale-key or out-of-scope display rows', () => {
 const duplicate=scene(); duplicate.bodies[0].vertexPoints!.push(structuredClone(vertex)); expect(scopedAssemblySymmetryPick(duplicate,vertex,['scope'],'point',0,'vertex')).toBeNull()
 const hidden=scene();hidden.bodies[0].visible=false;expect(scopedAssemblySymmetryPick(hidden,vertex,['scope'],'point',0,'vertex')).toBeNull()
 const bad=scene();bad.bodies[0].vertexPoints![0].selection.body=null;expect(scopedAssemblySymmetryPick(bad,vertex,['scope'],'point',0,'vertex')).toBeNull()
 const owner=scene();owner.bodies[0].vertexPoints![0].selection.component.definition.revision='stale';expect(scopedAssemblySymmetryPick(owner,vertex,['scope'],'point',0,'vertex')).toBeNull()
 const stale=structuredClone(vertex);stale.selection.vertex.key='old';expect(scopedAssemblySymmetryPick(scene(),stale,['scope'],'point',0,'vertex')).toBeNull()
 expect(scopedAssemblySymmetryPick(scene(),vertex,['elsewhere'],'point',0,'vertex')).toBeNull()
})
it('declares all five explicit purposes and keeps mirror restricted to planes', () => {
 const s=scene()
 expect(purpose(scopedAssemblySymmetryPick(s,vertex,['scope'],'point',0,'vertex'))).toBe('point')
 expect(purpose(scopedAssemblySymmetryPick(s,edge,['scope'],'line',0,'line-edge'))).toBe('line')
 expect(purpose(scopedAssemblySymmetryPick(s,cylinder,['scope'],'line',0,'cylinder-axis'))).toBe('axis')
 expect(purpose(scopedAssemblySymmetryPick(s,plane,['scope'],'plane',0,'plane-face'))).toBe('plane')
 expect(purpose(scopedAssemblySymmetryPick(s,sphere,['scope'],'sphere',0,'sphere-face'))).toBe('sphere-surface')
 expect(purpose(scopedAssemblySymmetryPick(s,cylinder,['scope'],'cylinder',0,'cylinder-face'))).toBe('cylinder-surface')
 expect(scopedAssemblySymmetryPick(s,cylinder,['scope'],'sphere',0,'sphere-face')).toBeNull()
 expect(scopedAssemblySymmetryPick(s,plane,['scope'],'line',0,'cylinder-axis')).toBeNull()
 expect(scopedAssemblySymmetryPick(s,vertex,['scope'],'point',2,'vertex')).toBeNull()
 expect(purpose(scopedAssemblySymmetryPick(s,plane,['scope'],'point',2,'plane-face'))).toBe('plane')
})
it('rejects every stale ticket dimension and blocked preview/stage', () => {
 expect(currentSymmetryPick(ticket,context)).toBe(true)
 for(const change of [{signature:'new'},{scope:'[]'},{generation:5},{sceneId:'new'},{family:'sphere' as const},{blocked:true}])expect(currentSymmetryPick(ticket,{...context,...change})).toBe(false)
 expect(currentSymmetryPick({...ticket,producer:'sphere-face'},context)).toBe(false)
})
it('auto-advances only empty roles, preserves explicit line purpose and stops after reselecting a complete tuple', () => {
 const s=scene(),p=scopedAssemblySymmetryPick(s,vertex,['scope'],'point',0,'vertex')!.reference
 expect(nextSymmetryPick(ticket,[p,null,null])?.slot).toBe(1)
 const line:SymmetryPickTicket={...ticket,family:'line',producer:'line-edge',lineProducer:'line-edge',slot:1}
 expect(nextSymmetryPick(line,[null,p,null])).toMatchObject({slot:2,producer:'plane-face',lineProducer:'line-edge'})
 expect(nextSymmetryPick({...line,slot:2,producer:'plane-face'},[null,p,p])).toMatchObject({slot:0,producer:'line-edge'})
 expect(nextSymmetryPick(ticket,[p,p,p])).toBeNull()
})

it('rejects a late callback from an earlier arming even when every ticket field has the same value', () => {
 const rearmed = { ...ticket }
 expect(currentSymmetryPick(rearmed, context, ticket)).toBe(false)
 expect(currentSymmetryPick(rearmed, context, rearmed)).toBe(true)
 expect(currentSymmetryPick(rearmed, context, null)).toBe(false)
})
it('does not infer a line producer when only the mirror role was armed', () => {
 const picked = scopedAssemblySymmetryPick(scene(), plane, ['scope'], 'line', 2, 'plane-face')!.reference
 expect(nextSymmetryPick({ ...ticket, family: 'line', slot: 2, producer: 'plane-face', lineProducer: null }, [null,null,picked])).toBeNull()
})

it('matches a picked mirror to the validated dropdown intent despite property insertion order', () => {
 const picked = scopedAssemblySymmetryPick(scene(),plane,['scope'],'point',2,'plane-face')!.reference
 const option = validateAssemblyPlaneReference(picked)
 if (option.kind !== 'face') throw new Error('Expected native plane face')
 expect(JSON.stringify(picked)).not.toBe(JSON.stringify(option))
 expect(sameSymmetryReference(option,picked)).toBe(true)
 for (const changed of [
  {...option, component: {...option.component!, definition: {...option.component!.definition, revision:'old'}}},
  {...option, component: {...option.component!, occurrencePath:['elsewhere']}},
  {...option, body:{bodyId:'other',sourceFeatureId:'solid'}},
  {...option, kind:'face' as const, face:{sourceFeatureId:'solid',key:'other'}, support:'plane' as const},
  {...option, kind:'face' as const, face:{sourceFeatureId:'other',key:'face-v1|plane'}, support:'plane' as const},
  {...option, kind:'face' as const, face:{sourceFeatureId:'solid',key:'face-v1|plane'}, support:'axis' as const},
 ]) expect(sameSymmetryReference(picked,changed)).toBe(false)
 expect(sameSymmetryReference({kind:'principal-plane',component:null,plane:'XY'},{plane:'XY',component:null,kind:'principal-plane'})).toBe(true)
 expect(sameSymmetryReference({kind:'principal-plane',component:null,plane:'XY'},{kind:'principal-plane',component:null,plane:'YZ'})).toBe(false)
})
