import { requireBinaryAssemblyMate as binaryMate } from './assemblyBinaryFixtures.test-utils'
import { expect, it } from 'vitest'
import type { Vec3 } from '../cad/kernel.types'
import { assemblyLimitDistanceActivity, validateAssemblyLimitDistanceLimits } from './assemblyLimitDistance'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, validateAssemblyPlaneReference,
  type AssemblyDocument, type AssemblyLimitDistanceMate, type AssemblyPlaneReference } from './assemblyDocument'
import { AssemblyDocumentHistory } from './assemblyEditing'
import { inspectBinaryAssemblyMateReferences as inspectAssemblyMateReferences } from './assemblyBinaryFixtures.test-utils'
import { prepareAssemblyPartUpdate, repairAssemblyEndpoint } from './assemblySourceUpdates'
import { evaluateRigidMates } from './assemblyMateEquations'
import { solveRigidMates } from './assemblySolver'
import { projectRigidMateTarget } from './assemblyProjection'
import { composeRigidPoses, identityRigidPose, transformRigidDirection, type RigidPose } from './rigidPose'
import { retractRigidBodyPose, rotationExp } from './assemblyKinematics'
import type { RigidBinaryMateConstraint as RigidMateConstraint, RigidMateEndpoint, RigidMateProblem, RigidMateSupport } from './assemblySolveTypes'
type BinaryMateProblem = Omit<RigidMateProblem, 'constraints'> & { constraints: RigidMateConstraint[] }
import type { RigidGearConstraint, RigidScrewConstraint, RigidRackPinionConstraint } from './assemblySolveTypes'

// Original syntax fixtures and Cartesian supports. These have no native BRep,
// reference authority or file/dialog evidence. Expected coordinates are literal.
const stamp='2026-10-17T00:00:00.000Z',partRef={id:'limit-part',revision:'r1'}
const principal=(name:string|null='moving'):AssemblyPlaneReference=>({kind:'principal-plane',component:name===null?null:{occurrencePath:[name],definition:{...partRef}},plane:'XY'})
function declaration():AssemblyDocument {
  return {version:2,kind:'assembly',id:'limit-original',revision:'root-r1',name:'Original interval',units:'mm',createdAt:stamp,updatedAt:stamp,
    definitions:[{kind:'part',...partRef,document:{version:1,id:partRef.id,name:'Original box declaration',units:'mm',createdAt:stamp,updatedAt:stamp,
      features:[{id:'profile',name:'Original rectangle',type:'sketch',suppressed:false,plane:'XY',offset:0,profile:{kind:'rectangle',center:[0,0],width:10,height:6}},
        {id:'solid',name:'Original extrusion',type:'extrude',suppressed:false,sketchId:'profile',depth:2,symmetric:false,bodyOperation:{mode:'new',bodyId:'limit-body'}}]}}],
    occurrences:['moving','fixed'].map(id=>({id,name:id,definition:{...partRef},pose:identityRigidPose(),fixed:id==='fixed',visible:true,suppressed:false})),
    mates:[{id:'limit',name:'Signed interval',suppressed:false,type:'limit-distance',first:principal(),second:principal('fixed'),alignment:'aligned',limits:{minimum:10,maximum:30}}]}
}
const plane:RigidMateSupport={kind:'plane',point:[0,0,0],normal:[0,0,1],xDirection:[1,0,0],tolerance:0}
const end=(bodyId:string|null,support:RigidMateSupport=plane,frame=identityRigidPose()):RigidMateEndpoint=>({bodyId,support:structuredClone(support),frame})
const numeric=(minimum=10,maximum=30,alignment:'aligned'|'opposed'='aligned'):Extract<RigidMateConstraint,{type:'limit-distance'}>=>({
  id:'limit',type:'limit-distance',first:end('moving'),second:end(null),alignment,limits:{minimum,maximum}})
function problem(q=20,minimum=10,maximum=30):BinaryMateProblem {
  return{bodies:[{id:'moving',fixed:false,pose:{translation:[0,0,q],rotation:[0,0,0,1]}}],constraints:[numeric(minimum,maximum)],
    origin:[0,0,0],lengthScale:10,lengthTolerance:1e-6,angleTolerance:1e-8}
}
function near(actual:number,expected:number,tolerance=1e-6):void {expect(Number.isFinite(actual)).toBe(true);expect(Math.abs(actual-expected)).toBeLessThanOrEqual(tolerance)}
function target(z:number,mode:'translate'|'rotate'='translate') {return{bodyId:'moving',frame:identityRigidPose(),targetPose:{translation:[0,0,z] as Vec3,rotation:[0,0,0,1] as RigidPose['rotation']},mode}}

it.each([{minimum:-30,maximum:-10},{minimum:0,maximum:0},{minimum:10,maximum:30},{minimum:-1,maximum:1}])('preserves signed inclusive limits %j',(limits)=>{
  const parsed=validateAssemblyLimitDistanceLimits(limits);expect(parsed).toEqual(limits);expect(parsed).not.toBe(limits)
})
it.each([{minimum:2,maximum:1},{minimum:NaN,maximum:3},{minimum:0,maximum:Infinity},{minimum:0},{minimum:0,maximum:1,activeSet:[]},[0,1],null])('rejects malformed limits without coercion %j',(limits)=>{
  expect(()=>validateAssemblyLimitDistanceLimits(limits)).toThrow()
})
it('rejects executable limit fields without invoking them',()=>{
  let invoked=0;const limits={minimum:0,maximum:1};Object.defineProperty(limits,'minimum',{get(){invoked++;return 0}})
  expect(()=>validateAssemblyLimitDistanceLimits(limits)).toThrow();expect(invoked).toBe(0)
})
it.each([{q:10,activity:'minimum'},{q:20,activity:'interior'},{q:30,activity:'maximum'}])('reports geometric activity only for q=$q',({q,activity})=>{
  expect(assemblyLimitDistanceActivity(q,{minimum:10,maximum:30},1e-6)).toBe(activity)
})
it('reports both equal and precision-near boundaries without inferring equality rank',()=>{
  expect(assemblyLimitDistanceActivity(10,{minimum:10,maximum:10},1e-6)).toBe('both')
  expect(assemblyLimitDistanceActivity(10+2e-7,{minimum:10,maximum:10+4e-7},1e-6)).toBe('both')
})
it.each(['aligned','opposed'] as const)('round-trips an explicit %s plane interval and never saves an active set',(alignment)=>{
  const document=declaration();document.mates=[{...document.mates[0] as AssemblyLimitDistanceMate,alignment}]
  const parsed=parseAssemblyDocument(serializeAssemblyDocument(document));expect(parsed).toEqual(document)
  expect(Object.keys(binaryMate(parsed.mates[0])).sort()).toEqual(['alignment','first','id','limits','name','second','suppressed','type'])
  const mate=binaryMate(parsed.mates[0]);if(mate.type!=='limit-distance')throw Error('Missing interval');mate.limits.minimum=-99;expect((binaryMate(document.mates[0]) as AssemblyLimitDistanceMate).limits.minimum).toBe(10)
})
it.each(['axis','cylinder-surface','sphere-surface','line'])('does not admit %s as a saved plane endpoint',(support)=>{
  const document=declaration(),first={kind:'face',component:{occurrencePath:['moving'],definition:{...partRef}},body:null,face:{sourceFeatureId:'solid',key:'face-v1|original'},support}
  expect(()=>validateAssemblyDocument({...document,mates:[{...document.mates[0],first}]})).toThrow()
  expect(()=>validateAssemblyPlaneReference(first)).toThrow()
})
it.each(['distance','activeSet','coordinate','phase'])('rejects extra persisted %s fields',(field)=>{
  const document=declaration();expect(()=>validateAssemblyDocument({...document,mates:[{...document.mates[0],[field]:0}]})).toThrow()
})
it('preserves legacy distance semantics and rejects limit fields on that family',()=>{
  const document=declaration(),mate=binaryMate(document.mates[0])
  const legacy={id:mate.id,name:mate.name,suppressed:false,type:'distance',first:mate.first,second:mate.second,alignment:'aligned',distance:-4}
  expect(validateAssemblyDocument({...document,mates:[legacy]}).mates[0]).toEqual(legacy)
  expect(()=>validateAssemblyDocument({...document,mates:[{...legacy,limits:{minimum:0,maximum:4}}]})).toThrow()
})
it('keeps interval syntax through detached history, suppression, Undo and Redo',()=>{
  const document=declaration(),history=new AssemblyDocumentHistory(document),original=binaryMate(history.current.mates[0]) as AssemblyLimitDistanceMate
  const {id,...saved}=original
  history.commit({type:'update-mate',mateId:id,mate:{...saved,name:'Edited bounds',limits:{minimum:-5,maximum:5},suppressed:true}})
  expect(history.current.mates[0]).toMatchObject({type:'limit-distance',limits:{minimum:-5,maximum:5},suppressed:true})
  expect(history.undo().mates).toEqual(document.mates);expect(history.redo().mates[0]).toMatchObject({name:'Edited bounds',suppressed:true})
  expect(document.mates[0]).toEqual(original)
})
it('keeps stale revision diagnostics and requires explicit plane-purpose repair',()=>{
  const document=declaration(),source=document.definitions[0];if(source.kind!=='part')throw Error('Part missing')
  const plan=prepareAssemblyPartUpdate(document,partRef,source.document,'r2');expect(plan.endpoints).toHaveLength(2)
  expect(inspectAssemblyMateReferences(plan.document)[0].first.diagnostics.map(item=>item.code)).toContain('STALE_DEFINITION')
  const mate=binaryMate(document.mates[0]) as AssemblyLimitDistanceMate,first={...principal(),component:{occurrencePath:['moving'],definition:{id:partRef.id,revision:'r2'}}}
  const repaired=repairAssemblyEndpoint(plan.document,{scope:{id:document.id,revision:document.revision},mateId:mate.id,side:'first'},first)
  expect(inspectAssemblyMateReferences(repaired)[0].first.diagnostics).toEqual([]);expect(repaired.mates[0]).toMatchObject({limits:{minimum:10,maximum:30},alignment:'aligned'})
})
it('retains occurrence and inherited suppression diagnostics without changing interval intent',()=>{
  const document=declaration();document.occurrences[0].suppressed=true
  const inspected=inspectAssemblyMateReferences(document)[0];expect(inspected.first.diagnostics.map(item=>item.code)).toContain('SUPPRESSED_COMPONENT')
  expect(inspected.mate).toMatchObject({type:'limit-distance',limits:{minimum:10,maximum:30}})
})

it.each([{q:5,margins:[-.5,2.5],violation:5},{q:10,margins:[0,2],violation:0},{q:20,margins:[1,1],violation:0},{q:30,margins:[2,0],violation:0},{q:40,margins:[3,-1],violation:10}])('evaluates signed coordinate and BOTH margins at q=$q',({q,margins,violation})=>{
  const evaluated=evaluateRigidMates(problem(q));expect(evaluated.diagnostics).toEqual([]);expect(evaluated.rows).toHaveLength(3)
  expect(evaluated.rows.every(row=>row.kind==='angle')).toBe(true);expect(evaluated.inequalities).toHaveLength(2)
  evaluated.inequalities!.forEach((item,index)=>near(item.margin,margins[index],1e-12))
  for(const [index,expected] of [[0,[0,0,1,0,0,0]],[1,[0,0,-1,0,0,0]]] as const){
    const actual=evaluated.inequalities![index].jacobian;expect(actual).toHaveLength(6)
    actual.forEach((value,column)=>expect(value===expected[column]).toBe(true)) // Exact numeric equality treats +0 and -0 equally.
  }
  near(evaluated.limitDistances![0].coordinate,q,1e-12);near(evaluated.checks[0].lengthResidual,violation,1e-12);expect(evaluated.checks[0].satisfied).toBe(violation===0)
})
it.each(['aligned','opposed'] as const)('obeys endpoint reversal q prime=-s*q for %s',(alignment)=>{
  const input=problem(20);input.constraints=[{...numeric(-40,40,alignment),first:end('moving',alignment==='opposed'?{...plane,normal:[0,0,-1]}:plane),second:end(null)}]
  const forward=evaluateRigidMates(input),constraint=input.constraints[0],reverse=evaluateRigidMates({...input,constraints:[{...constraint,first:constraint.second,second:constraint.first}]})
  expect(forward.diagnostics).toEqual([]);expect(reverse.diagnostics).toEqual([]);near(reverse.limitDistances![0].coordinate,alignment==='aligned'?-20:20)
})
it.each(['aligned','opposed'] as const)('projects reversed %s supports only with explicitly equivalent signed bounds',(alignment)=>{
  const input=problem(20),original={...numeric(10,30,alignment),first:end('moving',alignment==='opposed'?{...plane,normal:[0,0,-1]}:plane),second:end(null)},
    limits=alignment==='aligned'?{minimum:-30,maximum:-10}:{minimum:10,maximum:30}
  input.constraints=[{...original,first:original.second,second:original.first,limits}]
  const before=JSON.stringify(input),result=projectRigidMateTarget(input,target(40))
  expect(result.status,result.status==='rejected'?result.message:'').toBe('ready')
  if(result.status==='ready'){
    near(result.resolvedPose.translation[2],30);expect(result.result.rank).toBe(2)
    const measured=evaluateRigidMates(input,result.result.poses!);expect(measured.checks[0].satisfied).toBe(true)
    near(measured.limitDistances![0].coordinate,alignment==='aligned'?-30:30);expect(measured.limitDistances![0].limits).toEqual(limits)
  }
  expect(JSON.stringify(input)).toBe(before)
})
it('uses canonical local planes independent of arbitrary in-plane support origins',()=>{
  const input=problem(20),mate=numeric();mate.first=end('moving',{...plane,point:[1e16,-1e16,0]});mate.second=end(null,{...plane,point:[-1e16,1e16,0]})
  input.constraints=[mate];const value=evaluateRigidMates(input);expect(value.diagnostics).toEqual([]);near(value.limitDistances![0].coordinate,20)
})
it('checks independent finite differences and all six common rigid gauge directions off the orientation manifold',()=>{
  const input=problem(20);input.bodies=[{id:'moving',fixed:false,pose:{translation:[3,-2,20],rotation:rotationExp([.2,-.1,.3])}},
    {id:'other',fixed:false,pose:{translation:[-1,4,1],rotation:rotationExp([-.1,.3,-.2])}}]
  input.constraints=[{...numeric(-100,100),first:end('moving',plane,{translation:[1,2,3],rotation:rotationExp([.1,.2,0])}),second:end('other',plane,{translation:[-2,1,4],rotation:rotationExp([-.2,0,.1])})}]
  const base=evaluateRigidMates(input);expect(base.diagnostics).toEqual([])
  for(const h of [2e-6,7e-7])for(let column=0;column<12;column++){
    const body=input.bodies[Math.floor(column/6)],delta=Array(6).fill(0) as number[];delta[column%6]=h
    const plus=evaluateRigidMates(input,new Map([[body.id,retractRigidBodyPose(body.pose,delta,input.origin,input.lengthScale)]]));delta[column%6]=-h
    const minus=evaluateRigidMates(input,new Map([[body.id,retractRigidBodyPose(body.pose,delta,input.origin,input.lengthScale)]]))
    for(let index=0;index<2;index++)near(base.inequalities![index].jacobian[column],(plus.inequalities![index].margin-minus.inequalities![index].margin)/(2*h),3e-7)
  }
  for(let axis=0;axis<6;axis++){
    // Scalar margins and angular rows expressed in the moving second frame
    // are invariant under a common rigid gauge, even off the manifold.
    for(const row of [...base.inequalities!,...base.rows])near(row.jacobian[axis]+row.jacobian[axis+6],0,1e-12)
    near(base.rows.reduce((sum,row)=>sum+row.residual*(row.jacobian[axis]+row.jacobian[axis+6]),0),0,1e-12)
  }
})
it('preserves a huge common frame by subtracting the conditioning origin first',()=>{
  const input=problem(20),base=1e16;input.origin=[base,base,base]
  input.bodies[0].pose.translation=[base,base,base+20];const mate=numeric();mate.second=end(null,plane,{translation:[base,base,base],rotation:[0,0,0,1]});input.constraints=[mate]
  const evaluated=evaluateRigidMates(input);expect(evaluated.diagnostics).toEqual([]);near(evaluated.limitDistances![0].coordinate,20)
})
it('preserves signed interval coordinates under an independent common rotated frame',()=>{
  const input=problem(20),common:RigidPose={translation:[120,-70,90],rotation:rotationExp([.2,.3,-.1])}
  input.origin=[...common.translation];input.bodies[0].pose=composeRigidPoses(common,input.bodies[0].pose)
  input.constraints=[{...numeric(),second:end(null,plane,common)}]
  const value=evaluateRigidMates(input);expect(value.diagnostics).toEqual([]);near(value.limitDistances![0].coordinate,20,1e-12)
  expect(value.checks[0].satisfied).toBe(true);expect(solveRigidMates(input).rank).toBe(2)
})
it('does not infer path feasibility from two feasible endpoint coordinates',()=>{
  // Both normals are n(t)=Rx(t)Z. P2=0 and P1=20*n(t)+15*Z,
  // so the independently prescribed coordinate is 20+15*cos(t).
  // Endpoint poses at +/-pi/2 have q=20, while the middle has q=35.
  for(const {angle,q,accepted} of [{angle:-Math.PI/2,q:20,accepted:true},{angle:0,q:35,accepted:false},{angle:Math.PI/2,q:20,accepted:true}]){
    const input=problem(),rotation=rotationExp([angle,0,0])
    input.bodies[0].pose={translation:[0,-20*Math.sin(angle),20*Math.cos(angle)+15],rotation}
    input.constraints=[{...numeric(),second:end(null,plane,{translation:[0,0,0],rotation})}]
    const evaluated=evaluateRigidMates(input);expect(evaluated.diagnostics).toEqual([])
    near(evaluated.limitDistances![0].coordinate,q,1e-12);near(evaluated.checks[0].angleResidual,0,1e-12)
    expect(evaluated.checks[0].satisfied).toBe(accepted)
    near(evaluated.checks[0].lengthResidual,accepted?0:5,1e-12)
  }
})
it.each([false,true])('rejects body/frame/plane cancellation before apparent zero residual, reversed=%s',(reversed)=>{
  const input=problem(0,0,0);input.lengthScale=1;input.bodies[0].pose.translation=[0,0,-1e16]
  const first=end('moving',{...plane,point:[0,0,1e16]},{translation:[0,0,1],rotation:[0,0,0,1]}),second=end(null)
  input.constraints=[{...numeric(0,0),first:reversed?second:first,second:reversed?first:second}]
  const before=JSON.stringify(input),evaluated=evaluateRigidMates(input),solved=solveRigidMates(input)
  expect(evaluated.diagnostics[0].code).toBe('precisionLimit');expect(solved.status).toBe('precisionLimit');expect(solved.poses).toBeNull();expect(JSON.stringify(input)).toBe(before)
})
it.each([false,true])('rejects dyadic subnormal normalization before a false accepted margin, reversed=%s',(reversed)=>{
  const L=2**-51,input=problem(0);input.lengthScale=2**1023;input.lengthTolerance=L
  input.bodies[0].pose.translation=[0,0,.375*L]
  const first=end('moving',{...plane,point:[0,0,1.375*L]},{translation:[0,0,.375*L],rotation:[0,0,0,1]}),second=end(null)
  // Exact dyadic coordinate is 17L/8, outside the interval [0,5L/8].
  expect(17n-5n).toBe(12n)
  input.constraints=[{...numeric(0,.625*L),first:reversed?second:first,second:reversed?first:second}]
  const evaluated=evaluateRigidMates(input);expect(evaluated.diagnostics[0].code).toBe('precisionLimit');expect(solveRigidMates(input).poses).toBeNull()
})
it.each([10,20,30])('preserves bilateral rank2/DOF4 at q=%s and reports boundary lineality separately',(q)=>{
  const result=solveRigidMates(problem(q));expect(result.status).toBe('underdefined');expect(result.rank).toBe(2);expect(result.localDOF).toBe(4)
  expect(result.evidence.groups[0].limitCone?.linealityDimension).toBe(q===20?4:3);expect(result.evidence.groups[0].limitCone).not.toHaveProperty('dimension')
})
it('retains rank2/DOF4 for equal limits while their two-sided cone has lineality3',()=>{
  const result=solveRigidMates(problem(10,10,10));expect(result.poses).not.toBeNull();expect(result.rank).toBe(2);expect(result.localDOF).toBe(4)
  expect(result.evidence.groups[0].limitCone?.activeBounds).toHaveLength(2);expect(result.evidence.groups[0].limitCone?.linealityDimension).toBe(3)
})
it.each([5,40])('restores an out-of-interval coordinate q=%s without saving a boundary equality',(q)=>{
  const input=problem(q),before=JSON.stringify(input),result=solveRigidMates(input);expect(result.poses).not.toBeNull();expect(result.rank).toBe(2)
  near(result.poses!.get('moving')!.translation[2],q<10?10:30);expect(JSON.stringify(input)).toBe(before)
})
it('retains GN restoration from the independent sixty-degree redundant-row counterexample',()=>{
  const input=problem(20);input.bodies[0].pose.rotation=[0,.5,0,Math.sqrt(3)/2]
  // n1 dot (-f)=-1/2, but every infinitesimal delta_n1 is tangent to n1.
  near(Math.sqrt(3)/2*(-Math.sqrt(3)/2)+.5*(1-.5),-.5,1e-15)
  const result=solveRigidMates(input);expect(result.poses).not.toBeNull();expect(result.iterations).toBeGreaterThan(0)
  const normal=transformRigidDirection(result.poses!.get('moving')!,[0,0,1]);near(normal[2],1,1e-8);expect(result.rank).toBe(2);expect(result.evidence.groups[0].seededConstraintIds).toEqual([])
})
it('preserves six floating gauge modes and bilateral rank2',()=>{
  const input=problem(20);input.bodies.push({id:'other',fixed:false,pose:identityRigidPose()});input.constraints=[{...numeric(),second:end('other')}]
  const result=solveRigidMates(input);expect(result.poses).not.toBeNull();expect(result.rank).toBe(2);expect(result.localDOF).toBe(10);expect(result.evidence.groups[0].unanchored).toBe(true)
})
it.each([true,false])('checks both-fixed interval feasibility without attributing inequality rank, feasible=%s',(feasible)=>{
  const input=problem(feasible?20:40);input.bodies[0].fixed=true;const result=solveRigidMates(input)
  if(feasible){expect(result.poses).not.toBeNull();expect(result.rank).toBe(0);expect(result.localDOF).toBe(0)}
  else{expect(result.status).toBe('inconsistent');expect(result.certificates[0].kind).toBe('fixedConstraint');expect(result.poses).toBeNull()}
})
it('rejects a same-owner invariant contradiction without publishing candidate data',()=>{
  const input=problem(20);input.constraints=[{...numeric(),second:end('moving')}];const before=JSON.stringify(input),result=solveRigidMates(input)
  expect(result.poses).toBeNull();expect(result.status).toBe('nonConverged');expect(result.gearAngles.size+result.screwAngles.size+result.rackPinionAngles.size).toBe(0);expect(JSON.stringify(input)).toBe(before)
})
it('honors zero restoration iterations and rejects the antipodal limit chart without reseeding',()=>{
  const input=problem(40),result=solveRigidMates(input,{maxIterations:0});expect(result.poses).toBeNull();expect(result.iterations).toBe(0)
  input.bodies[0].pose.rotation=[1,0,0,0];const antipodal=solveRigidMates(input);expect(antipodal.status).toBe('nonConverged');expect(antipodal.evidence.groups[0].seededConstraintIds).toEqual([])
})
it.each([{q:10,target:20,resolved:20},{q:10,target:0,resolved:10},{q:20,target:40,resolved:30},{q:30,target:20,resolved:20},{q:30,target:40,resolved:30}])('projects q=$q toward $target to $resolved without clamping a pose',({q,target:z,resolved})=>{
  const input=problem(q),before=JSON.stringify(input),result=projectRigidMateTarget(input,target(z))
  expect(result.status,result.status==='rejected'?result.message:'').toBe('ready');if(result.status!=='ready')return
  near(result.resolvedPose.translation[2],resolved);expect(result.result.rank).toBe(2);expect(result.result.localDOF).toBe(4)
  expect(result.evidence.inequalityProjection?.primary.certified).toBe(true);expect(result.evidence.convergence).toBe(z===resolved?'target':'stationary');expect(JSON.stringify(input)).toBe(before)
})
it('allows secondary inward motion from a weak active bound while preserving the primary rotation image',()=>{
  const result=projectRigidMateTarget(problem(10),target(20,'rotate'));expect(result.status,result.status==='rejected'?result.message:'').toBe('ready')
  if(result.status==='ready'){near(result.resolvedPose.translation[2],20);expect(result.evidence.inequalityProjection?.secondary?.certified).toBe(true);near(result.evidence.angleResidual,0,1e-8)}
})
it('keeps equal opposite limits and duplicate declarations through projected intent',()=>{
  const input=problem(10,10,10);input.constraints.push({...numeric(10,10),id:'duplicate'})
  const result=projectRigidMateTarget(input,target(30));expect(result.status,result.status==='rejected'?result.message:'').toBe('ready')
  if(result.status==='ready'){near(result.resolvedPose.translation[2],10);expect(result.result.rank).toBe(2);expect(result.result.localDOF).toBe(4)}
})
it('rejects a strict hard driver outside the interval instead of projecting it',()=>{
  const input=problem(20);input.constraints.push({id:'driver',type:'lock',first:end(null,plane,{translation:[0,0,40],rotation:[0,0,0,1]}),second:end('moving'),relativePose:identityRigidPose()})
  const before=JSON.stringify(input),result=solveRigidMates(input);expect(result.poses).toBeNull();expect(JSON.stringify(input)).toBe(before)
})
it('uses the correct group columns with unrelated owners before the driver',()=>{
  const input=problem(10);input.bodies.unshift({id:'unrelated',fixed:false,pose:{translation:[17,-4,99],rotation:[0,0,0,1]}})
  const result=projectRigidMateTarget(input,target(20));expect(result.status,result.status==='rejected'?result.message:'').toBe('ready')
  if(result.status==='ready'){near(result.resolvedPose.translation[2],20);expect(result.result.poses!.get('unrelated')).toEqual(input.bodies[0].pose);expect(result.result.evidence.groups).toHaveLength(2)}
})
it('rejects exhausted projection pivots and leaves the original state detached',()=>{
  const input=problem(10),before=JSON.stringify(input),result=projectRigidMateTarget(input,target(20),{maxTrials:1})
  expect(result.status).toBe('rejected');expect(JSON.stringify(input)).toBe(before)
})
it('keeps legacy evaluations free of unilateral fields',()=>{
  const input=problem(10);input.constraints=[{id:'legacy',type:'distance',first:end('moving'),second:end(null),alignment:'aligned',distance:10}]
  const value=evaluateRigidMates(input);expect(value.inequalities).toBeUndefined();expect(value.limitDistances).toBeUndefined();expect(solveRigidMates(input).rank).toBe(3)
})
it.each(['cylinder','line','sphere'] as const)('rejects numeric %s supports without reinterpreting their coordinate',(kind)=>{
  const support:RigidMateSupport=kind==='sphere'?{kind,point:[0,0,0],radius:1,tolerance:0}:kind==='line'?{kind,point:[0,0,0],axis:[0,0,1],tolerance:0}
    :{kind,point:[0,0,0],axis:[0,0,1],xDirection:[1,0,0],radius:1,tolerance:0}
  const input=problem();input.constraints=[{...numeric(),first:end('moving',support)}]
  expect(solveRigidMates(input).status).toBe('invalidInput');expect(evaluateRigidMates(input).diagnostics).not.toEqual([])
})
it('includes inactive inequalities in the unchanged connected-group row capacity',()=>{
  const input=problem();input.constraints=Array.from({length:52},(_,index)=>({...numeric(),id:'limit-'+index}))
  const before=JSON.stringify(input),result=solveRigidMates(input);expect(result.status).toBe('capacityLimit');expect(result.poses).toBeNull();expect(JSON.stringify(input)).toBe(before)
})
it('keeps overlapping redundant intervals bilateral rank2 and rejects disjoint intervals without false rank',()=>{
  const input=problem();input.constraints.push({...numeric(15,25),id:'overlap'})
  const accepted=solveRigidMates(input);expect(accepted.poses).not.toBeNull();expect(accepted.rank).toBe(2);expect(accepted.localDOF).toBe(4)
  input.constraints.push({...numeric(40,50),id:'outside'});const result=solveRigidMates(input)
  expect(result.poses).toBeNull();expect(result.status).toBe('nonConverged');expect(result.rank).toBeNull();expect(result.certificates).toEqual([])
})
it('detaches fresh measurement limits, inequalities and lineality evidence',()=>{
  const input=problem(10),before=JSON.stringify(input),value=evaluateRigidMates(input),result=solveRigidMates(input)
  value.limitDistances![0].limits.minimum=999;value.inequalities![0].jacobian[2]=999;result.evidence.groups[0].limitDistances![0].limits.minimum=999
  result.evidence.groups[0].limitCone!.activeBounds[0].constraintId='foreign';expect(JSON.stringify(input)).toBe(before)
})
const cylinder:RigidMateSupport={kind:'cylinder',point:[0,0,0],axis:[0,0,1],xDirection:[1,0,0],radius:1,tolerance:0}
function tracked(kind:'gear'|'screw'|'rack-pinion',passive:boolean):BinaryMateProblem {
  const input=problem(10),turns=4*Math.PI,identity=identityRigidPose().rotation
  input.bodies.push({id:'follower',fixed:false,pose:{translation:[0,0,kind==='gear'?0:10+(kind==='screw'?4:turns)],rotation:[...identity]}})
  const first=end('moving',cylinder),second=end('follower',cylinder)
  let mechanical:RigidGearConstraint|RigidScrewConstraint|RigidRackPinionConstraint
  if(kind==='gear')mechanical={id:'tracker',type:kind,first,second,carrier:null,ratio:{numerator:2,denominator:1},direction:'opposed',
    neutralRotations:{first:[...identity],second:[...identity]},angles:{first:turns,second:-2*turns},phase:0}
  else if(kind==='screw')mechanical={id:'tracker',type:kind,first,second,lead:2,reverse:false,alignment:'aligned',neutralRotation:[...identity],angle:turns,neutralTravel:0}
  else mechanical={id:'tracker',type:kind,first,second,conversion:{mode:'travel',override:2*Math.PI},reverse:false,neutralRotation:[...identity],angle:turns,neutralTravel:0}
  if(passive){if(mechanical.type==='gear')input.passiveGears=[mechanical];else if(mechanical.type==='screw')input.passiveScrews=[mechanical];else input.passiveRackPinions=[mechanical]}
  else{
    input.constraints.push(mechanical)
    if(kind!=='gear')input.constraints.push({id:'follower-guide',type:'concentric',first:end('follower',cylinder),second:end(null,cylinder),alignment:'aligned',rotationLock:[...identity]})
  }
  return input
}
it.each(['gear','screw','rack-pinion'] as const)('preserves accepted active %s winding through constrained projection',(kind)=>{
  const input=tracked(kind,false),before=JSON.stringify(input),result=projectRigidMateTarget(input,target(20,'rotate'))
  expect(result.status,result.status==='rejected'?result.message:'').toBe('ready');if(result.status!=='ready')return
  near(result.resolvedPose.translation[2],20);const evaluation=evaluateRigidMates(input,result.result.poses!)
  expect(evaluation.diagnostics).toEqual([]);expect(evaluation.checks.every(item=>item.satisfied)).toBe(true)
  if(kind==='gear'){near(result.result.gearAngles.get('tracker')!.first,4*Math.PI,1e-8);near(result.result.gearAngles.get('tracker')!.second,-8*Math.PI,1e-8)}
  else if(kind==='screw')near(result.result.screwAngles.get('tracker')!,4*Math.PI,1e-8)
  else near(result.result.rackPinionAngles.get('tracker')!,4*Math.PI,1e-8)
  expect(JSON.stringify(input)).toBe(before)
})
it.each([{moving:'a-moving',follower:'z-follower',index:0},{moving:'z-moving',follower:'a-follower',index:1}])('preserves exact rotate-primary image with owner at connected-group index $index and a nonidentity local frame',({moving,follower,index})=>{
  const input=tracked('rack-pinion',false),rename=(id:string|null)=>id==='moving'?moving:id==='follower'?follower:id
  input.bodies=input.bodies.map(body=>({...body,id:rename(body.id)!}))
  input.constraints=input.constraints.map(constraint=>({...constraint,first:{...constraint.first,bodyId:rename(constraint.first.bodyId)},
    second:{...constraint.second,bodyId:rename(constraint.second.bodyId)}}))
  const frame:RigidPose={translation:[2,-3,1],rotation:[Math.SQRT1_2,0,0,Math.SQRT1_2]},
    desired=composeRigidPoses({translation:[0,0,20],rotation:[0,0,0,1]},frame),before=JSON.stringify(input),
    result=projectRigidMateTarget(input,{bodyId:moving,frame,targetPose:desired,mode:'rotate'})
  expect(result.status,result.status==='rejected'?result.message:'').toBe('ready');if(result.status!=='ready')return
  expect(result.result.evidence.groups).toHaveLength(1);expect(result.result.evidence.groups[0].bodyIds.indexOf(moving)).toBe(index)
  near(result.result.poses!.get(moving)!.translation[2],20);near(result.result.poses!.get(follower)!.translation[2],20+4*Math.PI)
  expect(result.resolvedPose.rotation.every((value,axis)=>value===desired.rotation[axis])).toBe(true);expect(result.evidence.primaryCost).toBe(0)
  near(result.result.rackPinionAngles.get('tracker')!,4*Math.PI,1e-8)
  const physical=evaluateRigidMates(input,result.result.poses!);expect(physical.diagnostics).toEqual([]);expect(physical.checks.every(check=>check.satisfied)).toBe(true)
  near(physical.limitDistances![0].coordinate,20);expect(physical.limitDistances![0].activity).toBe('interior')
  expect(result.evidence.inequalityProjection?.secondary?.certified).toBe(true);expect(JSON.stringify(input)).toBe(before)
})
it.each(['gear','screw','rack-pinion'] as const)('preserves passive %s winding without adding its incidence to bilateral rank',(kind)=>{
  const input=tracked(kind,true),result=projectRigidMateTarget(input,target(20))
  expect(result.status,result.status==='rejected'?result.message:'').toBe('ready');if(result.status!=='ready')return
  near(result.resolvedPose.translation[2],20);expect(result.result.rank).toBe(2);expect(result.result.evidence.groups).toHaveLength(2)
  if(kind==='gear')near(result.result.gearAngles.get('tracker')!.first,4*Math.PI,1e-8)
  else if(kind==='screw')near(result.result.screwAngles.get('tracker')!,4*Math.PI,1e-8)
  else near(result.result.rackPinionAngles.get('tracker')!,4*Math.PI,1e-8)
})
it.each(['gear','screw','rack-pinion'] as const)('rolls back every accepted map on failed %s plus interval restoration',(kind)=>{
  const input=tracked(kind,false),before=JSON.stringify(input);input.bodies[0].pose.translation[2]=40
  const changed=JSON.stringify(input),result=solveRigidMates(input,{maxIterations:0})
  expect(result.poses).toBeNull();expect(result.gearAngles.size+result.screwAngles.size+result.rackPinionAngles.size).toBe(0);expect(JSON.stringify(input)).toBe(changed);expect(changed).not.toBe(before)
})
