import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import type { AssemblyPathCurveSelection } from '../model/assemblyPathReferences'
import {validateAssemblyLinePathSelection,type AssemblyLinePathSelection} from '../model/assemblyLinePathReferences'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, assemblyLinePathPlacementArithmetic, isResolvedAssemblyLinePathMate } from './kernel.assembly-snapshot'
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
function material(input:AssemblyDocument,path=['a']):AssemblyLinePathSelection {
 const s=selection(input,false,path),snapshot=new AssemblyGeometrySnapshot(input)
 try{const curve=snapshot.resolvePathCurveSelection(input,s,[],{lengthToleranceMm:1e5}).localCurve,body=buildAssemblyScene(input).bodies.find(b=>JSON.stringify(b.component.occurrencePath)===JSON.stringify(path))!
 const v=body.vertexPoints!.find(v=>v.point.every((x,i)=>Math.abs(x-curve.startPoint[i])<1e-12))!
 return {component:s.component,body:s.body,edge:s.edge,startVertex:v.selection.vertex}
 }finally{snapshot.dispose()}
}
for(const explicit of [false,true])it('issues fresh material endpoint authority distinct from bounded/LINE proofs, body='+explicit,()=>{
 const input=original(false,explicit),s=material(input),snapshot=new AssemblyGeometrySnapshot(input),foreign=new AssemblyGeometrySnapshot(input)
 const query=vi.spyOn(CadEngine.prototype,'inspectCurrentLinePath')
 try{const w=snapshot.resolveLinePathSelection(input,s);near(w.localCurve.startPoint,[-2,-3,4]);near(w.localCurve.endPoint,[2,-3,4]);expect(query).toHaveBeenCalledTimes(1);expect(snapshot.assertLinePathWitness(w,input)).toBe(w);expect(snapshot.assertMateWitness(w,input)).toBe(w);expect(Object.isFrozen(w.worldCurve.startPoint)).toBe(true)
 expect(()=>snapshot.assertWitness(w as never,input)).toThrow();expect(()=>snapshot.assertPathCurveWitness(w as never,input)).toThrow();expect(()=>foreign.assertLinePathWitness(w,input)).toThrow();expect(()=>snapshot.assertLinePathWitness(structuredClone(w),input)).toThrow()
 const stale=structuredClone(input);stale.occurrences[0].pose.translation[0]++;expect(()=>snapshot.assertLinePathWitness(w,stale)).toThrow()
 }finally{query.mockRestore();snapshot.dispose();foreign.dispose()}
})
it('retains separate repeated/nested owner poses and original chain magnitude, rejecting inadequate world precision',()=>{
 const input=original();const part=input.definitions[0];input.definitions.push({kind:'assembly',id:'nested',revision:'r1',name:'Nested',createdAt:stamp,updatedAt:stamp,mates:[],occurrences:[{id:'inner',name:'Inner',definition:{id:part.id,revision:part.revision},pose:{translation:[-1e16,0,0],rotation:[0,0,0,1]},fixed:false,visible:true,suppressed:false}]});input.occurrences=[{id:'outer',name:'Outer',definition:{id:'nested',revision:'r1'},pose:{translation:[1e16,0,0],rotation:[0,0,0,1]},fixed:false,visible:true,suppressed:false}]
 const s=material(input,['outer','inner']),rejected=new AssemblyGeometrySnapshot(input);expect(()=>rejected.resolveLinePathSelection(input,s)).toThrow(/precisionLimit/);rejected.dispose();const snapshot=new AssemblyGeometrySnapshot(input)
 try{const w=snapshot.resolveLinePathSelection(input,s,[],{lengthToleranceMm:1e5});near(w.worldCurve.startPoint,[-2,-3,4]);expect(w.componentPath).toEqual(['outer','inner']);expect(assemblyLinePathPlacementArithmetic(w,input)).toEqual({placementSum:2e16,depth:2})}finally{snapshot.dispose()}
})
it('rejects malformed declarations before native query and preserves borrowed session',()=>{
 const input=original(),s=material(input),snapshot=new AssemblyGeometrySnapshot(input),spy=vi.spyOn(CadEngine.prototype,'inspectCurrentLinePath');let reads=0
 try{const bad={...s};Object.defineProperty(bad,'startVertex',{enumerable:true,get(){reads++;return s.startVertex}});expect(()=>snapshot.resolveLinePathSelection(input,bad)).toThrow();expect(reads).toBe(0);expect(spy).not.toHaveBeenCalled();expect(snapshot.resolveLinePathSelection(input,s).kind).toBe('line-path');expect(()=>validateAssemblyLinePathSelection({...s,sense:1})).toThrow()}finally{spy.mockRestore();snapshot.dispose()}
})
it('rejects a valid same-body vertex that is not incident, and stale source/body aliases',()=>{
 const input=original(),s=material(input),scene=buildAssemblyScene(input),body=scene.bodies.find(b=>b.component.occurrencePath[0]==='a')!,v=body.vertexPoints!.find(v=>v.point[1]===3)!,snapshot=new AssemblyGeometrySnapshot(input)
 try{expect(()=>snapshot.resolveLinePathSelection(input,{...s,startVertex:v.selection.vertex})).toThrow(/exact endpoint/);expect(()=>snapshot.resolveLinePathSelection(input,s)).toThrow(/vigente/)}finally{snapshot.dispose()}
 const fresh=new AssemblyGeometrySnapshot(input);try{expect(()=>fresh.resolveLinePathSelection(input,{...s,startVertex:{...s.startVertex,sourceFeatureId:'wrong'}})).toThrow(/origen del .* y cuerpo/);expect(fresh.resolveLinePathSelection(input,s).kind).toBe('line-path')}finally{fresh.dispose()}
})
for(const action of ['dispose','mutate','fault'] as const)it('withholds material origin proof after reentrant '+action,()=>{
 const input=original(),s=material(input),snapshot=new AssemblyGeometrySnapshot(input),old=CadEngine.prototype.inspectCurrentLinePath,spy=vi.spyOn(CadEngine.prototype,'inspectCurrentLinePath').mockImplementation(function(this:CadEngine,...args){const r=old.apply(this,args);if(action==='dispose')snapshot.dispose();if(action==='mutate')input.occurrences[0].pose.translation[0]++;if(action==='fault')throw Error('nativefault');return r})
 try{expect(()=>snapshot.resolveLinePathSelection(input,s)).toThrow();expect(()=>snapshot.resolveLinePathSelection(input,s)).toThrow()}finally{spy.mockRestore();snapshot.dispose()}
})

it('resolves saved point/path roles with fresh distinct purposes and suppresses the family without native alias',()=>{
 const input=original(),s=material(input),body=buildAssemblyScene(input).bodies.find(b=>b.component.occurrencePath[0]==='b')!,v=body.vertexPoints![0]
 input.mates=[{id:'path',name:'Material path',type:'line-path',suppressed:false,point:{kind:'vertex',...v.selection,support:'point'},path:s,position:{mode:'free'},orientation:{pitchYaw:'free',roll:'free'}}]
 const snapshot=new AssemblyGeometrySnapshot(input)
 try{const resolved=snapshot.resolveActiveMates(input);expect(resolved).toHaveLength(1);expect(resolved[0].mate.type).toBe('line-path');if(!isResolvedAssemblyLinePathMate(resolved[0]))throw Error('Missing dedicated resolved family');expect(resolved[0].first.kind).toBe('point');expect(resolved[0].second.kind).toBe('line-path')}finally{snapshot.dispose()}
 const suppressed=structuredClone(input);suppressed.mates[0].suppressed=true;const quiet=new AssemblyGeometrySnapshot(suppressed);try{expect(quiet.resolveActiveMates(suppressed)).toEqual([])}finally{quiet.dispose()}
})

it('keeps repeated prototype material origins separate under actual three-dimensional placement',()=>{
 const input=original();input.occurrences[1].pose={translation:[10,20,30],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2]};const a=material(input,['a']),b=material(input,['b']),snapshot=new AssemblyGeometrySnapshot(input)
 try{const first=snapshot.resolveLinePathSelection(input,a),second=snapshot.resolveLinePathSelection(input,b);near(first.worldCurve.startPoint,[-2,-3,4]);near(second.worldCurve.startPoint,[13,18,34]);near(second.worldCurve.endPoint,[13,22,34]);near(second.worldCurve.increasingDirection,[0,1,0]);expect(first.componentPath).toEqual(['a']);expect(second.componentPath).toEqual(['b']);expect(first.localCurve).toEqual(second.localCurve)}finally{snapshot.dispose()}
})
it('does not substitute an aggregate or another body for explicit material topology',()=>{
 const input=original(),s=material(input),snapshot=new AssemblyGeometrySnapshot(input)
 try{expect(()=>snapshot.resolveLinePathSelection(input,{...s,body:null})).toThrow(/cuerpo|body/);expect(()=>snapshot.resolveLinePathSelection(input,s)).toThrow(/vigente/)}finally{snapshot.dispose()}
 const other=new AssemblyGeometrySnapshot(input);try{expect(()=>other.resolveLinePathSelection(input,{...s,body:{...s.body!,bodyId:'foreign-body'}})).toThrow();expect(()=>other.resolveLinePathSelection(input,s)).toThrow(/vigente/)}finally{other.dispose()}
})
