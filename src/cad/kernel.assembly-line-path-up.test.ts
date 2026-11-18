import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import {setOC} from 'replicad'
import {beforeAll,it,expect,vi} from 'vitest'
import {validateAssemblyDocument,serializeAssemblyDocument,parseAssemblyDocument,type AssemblyDocument,type AssemblyLinePathMate} from '../model/assemblyDocument'
import {identityRigidPose,transformRigidPoint,transformRigidDirection,type RigidPose} from '../model/rigidPose'
import {AssemblyDocumentHistory} from '../model/assemblyEditing'
import {assemblySceneFaceReference} from './kernel.assembly-types'
import {reviewAssemblyPartSourceUpdate} from './kernel.assembly-source-updates'
import {reviewAssemblyReplacement,prepareAssemblyReplacementDecisions} from './kernel.assembly-replacement'
import {buildAssemblyScene} from './kernel.assembly-scene'
import {prepareAssemblySolve,prepareAssemblyDragPreview,prepareAssemblyMotionPreview,discardAssemblySolvePreview,applyAssemblySolvePreview} from './kernel.assembly-solve'
import {AssemblyWorkerSession} from './kernel.assembly-session'
import {CadEngine} from './kernel.engine'
import {AssemblyGeometrySnapshot} from './kernel.assembly-snapshot'
import {evaluateAssemblyLinePathReferences} from './kernel.assembly-line-path-evaluation'
beforeAll(async()=>setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'))})),60000)
const stamp='2026-10-22T00:00:00.000Z'
// Original 4x6x4 prism. Material point [-2,-3,4], path X edge from[-2,-3,4] to[2,-3,4].
function original(position:AssemblyLinePathMate['position']={mode:'free'},reverseOrigin=false):AssemblyDocument{
 const part={kind:'part',id:'original-line-part',revision:'r1',document:{version:1,id:'original-line-part',name:'Original prism',units:'mm',createdAt:stamp,updatedAt:stamp,features:[{id:'profile',name:'Rectangle',type:'sketch',plane:'XY',offset:0,suppressed:false,profile:{kind:'rectangle',center:[0,0],width:4,height:6}},{id:'solid',name:'Prism',type:'extrude',sketchId:'profile',depth:4,symmetric:false,suppressed:false,bodyOperation:{mode:'new',bodyId:'prism'}}]}}
 const d=validateAssemblyDocument({version:2,kind:'assembly',id:'original-root',revision:'r1',name:'Original LINE path',units:'mm',createdAt:stamp,updatedAt:stamp,definitions:[part],occurrences:['point','path'].map(id=>({id,name:id,definition:{id:part.id,revision:part.revision},pose:{...identityRigidPose(),translation:id==='point'?[9,0,0]:[0,0,0]},fixed:id==='path',visible:true,suppressed:false})),mates:[]})
 const scene=buildAssemblyScene(d),a=scene.bodies.find(b=>b.component.occurrencePath[0]==='point')!,b=scene.bodies.find(b=>b.component.occurrencePath[0]==='path')!
 const vertex=(body:typeof b,x:number)=>body.vertexPoints!.find(v=>v.point[0]===x&&v.point[1]===-3&&v.point[2]===4)!
 const edge=b.edges!.find(e=>e.support?.kind==='line'&&e.support.axis[0]>.999&&Math.abs(e.support.point[1]+3)<1e-10&&Math.abs(e.support.point[2]-4)<1e-10)!
 d.mates.push({id:'path-mate',name:'Original material LINE',type:'line-path',suppressed:false,point:{kind:'vertex',...vertex(a,-2).selection,support:'point'},path:{...edge.selection,startVertex:vertex(b,reverseOrigin?2:-2).selection.vertex},position,orientation:{pitchYaw:'free',roll:'free'}})
 return validateAssemblyDocument(d)
}
function ready(d:AssemblyDocument){const r=prepareAssemblySolve(d);if(r.status!=='ready')throw Error(r.reason+': '+r.message);return r}
const near=(a:readonly number[],b:readonly number[],band=1e-6)=>a.forEach((v,i)=>expect(Math.abs(v-b[i])).toBeLessThanOrEqual(band))


// Three original owners; guide normal under Rz(-atan(3/4)) is (3/5,4/5,0).
// Its projection orthogonal to the material LINE X is exactly +Y.
function withUP(reverse=false):AssemblyDocument{
 const d=original({mode:'distance',distanceMm:0,reverse:false});d.occurrences[0].pose=identityRigidPose()
 const guidePart=structuredClone(d.definitions[0]);if(guidePart.kind!=='part')throw Error('Expected original part');guidePart.id='guide-part';guidePart.document.id='guide-part';d.definitions.push(guidePart)
 d.occurrences.push({id:'up',name:'Original UP',definition:{id:'guide-part',revision:'r1'},pose:{translation:[20,30,40],rotation:[0,0,-Math.sqrt(.1),Math.sqrt(.9)]},fixed:true,visible:true,suppressed:false})
 const scene=buildAssemblyScene(d),body=scene.bodies.find(x=>x.component.occurrencePath[0]==='up')!,face=body.faces.find(x=>x.support?.kind==='plane'&&x.support.normal[1]>.999)!,guide=assemblySceneFaceReference(face)
 if(!guide||guide.support!=='plane')throw Error('Original Y plane missing')
 const m=d.mates[0] as AssemblyLinePathMate;m.orientation={pitchYaw:{mode:'follow',axis:'x',reverse:false},roll:{mode:'up',axis:'y',reverse,guide:{...guide,support:'plane'}}}
 return validateAssemblyDocument(d)
}
const request=(d:AssemblyDocument)=>{const m=d.mates[0] as AssemblyLinePathMate;return{point:m.point,path:m.path,position:m.position,orientation:m.orientation}}
it('independently verifies oblique UP projection rather than direct normal alignment',()=>{
 const d=withUP(),snapshot=new AssemblyGeometrySnapshot(d)
 try{const r=evaluateAssemblyLinePathReferences(snapshot,d,request(d));expect(r.status).toBe('ok');expect(r.satisfied).toBe(true);expect(r.rollResidualRad!).toBeLessThan(1e-12);expect(r.precision.rollErrorRad!).toBeLessThan(1e-8);expect(r.componentPaths.up).toEqual(['up']);const scene=buildAssemblyScene(d);expect(scene.bodies).toHaveLength(3);expect(scene.bodies.reduce((n,b)=>n+b.volume,0)).toBeCloseTo(288,8);expect(scene.bodies.reduce((n,b)=>n+b.area,0)).toBeCloseTo(384,8);const resolved=snapshot.resolveActiveMates(d)[0];expect('up'in resolved).toBe(true);if(!('up'in resolved)||!resolved.up)throw Error('Missing third proof');expect(()=>snapshot.assertMateWitness(JSON.parse(JSON.stringify(resolved.up)),d)).toThrow();const normal=transformRigidDirection(d.occurrences[2].pose as RigidPose,[0,1,0]);near(normal,[.6,.8,0],1e-14);expect(Math.atan2(.6,.8)).toBeGreaterThan(.6)}finally{snapshot.dispose()}
})
it('keeps inversion independent from Follow and rejects the opposite projected direction',()=>{
 const d=withUP(true),snapshot=new AssemblyGeometrySnapshot(d)
 try{const r=evaluateAssemblyLinePathReferences(snapshot,d,request(d));expect(r.status).toBe('ok');expect(r.orientationResidualRad).toBe(0);expect(r.rollResidualRad).toBe(Math.PI);expect(r.satisfied).toBe(false)}finally{snapshot.dispose()}
})
it('freshly queries every native role and withholds singular UP precision without consuming snapshot',()=>{
 const d=withUP(),snapshot=new AssemblyGeometrySnapshot(d),point=vi.spyOn(snapshot,'resolveVertexReference'),path=vi.spyOn(snapshot,'resolveLinePathSelection'),up=vi.spyOn(snapshot,'resolveDirectionReference')
 try{evaluateAssemblyLinePathReferences(snapshot,d,request(d));evaluateAssemblyLinePathReferences(snapshot,d,request(d));expect(point).toHaveBeenCalledTimes(2);expect(path).toHaveBeenCalledTimes(2);expect(up).toHaveBeenCalledTimes(2)}finally{snapshot.dispose()}
 const singular=withUP();singular.occurrences[2].pose.rotation=[0,0,-Math.SQRT1_2,Math.SQRT1_2];const s=new AssemblyGeometrySnapshot(singular)
 try{const r=evaluateAssemblyLinePathReferences(s,singular,request(singular));expect(r.status).toBe('precisionLimit');expect(r.satisfied).toBe(false);expect(r.precision.rollErrorRad!).toBeGreaterThan(1e-8);expect(s.resolveActiveMates(singular)).toHaveLength(1)}finally{s.dispose()}
})
it('disposes all borrowed proofs when the third native query fails',()=>{
 const d=withUP(),snapshot=new AssemblyGeometrySnapshot(d),native=vi.spyOn(snapshot,'resolveDirectionReference').mockImplementation(()=>{throw Error('Original third native fault')})
 try{expect(()=>evaluateAssemblyLinePathReferences(snapshot,d,request(d))).toThrow('Original third native fault');expect(()=>snapshot.resolveVertexReference(d,(d.mates[0] as AssemblyLinePathMate).point)).toThrow()}finally{native.mockRestore();snapshot.dispose()}
})
it('solves a true third-only movable UP owner without moving fixed point/path',()=>{
 const d=withUP();d.occurrences[0].fixed=true;d.occurrences[2].fixed=false;d.occurrences[2].pose.rotation=[Math.sin(.2),0,0,Math.cos(.2)];const r=ready(d)
 try{for(const id of ['point','path'])expect(r.document.occurrences.find(x=>x.id===id)!.pose).toEqual(d.occurrences.find(x=>x.id===id)!.pose);expect(r.linePaths![0].rollResidualRad!).toBeLessThanOrEqual(1e-8);expect(r.linePaths![0].componentPaths.up).toEqual(['up']);expect(r.scopes[0].result.rank).toBe(1);expect(r.scopes[0].result.localDOF).toBe(5)}finally{discardAssemblySolvePreview(r)}
})
it('UP-only source replacement requires explicit fresh repair even for unchanged semantic plane',()=>{
 const d=withUP(),part=d.definitions.find(x=>x.id==='guide-part')!;if(part.kind!=='part')throw Error('Expected guide part');const before=JSON.stringify(d),review=reviewAssemblyPartSourceUpdate(d,{id:part.id,revision:part.revision},part.document,'r2');expect(review.endpoints.map(x=>x.locator.side)).toEqual(['up']);expect(review.endpoints[0].status).toBe('needs-repair');expect(JSON.stringify(d)).toBe(before)
 const next={...structuredClone(part.document),id:'guide-replacement'},prepared=reviewAssemblyReplacement(d,{component:{occurrencePath:['up'],definition:{id:part.id,revision:part.revision}},mode:'selected',part:next,revision:'r2',ancestorRevisions:[]});expect(prepared.review.endpoints.map(x=>x.locator.side)).toEqual(['up']);const endpoint=prepared.review.endpoints[0],body=prepared.review.replacementCatalog.bodies[0],face=assemblySceneFaceReference(body.faces.find(x=>x.support?.kind==='plane'&&x.support.normal[1]>.999)!)!;const reference={...face,component:structuredClone(endpoint.desiredComponent)};const decisions=prepareAssemblyReplacementDecisions(prepared.plan,prepared.review,{repairs:[{locator:endpoint.locator,reference}],removed:[],recapture:[]});const snapshot=new AssemblyGeometrySnapshot(decisions.proposal);try{expect(snapshot.resolveActiveMates(decisions.proposal)).toHaveLength(1)}finally{snapshot.dispose()}
})
it('saved UP intent and third path survive detached report tampering and a fresh saved solve',()=>{
 const d=withUP(),session=new AssemblyWorkerSession(),base=validateAssemblyDocument({...d,mates:[]})
 try{const r=session.prepare(base,d);if(r.status!=='ready')throw Error(r.message);r.linePaths![0].rollResidualRad=99;r.linePaths![0].componentPaths.up=['forged'];r.linePaths![0].precision.rollErrorRad=99;const applied=session.apply(base,r.token),reopened=parseAssemblyDocument(serializeAssemblyDocument(applied.document)),again=ready(reopened);try{expect(again.linePaths![0].rollResidualRad!).toBeLessThanOrEqual(1e-8);expect(again.linePaths![0].componentPaths.up).toEqual(['up']);expect((reopened.mates[0] as AssemblyLinePathMate).orientation).toEqual((d.mates[0] as AssemblyLinePathMate).orientation)}finally{discardAssemblySolvePreview(again)}}finally{session.discard()}
})

it('does not turn an irrelevant distant UP plane origin into a positional constraint',()=>{
 const d=withUP();d.occurrences[2].pose.translation=[1e16,-1e16,1e16];const snapshot=new AssemblyGeometrySnapshot(d)
 try{const r=evaluateAssemblyLinePathReferences(snapshot,d,request(d));expect(r.status).toBe('ok');expect(r.satisfied).toBe(true);expect(r.positionResidualMm).toBe(0);expect(r.rollResidualRad!).toBeLessThan(1e-12)}finally{snapshot.dispose()}
})
it('authenticates all three nested role paths under a common proper 3D rotation and rejects stale guide proofs',()=>{
 const base=withUP(),{version:_v,units:_u,definitions,...nested}=base;const d=validateAssemblyDocument({...base,id:'nested-host',definitions:[...definitions,nested],mates:[],occurrences:['left','right'].map((id,i)=>({id,name:id,definition:{id:nested.id,revision:nested.revision},pose:{translation:[i*100,20,30],rotation:[Math.SQRT1_2,0,0,Math.SQRT1_2]},fixed:false,visible:true,suppressed:false}))}),snapshot=new AssemblyGeometrySnapshot(d)
 try{const resolved=snapshot.resolveActiveMates(d);expect(resolved).toHaveLength(2);for(const side of ['left','right']){const r=evaluateAssemblyLinePathReferences(snapshot,d,request(base),{},[side]);expect(r.satisfied).toBe(true);expect(r.rollResidualRad!).toBeLessThan(1e-12);expect(r.componentPaths).toEqual({point:[side,'point'],path:[side,'path'],up:[side,'up']})}const w=resolved[0];if(!('up'in w)||!w.up)throw Error('Missing native third proof');d.revision='changed';expect(()=>snapshot.assertMateWitness(w.up!,d)).toThrow()}finally{snapshot.dispose()}
})

// Finite 6 distinct canonical-axis pairs x 2 Follow signs x 2 UP signs.
// Literal world targets are X for Follow and Y for projected guide; no unique
// quaternion/free-gauge pose is prescribed by the oracle.
for(const followAxis of ['x','y','z'] as const)for(const rollAxis of ['x','y','z'] as const)if(followAxis!==rollAxis)for(const followReverse of [false,true])for(const rollReverse of [false,true])it('fresh native canonical Follow '+followAxis+'/'+followReverse+' UP '+rollAxis+'/'+rollReverse,()=>{
 const d=withUP(rollReverse),m=d.mates[0] as AssemblyLinePathMate;if(typeof m.orientation.roll!=='object')throw Error('UP expected');m.orientation={pitchYaw:{mode:'follow',axis:followAxis,reverse:followReverse},roll:{...m.orientation.roll,axis:rollAxis}};const r=ready(d)
 const canonical=(axis:'x'|'y'|'z'):[number,number,number]=>axis==='x'?[1,0,0]:axis==='y'?[0,1,0]:[0,0,1]
 try{const pose=r.document.occurrences[0].pose as RigidPose;near(transformRigidDirection(pose,canonical(followAxis)),[followReverse?-1:1,0,0],1e-8);near(transformRigidDirection(pose,canonical(rollAxis)),[0,rollReverse?-1:1,0],1e-8);expect(r.linePaths![0].orientationResidualRad!).toBeLessThanOrEqual(1e-8);expect(r.linePaths![0].rollResidualRad!+r.linePaths![0].precision.rollErrorRad!).toBeLessThanOrEqual(1e-8);expect(r.scopes[0].result.rank).toBe(6);expect(r.scopes[0].result.localDOF).toBe(0)}finally{discardAssemblySolvePreview(r)}
})
it('full solve conditions a distant guide-only origin without losing any positional owner guard',()=>{
 const d=withUP();d.occurrences[2].pose.translation=[1e16,-1e16,1e16];const r=ready(d)
 try{expect(r.linePaths![0].rollResidualRad!).toBeLessThanOrEqual(1e-8);expect(r.document.occurrences[2].pose).toEqual(d.occurrences[2].pose);expect(r.linePaths![0].precision.rollErrorRad!).toBeLessThanOrEqual(1e-8)}finally{discardAssemblySolvePreview(r)}
 const positional=withUP(),m=positional.mates[0] as AssemblyLinePathMate;positional.occurrences[2].pose.translation=[1e16,-1e16,1e16];m.point={...m.point,component:{occurrencePath:['up'],definition:{id:'guide-part',revision:'r1'}}};const rejected=prepareAssemblySolve(positional);expect(rejected.status).toBe('rejected')
 const shared=withUP();shared.occurrences[2].pose.translation=[1e16,-1e16,1e16];const extra=structuredClone(shared.mates[0] as AssemblyLinePathMate);extra.id='positional-guide-use';extra.point={...extra.point,component:{occurrencePath:['up'],definition:{id:'guide-part',revision:'r1'}}};extra.orientation={pitchYaw:'free',roll:'free'};shared.mates.push(extra);expect(prepareAssemblySolve(shared).status).toBe('rejected')
})

it('does not certify a native projected angle whose finite uncertainty crosses the requested band',()=>{
 const baseline=withUP(),b=new AssemblyGeometrySnapshot(baseline);let error:number
 try{error=evaluateAssemblyLinePathReferences(b,baseline,request(baseline)).precision.rollErrorRad!}finally{b.dispose()}
 const band=1e-8
 for(const [margin,expected]of [[.25,'precisionLimit'],[4,'ok']]as const){const d=withUP(),h=band-margin*error;d.occurrences[0].pose={rotation:[Math.sin(h/2),0,0,Math.cos(h/2)],translation:[0,-3+3*Math.cos(h)+4*Math.sin(h),4+3*Math.sin(h)-4*Math.cos(h)]};const snapshot=new AssemblyGeometrySnapshot(d)
 try{const r=evaluateAssemblyLinePathReferences(snapshot,d,request(d),{angleToleranceRad:band});expect(r.rollResidualRad!).toBeLessThan(band);expect(r.rollResidualRad!).toBeCloseTo(h,14);expect(r.status).toBe(expected);expect(r.satisfied).toBe(expected==='ok');if(expected==='precisionLimit')expect(r.rollResidualRad!+r.precision.rollErrorRad!).toBeGreaterThan(band);else expect(r.rollResidualRad!+r.precision.rollErrorRad!).toBeLessThanOrEqual(band)}finally{snapshot.dispose()}}
})
