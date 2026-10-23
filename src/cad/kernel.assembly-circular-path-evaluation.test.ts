import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import {setOC} from 'replicad'
import {beforeAll,it,expect,vi} from 'vitest'
import fixture from './fixtures/assembly-material-arc-original.json'
import {validateAssemblyDocument,type AssemblyDocument} from '../model/assemblyDocument'
import type {AssemblyCircularPathReferenceRequest} from '../model/assemblyCircularPathReferences'
import {identityRigidPose,transformRigidDirection,type RigidPose} from '../model/rigidPose'
import {AssemblyGeometrySnapshot} from './kernel.assembly-snapshot'
import {buildAssemblyScene} from './kernel.assembly-scene'
import {CadEngine} from './kernel.engine'
import {evaluateAssemblyCircularPathReferences} from './kernel.assembly-circular-path-evaluation'
beforeAll(async()=>setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'))})),60_000)
// Original sector fixture: R2 centered (3,-2), quarter-circle start(5,-2,4),
// end(3,0,4). The selected point is the independent sector vertex (3,-2,4).
function original(reverse=false){
 const document=validateAssemblyDocument(fixture),scene=buildAssemblyScene(document),a=scene.bodies.find(b=>b.component.occurrencePath[0]==='a')!,b=scene.bodies.find(b=>b.component.occurrencePath[0]==='b')!,snapshot=new AssemblyGeometrySnapshot(document)
 try{
  const arcs=b.edges!.filter(e=>!e.support).filter(e=>{const c=snapshot.resolvePathCurveSelection(document,{...e.selection,sense:1}).localCurve;return c.kind==='circle'&&Math.abs(c.center[2]-4)<1e-12})
  expect(arcs).toHaveLength(1)
  const at=(body:typeof a,p:number[])=>{const list=body.vertexPoints!.filter(v=>v.point.every((x,i)=>Math.abs(x-p[i])<1e-12));expect(list).toHaveLength(1);return list[0].selection}
  const request:AssemblyCircularPathReferenceRequest={point:{kind:'vertex',...at(a,[3,-2,4]),support:'point'},path:{...arcs[0].selection,startVertex:at(b,reverse?[3,0,4]:[5,-2,4]).vertex},position:{mode:'free',domain:'trim'},orientation:{pitchYaw:'free',roll:'free'}}
  return {document,request}
 }finally{snapshot.dispose()}
}
function place(document:AssemblyDocument,P:[number,number,number],rotation:RigidPose['rotation']=[0,0,0,1]){
 const r=transformRigidDirection({translation:[0,0,0],rotation},[3,-2,4]);document.occurrences[0].pose={rotation,translation:P.map((x,i)=>x-r[i]) as [number,number,number]}
}
function run(document:AssemblyDocument,request:AssemblyCircularPathReferenceRequest,scope:string[]=[]){const snapshot=new AssemblyGeometrySnapshot(document);try{return evaluateAssemblyCircularPathReferences(snapshot,document,request,{},scope)}finally{snapshot.dispose()}}
for(const reverse of [false,true])it('measures actual directed native material origins and literal quarter-circle point '+reverse,()=>{
 const {document,request}=original(reverse);place(document,reverse?[3,0,4]:[5,-2,4]);const before=structuredClone(document),result=run(document,request)
 expect(result.status).toBe('ok');expect(result.satisfied).toBe(true);expect(result.coordinateMm).toBeCloseTo(0,12);expect(result.radiusMm).toBeCloseTo(2,12);expect(result.sweepRad).toBeCloseTo(Math.PI/2,12);expect(result.positionResidualMm).toBeLessThan(1e-12);expect(result.verificationOnly).toBe(true);expect(result.compatibilityAuthority).toBe(false);expect(document).toEqual(before)
})
for(const domain of ['trim','support-circle'] as const)it('distinguishes a finite native arc from its explicit analytic support circle '+domain,()=>{
 const {document,request}=original();place(document,[1,-2,4]);request.position={mode:'free',domain};const queries=vi.spyOn(CadEngine.prototype,'inspectCurrentArcPathEvaluation')
 try{const r=run(document,request);expect(r.status).toBe('ok');expect(r.satisfied).toBe(domain==='support-circle');expect(r.positionResidualMm).toBeCloseTo(domain==='trim'?Math.sqrt(8):0,10);expect(queries).not.toHaveBeenCalled()}finally{queries.mockRestore()}
})
for(const reverse of [false,true])it('queries a fixed coordinate with actual finite native D1 and an independent midpoint oracle '+reverse,()=>{
 const {document,request}=original(reverse);place(document,[3+Math.SQRT2,-2+Math.SQRT2,4]);request.position={mode:'coordinate',distanceMm:Math.PI/2};const query=vi.spyOn(CadEngine.prototype,'inspectCurrentArcPathEvaluation')
 try{const r=run(document,request);expect(r.status).toBe('ok');expect(r.satisfied).toBe(true);expect(r.positionResidualMm).toBeLessThan(1e-12);expect(query).toHaveBeenCalledTimes(1);expect(query.mock.calls[0][3]).toEqual({kind:'arc-length',distanceMm:Math.PI/2})}finally{query.mockRestore()}
})
it('rejects a fixed coordinate beyond actual current trim rather than clamping',()=>{
 const {document,request}=original(),snapshot=new AssemblyGeometrySnapshot(document);request.position={mode:'coordinate',distanceMm:4}
 expect(()=>evaluateAssemblyCircularPathReferences(snapshot,document,request)).toThrow();expect(()=>snapshot.resolveVertexReference(document,request.point)).toThrow();snapshot.dispose()
})
for(const reverse of [false,true])it('measures signed component Follow independently of selected material geometry '+reverse,()=>{
 const {document,request}=original();place(document,[5,-2,4]);request.orientation={pitchYaw:{mode:'follow',axis:'y',reverse},roll:'free'};const r=run(document,request);expect(r.status).toBe('ok');expect(r.orientationResidualRad).toBeCloseTo(reverse?Math.PI:0,12);expect(r.satisfied).toBe(!reverse)
})
it('measures actual third-owner UP plane and independent roll sign',()=>{
 const {document,request}=original();document.occurrences.push({...structuredClone(document.occurrences[1]),id:'g',name:'Original guide'});place(document,[5,-2,4]);const scene=buildAssemblyScene(document),body=scene.bodies.find(b=>b.component.occurrencePath[0]==='g')!
 const faces=body.faces.filter(f=>f.support?.kind==='plane'&&f.support.normal[2]>.999&&Math.abs(f.support.point[2]-4)<1e-12);expect(faces).toHaveLength(1)
 request.orientation={pitchYaw:{mode:'follow',axis:'y',reverse:false},roll:{mode:'up',axis:'z',reverse:false,guide:{kind:'face',...faces[0].selection,support:'plane'}}};let r=run(document,request);expect(r.status).toBe('ok');expect(r.satisfied).toBe(true);expect(r.componentPaths.up).toEqual(['g']);expect(r.rollResidualRad).toBeCloseTo(0,12)
 if(typeof request.orientation.roll!=='object')throw Error('Expected explicit UP');request.orientation.roll.reverse=true;r=run(document,request);expect(r.status).toBe('ok');expect(r.rollResidualRad).toBeCloseTo(Math.PI,12);expect(r.satisfied).toBe(false)
})
it('leaves borrowed snapshot usable for malformed syntax or executable options without native queries',()=>{
 const {document,request}=original(),snapshot=new AssemblyGeometrySnapshot(document),query=vi.spyOn(CadEngine.prototype,'inspectCurrentArcPath');let reads=0
 try{expect(()=>evaluateAssemblyCircularPathReferences(snapshot,document,{...request,extra:true})).toThrow();const options={};Object.defineProperty(options,'lengthToleranceMm',{enumerable:true,get(){reads++;return 1}});expect(()=>evaluateAssemblyCircularPathReferences(snapshot,document,request,options)).toThrow();expect(reads).toBe(0);expect(query).not.toHaveBeenCalled();snapshot.resolveVertexReference(document,request.point)}finally{query.mockRestore();snapshot.dispose()}
})
it('closes all proof lifetime after a partial current native query fails',()=>{
 const {document,request}=original(),snapshot=new AssemblyGeometrySnapshot(document),point=snapshot.resolveVertexReference(document,request.point),query=vi.spyOn(CadEngine.prototype,'inspectCurrentArcPath').mockImplementation(()=>{throw Error('Original fresh arc fault')})
 try{expect(()=>evaluateAssemblyCircularPathReferences(snapshot,document,request)).toThrow('Original fresh arc fault');expect(()=>snapshot.assertPointWitness(point,document)).toThrow()}finally{query.mockRestore();snapshot.dispose()}
})
it('rejects stale documents and retains original cancelled placement magnitudes',()=>{
 const {document,request}=original();place(document,[5,-2,4]);const snapshot=new AssemblyGeometrySnapshot(document),stale=structuredClone(document);stale.occurrences[0].pose.translation[0]++
 try{expect(()=>evaluateAssemblyCircularPathReferences(snapshot,stale,request)).toThrow()}finally{snapshot.dispose()}
 const part=document.definitions[0];document.definitions.push({kind:'assembly',id:'nested',revision:'r1',name:'Original cancellation',createdAt:document.createdAt,updatedAt:document.updatedAt,mates:[],occurrences:[{...structuredClone(document.occurrences[1]),id:'inner',definition:{id:part.id,revision:part.revision},pose:{...identityRigidPose(),translation:[-1e16,0,0]}}]});document.occurrences[1]={...document.occurrences[1],definition:{id:'nested',revision:'r1'},pose:{...identityRigidPose(),translation:[1e16,0,0]}};request.path.component.occurrencePath=['b','inner'];expect(()=>run(document,request)).toThrow(/precision/i)
})

it('reports the numerical reference model and native topology envelopes separately',()=>{
 const {document,request}=original();place(document,[5,-2,4]);const r=run(document,request)
 expect(r.uncertaintyModel).toBe('current-native-analytic-float64');expect(r.topologyTolerancesMm.point).toBeGreaterThan(0);expect(r.topologyTolerancesMm.path).toBeGreaterThan(0);expect(r.precision.tangentErrorRad).toBeLessThan(1e-8);expect(r.precision.positionErrorMm).toBeLessThan(r.topologyTolerancesMm.point)
})
it('authenticates point and path on the same reused occurrence without fabricating distinct owners',()=>{
 const {document,request}=original();request.point={kind:'vertex',component:structuredClone(request.path.component),body:structuredClone(request.path.body),vertex:structuredClone(request.path.startVertex),support:'point'}
 const r=run(document,request);expect(r.status).toBe('ok');expect(r.satisfied).toBe(true);expect(r.componentPaths.point).toEqual(['b']);expect(r.componentPaths.path).toEqual(['b'])
})
it('resolves scoped reused roles through two noncommuting parent rotations',()=>{
 const {document,request}=original();place(document,[5,-2,4]);const originalOccurrences=structuredClone(document.occurrences)
 document.definitions.push({kind:'assembly',id:'inner-scope',revision:'r1',name:'Original scoped arc',createdAt:document.createdAt,updatedAt:document.updatedAt,mates:[],occurrences:originalOccurrences})
 document.definitions.push({kind:'assembly',id:'middle-scope',revision:'r1',name:'Original middle',createdAt:document.createdAt,updatedAt:document.updatedAt,mates:[],occurrences:[{id:'inner',name:'Inner',definition:{id:'inner-scope',revision:'r1'},pose:{translation:[0,0,0],rotation:[Math.SQRT1_2,0,0,Math.SQRT1_2]},fixed:false,visible:true,suppressed:false}]})
 document.occurrences=[{id:'outer',name:'Outer',definition:{id:'middle-scope',revision:'r1'},pose:{translation:[10,20,30],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2]},fixed:false,visible:true,suppressed:false}]
 request.orientation={pitchYaw:{mode:'follow',axis:'y',reverse:false},roll:'free'};const snapshot=new AssemblyGeometrySnapshot(document)
 try{const result=evaluateAssemblyCircularPathReferences(snapshot,document,request,{},['outer','inner']);expect(result.status).toBe('ok');expect(result.satisfied).toBe(true);expect(result.componentPaths.path).toEqual(['outer','inner','b']);const p=snapshot.resolveVertexReference(document,request.point,['outer','inner']).worldSupport.point;expect(p[0]).toBeCloseTo(14,10);expect(p[1]).toBeCloseTo(25,10);expect(p[2]).toBeCloseTo(28,10)}finally{snapshot.dispose()}
})
it('withholds near-band position and Follow envelopes instead of widening requested bands',()=>{
 const {document,request}=original();place(document,[5,-2,4]);let r=run(document,request);const error=r.precision.positionErrorMm;expect(error).toBeGreaterThan(0)
 place(document,[5,-2,4+1e-6-error/2]);r=run(document,request);expect(r.positionResidualMm).toBeLessThan(1e-6);expect(r.status).toBe('precisionLimit');expect(r.satisfied).toBe(false)
 place(document,[5,-2,4]);request.orientation={pitchYaw:{mode:'follow',axis:'y',reverse:false},roll:'free'};r=run(document,request);const angular=r.precision.orientationErrorRad!;expect(angular).toBeGreaterThan(0)
 const theta=1e-8-angular/2;place(document,[5,-2,4],[Math.sin(theta/2),0,0,Math.cos(theta/2)]);r=run(document,request);expect(r.orientationResidualRad).toBeLessThan(1e-8);expect(r.status).toBe('precisionLimit');expect(r.satisfied).toBe(false)
})
it('returns no fabricated radial tangent or nonfinite DTO when the selected point is on the circle axis',()=>{
 const {document,request}=original();request.position={mode:'free',domain:'support-circle'};const r=run(document,request);expect(r.status).toBe('precisionLimit');expect(r.satisfied).toBe(false);expect(r.positionResidualMm).toBeCloseTo(2,12);expect(r.coordinateMm).toBeNull();expect(r.precision.tangentErrorRad).toBeNull();expect(JSON.stringify(r)).not.toMatch(/Infinity|NaN/)
})

it('withholds ordered margin precision at the actual complement cut without fabricating phase',()=>{
 const {document,request}=original();place(document,[3-Math.SQRT2,-2-Math.SQRT2,4]);const snapshot=new AssemblyGeometrySnapshot(document)
 try{const r=evaluateAssemblyCircularPathReferences(snapshot,document,request,{lengthToleranceMm:10});expect(r.status).toBe('precisionLimit');expect(r.satisfied).toBe(false);expect(r.positionResidualMm).toBeCloseTo(Math.sqrt(8+4*Math.SQRT2),10);expect(r.coordinateMm).toBeNull();expect(r.precision.domainMarginErrorMm).toBeNull();expect(JSON.stringify(r)).not.toMatch(/Infinity|NaN/)}finally{snapshot.dispose()}
})

it('keeps fixed D1 Float64 arithmetic independent of changed generic topology envelopes',()=>{
 const {document,request}=original();place(document,[3+Math.SQRT2,-2+Math.SQRT2,4]);request.position={mode:'coordinate',distanceMm:Math.PI/2};const baseline=run(document,request)
 const observe=CadEngine.prototype.inspectCurrentArcPath,evaluate=CadEngine.prototype.inspectCurrentArcPathEvaluation
 const a=vi.spyOn(CadEngine.prototype,'inspectCurrentArcPath').mockImplementation(function(this:CadEngine,...args){const value=observe.apply(this,args);return {...value,nativeToleranceMm:4e-7,precision:{...value.precision,positionMm:4e-7}}})
 const b=vi.spyOn(CadEngine.prototype,'inspectCurrentArcPathEvaluation').mockImplementation(function(this:CadEngine,...args){const value=evaluate.apply(this,args);return {...value,observation:{...value.observation,nativeToleranceMm:4e-7},precision:{...value.precision,positionMm:4e-7,tangentRad:1e-9}}})
 try{const result=run(document,request);expect(result.status).toBe('ok');expect(result.satisfied).toBe(true);expect(result.precision).toEqual(baseline.precision);expect(result.topologyTolerancesMm.path).toBe(4e-7);expect(result.topologyTolerancesMm.path).toBeGreaterThan(baseline.topologyTolerancesMm.path);expect(result.uncertaintyModel).toBe('current-native-analytic-float64')}finally{a.mockRestore();b.mockRestore()}
})
for(const field of ['positionMm','tangentRad'] as const)it('withholds fixed native evaluation proof when actual D1 arithmetic exhausts '+field,()=>{
 const {document,request}=original();place(document,[3+Math.SQRT2,-2+Math.SQRT2,4]);request.position={mode:'coordinate',distanceMm:Math.PI/2};const snapshot=new AssemblyGeometrySnapshot(document),query=CadEngine.prototype.inspectCurrentArcPathEvaluation
 const band=field==='positionMm'?1e-6:1e-8,raised=band-(field==='positionMm'?1e-13:1e-14)
 const spy=vi.spyOn(CadEngine.prototype,'inspectCurrentArcPathEvaluation').mockImplementation(function(this:CadEngine,...args){const result=query.apply(this,args);expect(result.arithmetic[field]).toBeLessThan(raised);expect(raised).toBeLessThan(band);return {...result,arithmetic:{...result.arithmetic,[field]:raised}}})
 try{expect(()=>evaluateAssemblyCircularPathReferences(snapshot,document,request)).toThrow(/precision/i);expect(()=>snapshot.resolveVertexReference(document,request.point)).toThrow();expect(spy).toHaveBeenCalledTimes(1)}finally{spy.mockRestore();snapshot.dispose()}
})
