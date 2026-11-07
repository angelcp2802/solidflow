import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import {setOC} from 'replicad'
import {beforeAll,it,expect,vi} from 'vitest'
import {validateAssemblyDocument,serializeAssemblyDocument,parseAssemblyDocument,type AssemblyDocument,type AssemblyLinePathMate} from '../model/assemblyDocument'
import {identityRigidPose,transformRigidPoint,transformRigidDirection,type RigidPose} from '../model/rigidPose'
import {AssemblyDocumentHistory} from '../model/assemblyEditing'
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

for(const axis of ['x','y','z'] as const)for(const reverse of [false,true])it('fresh native follow of component '+axis+' reverse='+reverse+' leaves roll free',()=>{
 const d=original({mode:'distance',distanceMm:2,reverse:false}),m=d.mates[0] as AssemblyLinePathMate;m.orientation={pitchYaw:{mode:'follow',axis,reverse},roll:'free'}
 const r=ready(d)
 try{const report=r.linePaths![0];expect(report.orientationResidualRad).not.toBeNull();expect(report.orientationResidualRad!).toBeLessThanOrEqual(1e-8);expect(report.angleTolerance).toBe(1e-8);expect(report.satisfied).toBe(true);expect(r.scopes[0].result.rank).toBe(5);expect(r.scopes[0].result.localDOF).toBe(1)
 const current=r.document.occurrences.find(v=>v.id==='point')!,basis:[number,number,number]=axis==='x'?[1,0,0]:axis==='y'?[0,1,0]:[0,0,1],world=transformRigidDirection(current.pose as RigidPose,basis);near(world,[reverse?-1:1,0,0],1e-8);near(transformRigidPoint(current.pose as RigidPose,[-2,-3,4]),[0,-3,4]);const snapshot=new AssemblyGeometrySnapshot(validateAssemblyDocument(r.document));try{const actual=evaluateAssemblyLinePathReferences(snapshot,validateAssemblyDocument(r.document),{point:m.point,path:m.path,position:m.position,orientation:m.orientation});expect(actual.satisfied).toBe(true);expect(actual.orientationResidualRad!).toBeLessThanOrEqual(1e-8)}finally{snapshot.dispose()}
 }finally{discardAssemblySolvePreview(r)}
})
it('independent verifier distinguishes component Y from LINE X and retains free null',()=>{
 const d=original({mode:'distance',distanceMm:0,reverse:false}),m=d.mates[0] as AssemblyLinePathMate;d.occurrences[0].pose=identityRigidPose();m.orientation={pitchYaw:{mode:'follow',axis:'y',reverse:false},roll:'free'};const snapshot=new AssemblyGeometrySnapshot(d)
 try{const a=evaluateAssemblyLinePathReferences(snapshot,d,{point:m.point,path:m.path,position:m.position,orientation:m.orientation});expect(a.status).toBe('ok');expect(a.positionResidualMm).toBe(0);expect(a.orientationResidualRad).toBe(Math.PI/2);expect(a.satisfied).toBe(false);const free=evaluateAssemblyLinePathReferences(snapshot,d,{point:m.point,path:m.path,position:m.position,orientation:{pitchYaw:'free',roll:'free'}});expect(free.orientationResidualRad).toBeNull();expect(free.satisfied).toBe(true)}finally{snapshot.dispose()}
})
it('follows the selected point component frame through a nested fixed local rotation',()=>{
 const d=original({mode:'distance',distanceMm:2,reverse:false}),mate=d.mates[0] as AssemblyLinePathMate,part=d.definitions[0];const nested={kind:'assembly' as const,id:'point-container',revision:'r1',name:'Original rotated point source',createdAt:stamp,updatedAt:stamp,mates:[],occurrences:[{id:'inner',name:'Inner',definition:{id:part.id,revision:part.revision},pose:{translation:[2,3,4] as [number,number,number],rotation:[Math.SQRT1_2,0,0,Math.SQRT1_2] as [number,number,number,number]},fixed:true,visible:true,suppressed:false}]};d.definitions.push(nested);d.occurrences[0].definition={id:nested.id,revision:nested.revision};mate.point.component={occurrencePath:['point','inner'],definition:{id:part.id,revision:part.revision}};mate.orientation={pitchYaw:{mode:'follow',axis:'z',reverse:false},roll:'free'}
 const r=ready(validateAssemblyDocument(d));try{const pose=r.document.occurrences.find(v=>v.id==='point')!.pose as RigidPose;const nativeAxis=transformRigidDirection(pose,[0,-1,0]);near(nativeAxis,[1,0,0],1e-8);expect(r.linePaths![0].componentPaths.point).toEqual(['point','inner']);expect(r.linePaths![0].orientationResidualRad!).toBeLessThanOrEqual(1e-8)}finally{discardAssemblySolvePreview(r)}
})

it('combines both angular arithmetic budgets without widening requested bands or consuming a precise-query snapshot',()=>{
 const d=original({mode:'distance',distanceMm:0,reverse:false}),m=d.mates[0] as AssemblyLinePathMate;d.occurrences[0].pose=identityRigidPose();m.orientation={pitchYaw:{mode:'follow',axis:'x',reverse:false},roll:'free'};const snapshot=new AssemblyGeometrySnapshot(d)
 try{const input={point:m.point,path:m.path,position:m.position,orientation:m.orientation},limited=evaluateAssemblyLinePathReferences(snapshot,d,input,{angleToleranceRad:1e-13});expect(limited.status).toBe('precisionLimit');expect(limited.orientationResidualRad).toBe(0);expect(limited.precision.orientationErrorRad!).toBeGreaterThan(1e-13);expect(limited.satisfied).toBe(false);const precise=evaluateAssemblyLinePathReferences(snapshot,d,input,{angleToleranceRad:2e-13});expect(precise.status).toBe('ok');expect(precise.satisfied).toBe(true)}finally{snapshot.dispose()}
})
it('rejects malformed follow declarations before fresh native queries',()=>{
 const d=original(),m=d.mates[0] as AssemblyLinePathMate,snapshot=new AssemblyGeometrySnapshot(d),query=vi.spyOn(CadEngine.prototype,'inspectCurrentLinePath');let reads=0
 try{const follow={mode:'follow',axis:'x',reverse:false};Object.defineProperty(follow,'axis',{enumerable:true,get(){reads++;return'x'}});expect(()=>evaluateAssemblyLinePathReferences(snapshot,d,{point:m.point,path:m.path,position:m.position,orientation:{pitchYaw:follow,roll:'free'}})).toThrow();expect(reads).toBe(0);expect(query).not.toHaveBeenCalled();expect(snapshot.resolveLinePathSelection(d,m.path).kind).toBe('line-path')}finally{query.mockRestore();snapshot.dispose()}
})
it('keeps native follow orientation and report detached from the Apply capability',()=>{
 const d=original({mode:'distance',distanceMm:2,reverse:false}),m=d.mates[0] as AssemblyLinePathMate;m.orientation={pitchYaw:{mode:'follow',axis:'y',reverse:true},roll:'free'};const base=validateAssemblyDocument({...d,mates:[]}),session=new AssemblyWorkerSession()
 try{const r=session.prepare(base,d);if(r.status!=='ready')throw Error(r.message);r.linePaths![0].orientationResidualRad=999;r.linePaths![0].orientation={pitchYaw:'free',roll:'free'};(r.document.mates[0] as AssemblyLinePathMate).orientation={pitchYaw:'free',roll:'free'};const applied=session.apply(base,r.token),saved=applied.document.mates[0] as AssemblyLinePathMate;expect(saved.orientation).toEqual({pitchYaw:{mode:'follow',axis:'y',reverse:true},roll:'free'});const pose=applied.document.occurrences.find(v=>v.id==='point')!.pose;near(transformRigidDirection(pose,[0,1,0]),[-1,0,0],1e-8);expect(()=>session.apply(base,r.token)).toThrow()}finally{session.discard()}
})

it('applies component-follow constraints when the path owner moves and the point owner is fixed',()=>{
 const d=original({mode:'distance',distanceMm:2,reverse:false}),m=d.mates[0] as AssemblyLinePathMate;d.occurrences[0].fixed=true;d.occurrences[1].fixed=false;m.orientation={pitchYaw:{mode:'follow',axis:'y',reverse:false},roll:'free'}
 const r=ready(d);try{const point=r.document.occurrences.find(v=>v.id==='point')!,path=r.document.occurrences.find(v=>v.id==='path')!,a=transformRigidPoint(path.pose as RigidPose,[-2,-3,4]),b=transformRigidPoint(path.pose as RigidPose,[2,-3,4]),t=b.map((v,i)=>(v-a[i])/4);near(t,[0,1,0],1e-8);near(point.pose.translation,[9,0,0],0);near(point.pose.rotation,[0,0,0,1],0);const p=transformRigidPoint(point.pose as RigidPose,[-2,-3,4]);near(p,a.map((v,i)=>v+2*t[i]));expect(r.linePaths![0].orientationResidualRad!).toBeLessThanOrEqual(1e-8);expect(r.scopes[0].result.localDOF).toBe(1)}finally{discardAssemblySolvePreview(r)}
})

it('cancels a fixed-follow preview then preserves explicit orientation through Apply history and saved reopening',()=>{
 const d=original({mode:'percent',percent:25,reverse:false}),m=d.mates[0] as AssemblyLinePathMate;m.orientation={pitchYaw:{mode:'follow',axis:'z',reverse:true},roll:'free'};const history=new AssemblyDocumentHistory(d),before=serializeAssemblyDocument(d),cancelled=ready(d);discardAssemblySolvePreview(cancelled);expect(serializeAssemblyDocument(history.current)).toBe(before);expect(()=>applyAssemblySolvePreview(history,cancelled)).toThrow()
 const r=ready(d);let again:ReturnType<typeof ready>|undefined
 try{const applied=applyAssemblySolvePreview(history,r);expect(history.undo()).toEqual(d);expect(history.redo()).toEqual(applied);const reopened=parseAssemblyDocument(serializeAssemblyDocument(applied));expect((reopened.mates[0] as AssemblyLinePathMate).orientation).toEqual({pitchYaw:{mode:'follow',axis:'z',reverse:true},roll:'free'});again=ready(reopened);expect(again.linePaths![0].orientationResidualRad!).toBeLessThanOrEqual(1e-8);expect(again.linePaths![0].targetCoordinateMm).toBe(1);const pose=again.document.occurrences.find(v=>v.id==='point')!.pose;near(transformRigidDirection(pose as RigidPose,[0,0,1]),[-1,0,0],1e-8);near(transformRigidPoint(pose as RigidPose,[-2,-3,4]),[-1,-3,4])}finally{discardAssemblySolvePreview(r);if(again)discardAssemblySolvePreview(again)}
})
