import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import type { AssemblyPathCurveSelection } from '../model/assemblyPathReferences'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, assemblyPathCurvePlacementArithmetic } from './kernel.assembly-snapshot'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { CadEngine } from './kernel.engine'
import { NativeCleanupError } from './kernel.native-ownership'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
const stamp = '2026-10-22T00:00:00.000Z'
// Original 4x6x4 prism or radius-2 cylinder centered [3,-2], extruded 4 mm.
function original(circle = false, explicit = true): AssemblyDocument {
  const part = { kind: 'part', id: 'path-part', revision: 'r1', document: { version: 1, id: 'path-part', name: 'Original bounded paths', units: 'mm', createdAt: stamp, updatedAt: stamp,
    features: [{ id: 'profile', name: 'Profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: circle ? { kind: 'circle', center: [3,-2], radius: 2 } : { kind: 'rectangle', center: [0,0], width: 4, height: 6 } },
      { id: 'solid', name: 'Solid', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false, ...(explicit ? { bodyOperation: { mode: 'new', bodyId: 'box' } } : {}) }] } }
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'root', revision: 'r1', name: 'Paths', units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: [part],
    occurrences: ['a','b'].map(id => ({ id, name: id, definition: { id: part.id, revision: part.revision }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: false })), mates: [] })
}
const near = (a: readonly number[], b: readonly number[]) => a.forEach((v,i) => expect(Math.abs(v-b[i])).toBeLessThan(1e-10))
function selection(input: AssemblyDocument, circle = false, path = ['a']): AssemblyPathCurveSelection {
  const scene = buildAssemblyScene(input), body = scene.bodies.find(b => JSON.stringify(b.component.occurrencePath) === JSON.stringify(path))!
  const candidates = body.edges!.filter(e => circle ? e.support === null : e.support?.kind === 'line')
  // Fixture discovery uses fresh exact native endpoint/center observations, not a mesh index.
  const snapshot = new AssemblyGeometrySnapshot(input)
  try {
    for (const e of candidates) {
      const s = { ...e.selection, sense: 1 as const }, w = snapshot.resolvePathCurveSelection(input, s, [], {lengthToleranceMm:1e5})
      if (circle ? w.localCurve.kind === 'circle' && Math.abs(w.localCurve.center[2]-4)<1e-12
        : w.localCurve.kind === 'line' && w.localCurve.startPoint[1] === -3 && w.localCurve.endPoint[1] === -3 && w.localCurve.startPoint[2] === 4 && w.localCurve.endPoint[2] === 4) return s
    }
    throw new Error('Original exact bounded edge missing')
  } finally { snapshot.dispose() }
}
for (const explicit of [false,true]) it('freshly evaluates a directed finite native line and retains current-only authority, explicit='+explicit, () => {
  const input = original(false, explicit), s = selection(input), snapshot = new AssemblyGeometrySnapshot(input), foreign = new AssemblyGeometrySnapshot(input)
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentPathEvaluation')
  try {
    const w = snapshot.evaluatePathCurveSelection(input,s,{kind:'arc-length',distanceMm:2})
    near(w.localEvaluation.point,[0,-3,4]); expect(w.localCurve.lengthMm).toBeCloseTo(4,12)
    const r = snapshot.evaluatePathCurveSelection(input,{...s,sense:-1},{kind:'arc-length',distanceMm:2})
    near(r.worldEvaluation.point,[0,-3,4]); near(r.worldEvaluation.tangent,w.worldEvaluation.tangent.map(v=>-v))
    expect(query).toHaveBeenCalledTimes(2); expect(w.localCurve.parameterDomain).toEqual(r.localCurve.parameterDomain)
    expect(Object.isFrozen(w.worldEvaluation.point)).toBe(true); expect(snapshot.assertPathCurveWitness(w,input)).toBe(w)
    expect(() => snapshot.assertWitness(w as never,input)).toThrow(); expect(() => snapshot.assertMateWitness(w as never,input)).toThrow()
    expect(() => snapshot.assertPathCurveWitness(structuredClone(w),input)).toThrow(); expect(() => foreign.assertPathCurveWitness(w,input)).toThrow()
    expect(() => assemblyPathCurvePlacementArithmetic(structuredClone(w),input)).toThrow()
    const changed = structuredClone(input); changed.occurrences[0].pose.translation[0]++
    expect(() => snapshot.assertPathCurveWitness(w,changed)).toThrow()
  } finally { query.mockRestore(); snapshot.dispose(); foreign.dispose() }
})
it('composes a circular seam, point and tangent through noncommuting nested rotations', () => {
  const input = original(true), part = input.definitions[0]
  input.definitions.push({kind:'assembly',id:'nested',revision:'r1',name:'Nested',createdAt:stamp,updatedAt:stamp,mates:[],occurrences:[{id:'inner',name:'Inner',definition:{id:part.id,revision:part.revision},pose:{translation:[2,0,0],rotation:[Math.SQRT1_2,0,0,Math.SQRT1_2]},fixed:false,visible:true,suppressed:false}]})
  input.occurrences = [{id:'outer',name:'Outer',definition:{id:'nested',revision:'r1'},pose:{translation:[10,20,30],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2]},fixed:false,visible:true,suppressed:false}]
  const s = selection(input,true,['outer','inner']); s.component.occurrencePath=['inner']
  const snapshot = new AssemblyGeometrySnapshot(input)
  try {
    const w = snapshot.evaluatePathCurveSelection(input,s,{kind:'parameter',parameter:0},['outer'])
    if(w.worldCurve.kind!=='circle') throw new Error('Expected circle')
    near(w.worldCurve.center,[14,25,28]); near(w.worldCurve.normal,[1,0,0]); near(w.worldEvaluation.point,[14,27,28]); near(w.worldEvaluation.tangent,[0,0,1])
    expect(w.worldCurve.lengthMm).toBeCloseTo(4*Math.PI,11); expect(w.worldCurve.closed).toBe(true)
    expect(w.worldCurve.parameterDomain).toEqual(w.localCurve.parameterDomain)
    expect(assemblyPathCurvePlacementArithmetic(w,input).depth).toBe(2); expect(assemblyPathCurvePlacementArithmetic(w,input).placementSum).toBeCloseTo(Math.sqrt(1400)+2,12)
  } finally { snapshot.dispose() }
})
it('rejects malformed declarations without querying or consuming the borrowed session', () => {
  const input=original(),s=selection(input),snapshot=new AssemblyGeometrySnapshot(input),query=vi.spyOn(CadEngine.prototype,'inspectCurrentPathCurve'); let reads=0
  try {
    const bad={...s,get edge(){reads++;return s.edge}}
    expect(()=>snapshot.resolvePathCurveSelection(input,bad)).toThrow(); expect(reads).toBe(0)
    expect(()=>snapshot.resolvePathCurveSelection(input,s,new Array(1))).toThrow()
    expect(()=>snapshot.evaluatePathCurveSelection(input,s,{kind:'parameter',get parameter(){reads++;return 0}})).toThrow()
    expect(query).not.toHaveBeenCalled(); expect(reads).toBe(0)
    expect(snapshot.resolvePathCurveSelection(input,s).kind).toBe('path-curve')
  } finally {query.mockRestore();snapshot.dispose()}
})
for(const action of ['dispose','mutate','fault'] as const) it('withholds publication after native '+action,()=>{
  const input=original(),s=selection(input),snapshot=new AssemblyGeometrySnapshot(input),originalQuery=CadEngine.prototype.inspectCurrentPathCurve
  const query=vi.spyOn(CadEngine.prototype,'inspectCurrentPathCurve').mockImplementation(function(this:CadEngine,...args){
    if(action==='fault') throw new NativeCleanupError({error:new Error('Original query failure')},[new Error('Original release failure')],'Original bounded query cleanup')
    const result=originalQuery.apply(this,args)
    if(action==='dispose')snapshot.dispose();else input.occurrences[0].name='Reentrant edit'
    return result
  })
  try {expect(()=>snapshot.resolvePathCurveSelection(input,s)).toThrow();expect(()=>snapshot.listFaces(input,['b'])).toThrow()}
  finally {query.mockRestore();snapshot.dispose()}
})
it('retains cancelled original placement magnitude without claiming world precision acceptance',()=>{
  const input=original(),part=input.definitions[0]
  input.definitions.push({kind:'assembly',id:'nested',revision:'r1',name:'Nested',createdAt:stamp,updatedAt:stamp,mates:[],occurrences:[{id:'inner',name:'Inner',definition:{id:part.id,revision:part.revision},pose:{translation:[-1e16,0,0],rotation:[0,0,0,1]},fixed:false,visible:true,suppressed:false}]})
  input.occurrences=[{id:'outer',name:'Outer',definition:{id:'nested',revision:'r1'},pose:{translation:[1e16,0,0],rotation:[0,0,0,1]},fixed:false,visible:true,suppressed:false}]
  const s=selection(input,false,['outer','inner']),snapshot=new AssemblyGeometrySnapshot(input), rejected=new AssemblyGeometrySnapshot(input)
  expect(()=>rejected.resolvePathCurveSelection(input,s)).toThrow(/precisionLimit/); rejected.dispose()
  try {const w=snapshot.evaluatePathCurveSelection(input,s,{kind:'arc-length',distanceMm:2},[],{lengthToleranceMm:1e5});near(w.worldEvaluation.point,[0,-3,4]);expect(assemblyPathCurvePlacementArithmetic(w,input)).toEqual({placementSum:2e16,depth:2});expect(w.worldCurve.precision.positionMm).toBeGreaterThan(100);expect(w.localCurve.precision.positionMm).toBeLessThan(1e-6)}finally{snapshot.dispose()}
})

it('rejects a same-producer selection bound to a different explicit body and consumes no false proof',()=>{
  const input=original(),s=selection(input),snapshot=new AssemblyGeometrySnapshot(input)
  try {
    if(!s.body) throw new Error('Expected explicit body')
    const wrong={...s,body:{...s.body,bodyId:'missing-original-body'}}
    expect(()=>snapshot.resolvePathCurveSelection(input,wrong)).toThrow()
    expect(()=>snapshot.resolvePathCurveSelection(input,s)).toThrow()
  } finally {snapshot.dispose()}
})
it('rejects suppressed occurrences and obsolete source tuples before native path queries',()=>{
  const input=original(),s=selection(input)
  for(const suppressed of [false,true]) {
    const current=structuredClone(input)
    if(suppressed)current.occurrences[0].suppressed=true
    const snapshot=new AssemblyGeometrySnapshot(current),query=vi.spyOn(CadEngine.prototype,'inspectCurrentPathCurve')
    try {
      const declaration=structuredClone(s)
      if(!suppressed)declaration.component.definition.revision='obsolete'
      expect(()=>snapshot.resolvePathCurveSelection(current,declaration)).toThrow()
      expect(query).not.toHaveBeenCalled()
    } finally {query.mockRestore();snapshot.dispose()}
  }
})
