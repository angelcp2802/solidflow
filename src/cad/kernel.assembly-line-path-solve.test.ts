import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import {setOC} from 'replicad'
import {beforeAll,it,expect,vi} from 'vitest'
import {validateAssemblyDocument,serializeAssemblyDocument,parseAssemblyDocument,type AssemblyDocument,type AssemblyLinePathMate} from '../model/assemblyDocument'
import {identityRigidPose,transformRigidPoint,type RigidPose} from '../model/rigidPose'
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
it('keeps underlying Free LINE extension and physical four DOF with fresh native final evidence',()=>{
 const d=original(),before=serializeAssemblyDocument(d),query=vi.spyOn(CadEngine.prototype,'inspectCurrentLinePath')
 try{const r=ready(d);expect(r.linePaths).toHaveLength(1);const report=r.linePaths![0];expect(report.satisfied).toBe(true);expect(report.coordinateMm).toBeCloseTo(9,8);expect(report.coordinateMm).toBeGreaterThan(report.curveLengthMm);expect(report.transverseResidualMm).toBeLessThan(1e-6);expect(r.scopes[0].result.rank).toBe(2);expect(r.scopes[0].result.localDOF).toBe(4);expect(query.mock.calls.length).toBeGreaterThanOrEqual(3)
 const scene=buildAssemblyScene(validateAssemblyDocument(r.document));for(const b of scene.bodies){expect(b.solidCount).toBe(1);expect(b.volume).toBeCloseTo(96,6);expect(b.area).toBeCloseTo(128,6)}expect(serializeAssemblyDocument(d)).toBe(before);discardAssemblySolvePreview(r)}finally{query.mockRestore()}
})
for(const position of [{mode:'distance',distanceMm:1,reverse:false},{mode:'distance',distanceMm:1,reverse:true},{mode:'percent',percent:25,reverse:false},{mode:'percent',percent:25,reverse:true}] as const)for(const reversed of [false,true])it('fixed material coordinate '+JSON.stringify(position)+' originReverse='+reversed,()=>{
 const d=original(position,reversed),r=ready(d),report=r.linePaths![0],s=position.mode==='distance'?(position.reverse?3:1):(position.reverse?3:1)
 expect(report.targetCoordinateMm).toBe(s);expect(report.coordinateMm).toBeCloseTo(s,5);expect(report.positionResidualMm).toBeLessThanOrEqual(1e-6);expect(r.scopes[0].result.localDOF).toBe(3)
 const point=transformRigidPoint(r.document.occurrences[0].pose as RigidPose,[-2,-3,4]);near(point,[reversed?2-s:-2+s,-3,4]);discardAssemblySolvePreview(r)
})
it('applies authentic preview through history and roundtrip without accepting copied capability',()=>{
 const d=original({mode:'distance',distanceMm:2,reverse:false}),r=ready(d),copy=structuredClone(r)
 const history=new AssemblyDocumentHistory(d);expect(()=>applyAssemblySolvePreview(history,copy)).toThrow();const applied=applyAssemblySolvePreview(history,r);expect(history.undo()).toEqual(d);expect(history.redo()).toEqual(applied)
 const opened=parseAssemblyDocument(serializeAssemblyDocument(applied)),again=ready(opened);expect(again.linePaths![0].satisfied).toBe(true);discardAssemblySolvePreview(again)
})
it('retains immutable private candidate despite mutated worker document and report DTO',()=>{
 const proposed=original({mode:'percent',percent:25,reverse:false}),base=validateAssemblyDocument({...proposed,mates:[]}),session=new AssemblyWorkerSession(),r=session.prepare(base,proposed)
 if(r.status!=='ready')throw Error(r.message);expect(r.linePaths).toHaveLength(1);r.linePaths![0].coordinateMm=999;r.document.occurrences[0].pose.translation[0]=999
 const applied=session.apply(base,r.token);near(transformRigidPoint(applied.document.occurrences[0].pose,[-2,-3,4]),[-1,-3,4]);expect(()=>session.apply(base,r.token)).toThrow()
})
it('rejects conflicting fixed coordinates atomically',()=>{
 const d=original({mode:'distance',distanceMm:1,reverse:false}),m=structuredClone(d.mates[0]) as AssemblyLinePathMate;m.id='conflict';m.position={mode:'distance',distanceMm:2,reverse:false};d.mates.push(m);const before=serializeAssemblyDocument(d);expect(prepareAssemblySolve(d).status).toBe('rejected');expect(serializeAssemblyDocument(d)).toBe(before)
})
it('withholds a new token after an independent native final query fails',()=>{
 const proposed=original(),base=validateAssemblyDocument({...proposed,mates:[]}),session=new AssemblyWorkerSession(),prior=session.prepare(base,proposed);if(prior.status!=='ready')throw Error(prior.message)
 const query=CadEngine.prototype.inspectCurrentLinePath;let calls=0;const spy=vi.spyOn(CadEngine.prototype,'inspectCurrentLinePath').mockImplementation(function(this:CadEngine,...args){if(++calls===3)throw Error('Original final LINE query fault');return query.apply(this,args)})
 try{expect(session.prepare(base,proposed).status).toBe('rejected');expect(()=>session.apply(base,prior.token)).toThrow()}finally{spy.mockRestore()}
})
it('rejects stale and copied native material-line proof purposes',()=>{
 const d=original(),m=d.mates[0] as AssemblyLinePathMate,snapshot=new AssemblyGeometrySnapshot(d)
 try{const w=snapshot.resolveLinePathSelection(d,m.path);expect(()=>snapshot.assertLinePathWitness(structuredClone(w),d)).toThrow();expect(()=>snapshot.assertWitness(w as never,d)).toThrow();const stale=structuredClone(d);stale.occurrences[1].pose.translation[0]++;expect(()=>snapshot.assertLinePathWitness(w,stale)).toThrow()}finally{snapshot.dispose()}
})
it('fresh independent verifier reports declared point on the actual current support',()=>{
 const d=original(),m=d.mates[0] as AssemblyLinePathMate,snapshot=new AssemblyGeometrySnapshot(d)
 try{const r=evaluateAssemblyLinePathReferences(snapshot,d,{point:m.point,path:m.path,position:m.position,orientation:m.orientation});expect(r.status).toBe('ok');expect(r.coordinateMm).toBeCloseTo(9,10);expect(r.transverseResidualMm).toBe(0)}finally{snapshot.dispose()}
})
it('verifies a reused nested child in two noncommuting world frames',()=>{
 const child=original({mode:'distance',distanceMm:2,reverse:false}),{version:_v,units:_u,definitions,...nested}=child
 const parent=validateAssemblyDocument({...child,id:'parent',mates:[],definitions:[...definitions,nested],occurrences:[
 {id:'left',name:'Left',definition:{id:nested.id,revision:nested.revision},pose:{translation:[10,20,30],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2]},fixed:false,suppressed:false,visible:true},
 {id:'right',name:'Right',definition:{id:nested.id,revision:nested.revision},pose:{translation:[-10,0,0],rotation:[Math.SQRT1_2,0,0,Math.SQRT1_2]},fixed:false,suppressed:false,visible:true}]})
 const r=ready(parent);expect(r.linePaths).toHaveLength(2);expect(r.linePaths!.map(v=>v.scopePath)).toEqual([['left'],['right']]);const scene=buildAssemblyScene(validateAssemblyDocument(r.document))
 expect(scene.prototypeCount).toBe(1);expect(scene.solidCount).toBe(4);expect(scene.volume).toBeCloseTo(384,5);expect(scene.area).toBeCloseTo(512,5)
 // Material point reaches child [0,-3,4]; world transforms are independent matrices.
 for(const [id,expected] of [['left',[13,20,34]],['right',[-10,-4,-3]]] as const){const body=scene.bodies.find(b=>b.component.occurrencePath.join('/')===id+'/point')!;const vertex=body.vertexPoints!.find(v=>v.point[0]===-2&&v.point[1]===-3&&v.point[2]===4)!;near(vertex.worldPoint,expected)}discardAssemblySolvePreview(r)
})
it('retains common rigid freedom when both endpoints share one actual owner',()=>{
 const child=original({mode:'free'}),m=structuredClone(child.mates[0]) as AssemblyLinePathMate;child.mates=[];child.occurrences[0].fixed=true
 const {version:_v,units:_u,definitions,...nested}=child;m.point.component.occurrencePath=['group','point'];m.path.component.occurrencePath=['group','path']
 const parent=validateAssemblyDocument({...child,id:'shared-owner',definitions:[...definitions,nested],mates:[m],occurrences:[{id:'group',name:'Group',definition:{id:nested.id,revision:nested.revision},pose:{translation:[10,20,30],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2]},fixed:false,visible:true,suppressed:false}]})
 const r=ready(parent),scope=r.scopes.find(s=>s.definition.id==='shared-owner')!;expect(scope.result.rank).toBe(0);expect(scope.result.localDOF).toBe(6);expect(r.document.occurrences[0].pose).toEqual(parent.occurrences[0].pose);discardAssemblySolvePreview(r)
})
it('carries fresh physical LINE reports through projected drag and sampled motion',()=>{
 const d=original(),component={occurrencePath:['point'],definition:{...d.occurrences[0].definition}}
 const drag=prepareAssemblyDragPreview(d,{component,pose:{translation:[12,0,0],rotation:[0,0,0,1]},mode:'translate'});if(drag.status!=='ready')throw Error(drag.message);expect(drag.linePaths![0].coordinateMm).toBeCloseTo(12,5);expect(drag.linePaths![0].satisfied).toBe(true);discardAssemblySolvePreview(drag)
 const motion=prepareAssemblyMotionPreview(d,{component,translation:[12,0,0],rotation:{axis:0,angle:0}});if(motion.status!=='ready')throw Error(motion.message);expect(motion.linePaths).toHaveLength(1);expect(motion.linePaths![0].satisfied).toBe(true);discardAssemblySolvePreview(motion)
})
it('refuses original huge cancelled placement chains rather than publishing a weakened-band result',()=>{
 const child=original(),{version:_v,units:_u,definitions,...nested}=child
 nested.occurrences.forEach(o=>{o.pose.translation[0]-=1e16});const d=validateAssemblyDocument({...child,id:'large-parent',mates:[],definitions:[...definitions,nested],occurrences:[{id:'outer',name:'Outer',definition:{id:nested.id,revision:nested.revision},pose:{translation:[1e16,0,0],rotation:[0,0,0,1]},fixed:false,visible:true,suppressed:false}]})
 const before=serializeAssemblyDocument(d),r=prepareAssemblySolve(d);expect(r.status).toBe('rejected');expect(serializeAssemblyDocument(d)).toBe(before)
})

for(const position of [{mode:'percent',percent:0,reverse:true},{mode:'distance',distanceMm:4,reverse:true}] as const)it('charges actual L coefficient for reverse coordinate '+position.mode,()=>{
 const d=original(position);d.occurrences[0].pose.translation=[position.mode==='distance'?0:4,0,0]
 const native=CadEngine.prototype.inspectCurrentLinePath,spy=vi.spyOn(CadEngine.prototype,'inspectCurrentLinePath').mockImplementation(function(this:CadEngine,...args){const r=native.apply(this,args);return {...r,precision:{...r.precision,lengthMm:9e-7}}})
 try{const snapshot=new AssemblyGeometrySnapshot(d);try{const m=d.mates[0] as AssemblyLinePathMate,r=evaluateAssemblyLinePathReferences(snapshot,d,{point:m.point,path:m.path,position:m.position,orientation:m.orientation});expect(r.positionResidualMm).toBe(0);expect(r.status).toBe('precisionLimit')}finally{snapshot.dispose()}expect(prepareAssemblySolve(d).status).toBe('rejected')}finally{spy.mockRestore()}
})
it('does not charge L uncertainty when reverse percent100 cancels its coefficient exactly',()=>{
 const d=original({mode:'percent',percent:100,reverse:true});d.occurrences[0].pose.translation=[0,0,0]
 const native=CadEngine.prototype.inspectCurrentLinePath,spy=vi.spyOn(CadEngine.prototype,'inspectCurrentLinePath').mockImplementation(function(this:CadEngine,...args){const r=native.apply(this,args);return {...r,precision:{...r.precision,lengthMm:9e-7}}})
 try{const r=ready(d);expect(r.linePaths![0].targetCoordinateMm).toBe(0);expect(r.linePaths![0].satisfied).toBe(true);discardAssemblySolvePreview(r)}finally{spy.mockRestore()}
})

for(const reverse of [false,true])it('admits actual material trim boundary distance4 and rejects saved distance5, reverse='+reverse,()=>{
 const boundary=original({mode:'distance',distanceMm:4,reverse}),r=ready(boundary)
 expect(r.linePaths![0].targetCoordinateMm).toBe(reverse?0:4);expect(r.linePaths![0].positionResidualMm).toBeLessThanOrEqual(1e-6);discardAssemblySolvePreview(r)
 const outside=original({mode:'distance',distanceMm:5,reverse}),before=serializeAssemblyDocument(outside),result=prepareAssemblySolve(outside)
 expect(result.status).toBe('rejected');expect('token'in result).toBe(false);expect(serializeAssemblyDocument(outside)).toBe(before)
})
