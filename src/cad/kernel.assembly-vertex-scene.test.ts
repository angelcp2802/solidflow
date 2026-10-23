import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'
import { buildAssemblyScene, MAX_ASSEMBLY_SCENE_VERTEX_POINTS } from './kernel.assembly-scene'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { CadEngine } from './kernel.engine'
import { NativeCleanupError } from './kernel.native-ownership'
import type { Feature } from './kernel.types'
beforeAll(async()=>setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'))})),60_000)
type Family='legacy'|'semantic'|'explicit'
// Original public4x6x4 prism:8literalcorners,V96,A128. No mesh vertex inference.
function original(family: Family, width = 4, depth = 4): Feature[] {
  return [{ id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: family === 'semantic' ? { kind: 'entities',
      points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: width, y: 0 }, { id: 'c', x: width, y: 6 }, { id: 'd', x: 0, y: 6 }],
      entities: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']].map(([start, end], i) => ({ id: 'edge-' + i, type: 'line' as const, start, end, construction: false })), constraints: [] }
      : { kind: 'rectangle', center: [width / 2, 3], width, height: 6 } },
  { id: 'solid', name: 'Original prism', type: 'extrude', sketchId: 'profile', depth, symmetric: false, suppressed: false,
    ...(family === 'explicit' ? { bodyOperation: { mode: 'new', bodyId: 'box' } as const } : {}) }]
}

const expected=(width=4)=>[0,width].flatMap(x=>[0,6].flatMap(y=>[0,4].map(z=>[x,y,z].join(',')))).sort()
const stamp='2026-10-21T00:00:00.000Z'
function doc(family:Family='explicit'):AssemblyDocument{return validateAssemblyDocument({version:2,kind:'assembly',id:'root',revision:'r1',name:'Original native point scene',units:'mm',createdAt:stamp,updatedAt:stamp,
 definitions:[{kind:'part',id:'part',revision:'r1',document:{version:1,id:'part',name:'Original prism',units:'mm',createdAt:stamp,updatedAt:stamp,features:original(family)}}],mates:[],occurrences:['a','b'].map(id=>({id,name:id,definition:{id:'part',revision:'r1'},pose:identityRigidPose(),fixed:true,visible:true,suppressed:false}))})}
function points(value:ReturnType<typeof buildAssemblyScene>){return value.bodies.flatMap(b=>b.vertexPoints??[])}
for(const family of ['legacy','semantic','explicit'] as const)it('publishes fresh native '+family+' topology points once per prototype and detached per occurrence',()=>{
 const input=doc(family), query=vi.spyOn(CadEngine.prototype,'inspectCurrentVertexSupport')
 try{const scene=buildAssemblyScene(input);expect(query).toHaveBeenCalledTimes(8);expect(scene.prototypeCount).toBe(1)
  expect(scene.volume).toBeCloseTo(192,7);expect(scene.area).toBeCloseTo(256,7);expect(scene.solidCount).toBe(2)
  for(const body of scene.bodies){expect(body.vertexPoints).toHaveLength(8);expect(body.vertexPoints!.map(p=>p.point.join(',')).sort()).toEqual(expected())
   for(const p of body.vertexPoints!){expect(p.worldPoint).toEqual(p.point);expect(p.selection.component).toEqual(body.component);expect(p.selection.body).toEqual(body.body);expect(p.tolerance).toBeGreaterThanOrEqual(0)}}
  const a=scene.bodies[0].vertexPoints!,b=scene.bodies[1].vertexPoints!;expect(a.map(p=>p.selection.vertex)).toEqual(b.map(p=>p.selection.vertex));a[0].point[0]=999;a[0].selection.vertex.key='display-forgery';expect(b[0].point[0]).not.toBe(999);expect(b[0].selection.vertex.key).not.toBe('display-forgery')
 }finally{query.mockRestore()}
})
it('keeps identical-local vertices isolated by exact explicit body and producer',()=>{
 const input=doc();input.occurrences.length=1;const part=input.definitions[0];if(part.kind!=='part')throw Error('Own part required')
 const extra=original('explicit').map(f=>({...structuredClone(f),id:f.id==='profile'?'other-profile':'other-solid'}))
 for(const f of extra){if(f.type==='extrude'){f.sketchId='other-profile';f.bodyOperation={mode:'new',bodyId:'other-box'}}}
 part.document.features.push(...extra)
 const scene=buildAssemblyScene(input);expect(scene.bodies).toHaveLength(2);expect(scene.volume).toBeCloseTo(192,7)
 expect(scene.bodies.map(b=>b.vertexPoints!.map(p=>p.point.join(',')).sort())).toEqual([expected(),expected()])
 const snapshot=new AssemblyGeometrySnapshot(input)
 try{for(const b of scene.bodies){const p=b.vertexPoints![0],ref={kind:'vertex' as const,...p.selection,support:'point' as const};expect(snapshot.resolveVertexReference(input,ref).localSupport.point).toEqual(p.point)
  const other=scene.bodies.find(x=>x.body!.bodyId!==b.body!.bodyId)!;expect(()=>snapshot.resolveVertexReference(input,{...ref,body:other.body})).toThrow()}}
 finally{snapshot.dispose()}
})
it('composes proper nested world coordinates independently and reuses native queries across shared scopes',()=>{
 const input=doc(),inner={kind:'assembly' as const,id:'inner',revision:'r1',name:'Original shared scope',createdAt:stamp,updatedAt:stamp,mates:[],occurrences:input.occurrences}
 inner.occurrences[0].pose.translation=[1,2,3];input.definitions.push(inner);input.occurrences=['left','right'].map((id,i)=>({id,name:id,definition:{id:'inner',revision:'r1'},pose:{translation:[10+30*i,20,30] as [number,number,number],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2] as [number,number,number,number]},fixed:true,visible:true,suppressed:false}))
 const query=vi.spyOn(CadEngine.prototype,'inspectCurrentVertexSupport')
 try{const scene=buildAssemblyScene(input);expect(query).toHaveBeenCalledTimes(8);expect(scene.bodies).toHaveLength(4)
  for(const p of scene.bodies.find(b=>b.component.occurrencePath.join('/')==='left/a')!.vertexPoints!){const [x,y,z]=p.point;const expected=[8-y,21+x,33+z];p.worldPoint.forEach((v,i)=>expect(Math.abs(v-expected[i])).toBeLessThan(1e-10));expect(p.selection.component.occurrencePath).toEqual(['left','a'])}
 }finally{query.mockRestore()}
})
it('rebuilds current vertex geometry after source content changes under an unchanged revision',()=>{
 const input=doc(),first=buildAssemblyScene(input),part=input.definitions[0];if(part.kind!=='part')throw Error('Own part required');part.document.features=original('explicit',6)
 const next=buildAssemblyScene(input);expect(first.sceneId).not.toBe(next.sceneId);expect(next.bodies[0].vertexPoints!.map(p=>p.point.join(',')).sort()).toEqual(expected(6));expect(next.volume).toBeCloseTo(288,7)
})
it('requires fresh private point authority even when a display DTO contains exact native coordinates',()=>{
 const input=doc(),scene=buildAssemblyScene(input),p=points(scene)[0],snapshot=new AssemblyGeometrySnapshot(input)
 try{expect(()=>snapshot.assertPointWitness(p as never,input)).toThrow();const ref={kind:'vertex' as const,...structuredClone(p.selection),support:'point' as const};const witness=snapshot.resolveVertexReference(input,ref);snapshot.assertPointWitness(witness,input);expect(witness.localSupport.point).toEqual(p.point)
  expect(()=>snapshot.assertPointWitness(structuredClone(witness),input)).toThrow()
 }finally{snapshot.dispose()}
})
it('omits an optional overbudget body catalog without rejecting its real mesh or physical properties',()=>{
 const real=CadEngine.prototype.build,query=vi.spyOn(CadEngine.prototype,'inspectCurrentVertexSupport'),build=vi.spyOn(CadEngine.prototype,'build').mockImplementation(function(this:CadEngine,features){const result=real.call(this,features);const body=result.bodies![0];body.vertexPoints=Array(MAX_ASSEMBLY_SCENE_VERTEX_POINTS+1).fill(body.vertexPoints![0]);return result})
 try{const scene=buildAssemblyScene(doc());expect(query).not.toHaveBeenCalled();expect(points(scene)).toEqual([]);expect(scene.warnings.some(x=>x.includes('opcional'))).toBe(true);expect(scene.volume).toBeCloseTo(192,7);expect(scene.bodies.every(b=>b.vertices.length>0)).toBe(true)}finally{build.mockRestore();query.mockRestore()}
})
it('withholds the entire DTO and releases native prototypes after a real vertex query fails',()=>{
 let disposalsBeforeFault=0
 const primary=new Error('Original point-row fault'),real=CadEngine.prototype.inspectCurrentVertexSupport,engines:CadEngine[]=[],dispose=vi.spyOn(CadEngine.prototype,'dispose'),query=vi.spyOn(CadEngine.prototype,'inspectCurrentVertexSupport').mockImplementation(function(this:CadEngine,ref,body){engines.push(this);real.call(this,ref,body);disposalsBeforeFault=dispose.mock.calls.length;throw primary})
 try{expect(()=>buildAssemblyScene(doc())).toThrow(primary);expect(engines).toHaveLength(1);expect(dispose.mock.calls.length-disposalsBeforeFault).toBe(1);expect(()=>engines[0].copyCurrentBodyShape(null)).toThrow()}
 finally{query.mockRestore();dispose.mockRestore()}
 expect(buildAssemblyScene(doc()).solidCount).toBe(2)
})
it('preserves both query and cleanup errors without publishing partial point metadata',()=>{
 let faultReached=false
 const primary=new Error('Original point query fault'),cleanup=new Error('Original prototype cleanup fault'),real=CadEngine.prototype.inspectCurrentVertexSupport,remove=CadEngine.prototype.dispose
 const query=vi.spyOn(CadEngine.prototype,'inspectCurrentVertexSupport').mockImplementation(function(this:CadEngine,ref,body){real.call(this,ref,body);faultReached=true;throw primary}),dispose=vi.spyOn(CadEngine.prototype,'dispose').mockImplementation(function(this:CadEngine){remove.call(this);if(faultReached)throw cleanup})
 const flatten=(e:unknown):unknown[]=>e instanceof AggregateError?[e,...e.errors.flatMap(flatten)]:[e]
 try{let failure:unknown;try{buildAssemblyScene(doc())}catch(e){failure=e}expect(failure).toBeInstanceOf(NativeCleanupError);expect(flatten(failure)).toContain(primary);expect(flatten(failure)).toContain(cleanup)}finally{query.mockRestore();dispose.mockRestore()}
})
