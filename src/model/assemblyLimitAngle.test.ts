import { expect, it } from 'vitest'
import type { Vec3 } from '../cad/kernel.types'
import { assemblyLimitAngleActivity, assemblyLimitAngleRadians, classifyAssemblyLimitAngleStratum, validateAssemblyLimitAngleLimits } from './assemblyLimitAngle'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type AssemblyGeometryReference, type AssemblyLimitAngleMate } from './assemblyDocument'
import { AssemblyDocumentHistory } from './assemblyEditing'
import { inspectBinaryAssemblyMateReferences as inspectAssemblyMateReferences } from './assemblyBinaryFixtures.test-utils'
import { prepareAssemblyPartUpdate, repairAssemblyEndpoint } from './assemblySourceUpdates'
import { evaluateRigidMates } from './assemblyMateEquations'
import { solveRigidMates } from './assemblySolver'
import { projectRigidMateTarget } from './assemblyProjection'
import { planAssemblyComponentMotion } from './assemblyMotion'
import { composeRigidPoses, identityRigidPose, transformRigidDirection, transformRigidPoint, type RigidPose } from './rigidPose'
import { retractRigidBodyPose, rotationExp } from './assemblyKinematics'
import type { RigidGearConstraint, RigidBinaryMateConstraint as RigidMateConstraint, RigidMateEndpoint, RigidMateProblem, RigidMateSupport, RigidRackPinionConstraint, RigidScrewConstraint } from './assemblySolveTypes'
type BinaryMateProblem = Omit<RigidMateProblem, 'constraints'> & { constraints: RigidMateConstraint[] }
import { angularRestorationNorm, certifiedAngularNullspace, evaluateAngularManifoldCandidate, searchAngularLimitOpening } from './assemblyAngularLimitSearch'
import { admitRigidGearStep, rebaseRigidGearAngles } from './assemblyGear'
import { admitRigidScrewStep, rebaseRigidScrewAngles } from './assemblyScrew'
import { admitRigidRackPinionStep, rebaseRigidRackPinionAngles } from './assemblyRackPinion'

// Original Cartesian supports and document declarations, authored for this
// regression. They assert numerical/model behavior; native authority is external.
const radians=(degrees:number)=>degrees*Math.PI/180
const near=(actual:number,expected:number,tolerance=1e-8)=>{expect(Number.isFinite(actual)).toBe(true);expect(Math.abs(actual-expected)).toBeLessThanOrEqual(tolerance)}
const stamp='2026-10-19T00:00:00.000Z',partRef={id:'angle-part',revision:'r1'}
const plane:Extract<RigidMateSupport,{kind:'plane'}>={kind:'plane',point:[0,0,0],normal:[0,0,1],xDirection:[1,0,0],tolerance:0}
const end=(bodyId:string|null,support:RigidMateSupport=plane,frame=identityRigidPose()):RigidMateEndpoint=>({bodyId,support:structuredClone(support),frame})
const angleLimit=(minimum=30,maximum=120,first=end('moving'),second=end(null)):Extract<RigidMateConstraint,{type:'limit-angle'}>=>({id:'limit',type:'limit-angle',coordinate:'principal-direction',first,second,limits:{minimum,maximum}})
function problem(degrees=60,minimum=30,maximum=120):BinaryMateProblem {
  return{bodies:[{id:'moving',fixed:false,pose:{translation:[2,-3,5],rotation:rotationExp([radians(degrees),0,0])}}],constraints:[angleLimit(minimum,maximum)],
    origin:[0,0,0],lengthScale:10,lengthTolerance:1e-6,angleTolerance:1e-8}
}
const principal=(name:string|null='moving'):AssemblyGeometryReference=>({kind:'principal-plane',component:name===null?null:{occurrencePath:[name],definition:{...partRef}},plane:'XY'})
function declaration():AssemblyDocument {
  return{version:2,kind:'assembly',id:'angle-original',revision:'a1',name:'Original angular interval',units:'mm',createdAt:stamp,updatedAt:stamp,
    definitions:[{kind:'part',...partRef,document:{version:1,id:partRef.id,name:'Original rectangle',units:'mm',createdAt:stamp,updatedAt:stamp,
      features:[{id:'profile',name:'Rectangle',type:'sketch',suppressed:false,plane:'XY',offset:0,profile:{kind:'rectangle',center:[0,0],width:4,height:6}},
        {id:'solid',name:'Prism',type:'extrude',suppressed:false,sketchId:'profile',depth:2,symmetric:false,bodyOperation:{mode:'new',bodyId:'angle-body'}}]}}],
    occurrences:['moving','fixed'].map(id=>({id,name:id,definition:{...partRef},pose:identityRigidPose(),fixed:id==='fixed',visible:true,suppressed:false})),
    mates:[{id:'limit',name:'Principal angular interval',suppressed:false,type:'limit-angle',coordinate:'principal-direction',first:principal(),second:principal('fixed'),limits:{minimum:30,maximum:120}}]}
}

it.each([{minimum:0,maximum:180},{minimum:0,maximum:0},{minimum:180,maximum:180},{minimum:30,maximum:120},{minimum:60,maximum:60}])('preserves principal degree limits %j',limits=>{
  const value=validateAssemblyLimitAngleLimits(limits);expect(value).toEqual(limits);expect(value).not.toBe(limits)
})
it.each([{minimum:-1,maximum:60},{minimum:0,maximum:181},{minimum:60,maximum:30},{minimum:NaN,maximum:60},{minimum:0,maximum:Infinity},
  {minimum:0},{minimum:0,maximum:1,phase:0},[0,180],null])('rejects malformed principal limits %j',limits=>expect(()=>validateAssemblyLimitAngleLimits(limits)).toThrow())
it('rejects executable, inherited and hidden bounds without invoking accessors',()=>{
  let reads=0;const getter={minimum:0,maximum:180};Object.defineProperty(getter,'minimum',{get(){reads++;return 0}})
  expect(()=>validateAssemblyLimitAngleLimits(getter)).toThrow();expect(reads).toBe(0)
  expect(()=>validateAssemblyLimitAngleLimits(Object.create({minimum:0,maximum:180}))).toThrow()
  const hidden={minimum:0,maximum:180};Object.defineProperty(hidden,'maximum',{value:180,enumerable:false});expect(()=>validateAssemblyLimitAngleLimits(hidden)).toThrow()
})
it('rejects a lost radian interval and a nonzero degree bound lost to underflow',()=>{
  expect(()=>assemblyLimitAngleRadians({minimum:0,maximum:Number.MIN_VALUE})).toThrow(RangeError)
  expect(()=>assemblyLimitAngleRadians({minimum:Number.MIN_VALUE,maximum:1})).toThrow(RangeError)
})
it('classifies computed strata exactly and activity in radians independently of domain bounds',()=>{
  expect(classifyAssemblyLimitAngleStratum(0)).toBe('parallel');expect(classifyAssemblyLimitAngleStratum(Math.PI)).toBe('antiparallel')
  expect(classifyAssemblyLimitAngleStratum(1e-12)).toBe('regular');expect(classifyAssemblyLimitAngleStratum(Math.PI-1e-12)).toBe('regular')
  expect(assemblyLimitAngleActivity(radians(30),{minimum:30,maximum:120},1e-8)).toBe('minimum')
  expect(assemblyLimitAngleActivity(radians(120),{minimum:30,maximum:120},1e-8)).toBe('maximum')
  expect(assemblyLimitAngleActivity(radians(60),{minimum:30,maximum:120},1e-8)).toBe('interior')
  expect(assemblyLimitAngleActivity(0,{minimum:0,maximum:0},1e-8)).toBe('both')
  expect(()=>assemblyLimitAngleActivity(0,{minimum:0,maximum:180},0)).toThrow()
})
it('round-trips explicit principal intent without saved alignment, lift or activity',()=>{
  const document=declaration(),parsed=parseAssemblyDocument(serializeAssemblyDocument(document));expect(parsed).toEqual(document)
  expect(Object.keys(parsed.mates[0]).sort()).toEqual(['coordinate','first','id','limits','name','second','suppressed','type'])
  const saved=parsed.mates[0] as AssemblyLimitAngleMate;saved.limits.minimum=45;expect((document.mates[0] as AssemblyLimitAngleMate).limits.minimum).toBe(30)
})
it.each(['alignment','angle','phase','angles','stratum','activeSet'])('rejects saved derived or legacy %s fields',field=>{
  const document=declaration();expect(()=>validateAssemblyDocument({...document,mates:[{...document.mates[0],[field]:0}]})).toThrow()
})
it.each([undefined,'signed','principal','principal-direction-lifted'])('requires the exact coordinate discriminator %s',coordinate=>{
  const document=declaration();expect(()=>validateAssemblyDocument({...document,mates:[{...document.mates[0],coordinate}]})).toThrow()
})
it.each(['cylinder-surface','sphere-surface'])('rejects a %s surface purpose as a direction endpoint',support=>{
  const document=declaration(),first={kind:'face',component:{occurrencePath:['moving'],definition:{...partRef}},body:null,face:{sourceFeatureId:'solid',key:'face-v1|original'},support}
  expect(()=>validateAssemblyDocument({...document,mates:[{...document.mates[0],first}]})).toThrow()
})
it('preserves existing angle syntax and rejects new interval metadata on the legacy family',()=>{
  const document=declaration(),mate=document.mates[0] as AssemblyLimitAngleMate,{coordinate,limits,...base}=mate
  expect(coordinate).toBe('principal-direction');expect(limits.maximum).toBe(120)
  const legacy={...base,type:'angle',angle:60};expect(validateAssemblyDocument({...document,mates:[legacy]}).mates[0]).toEqual(legacy)
  expect(()=>validateAssemblyDocument({...document,mates:[{...legacy,coordinate,limits}]})).toThrow()
})
it('retains detached angular bounds through suppression, Undo, Redo and explicit reference repair',()=>{
  const document=declaration(),history=new AssemblyDocumentHistory(document),{id,...mate}=document.mates[0]
  history.commit({type:'update-mate',mateId:id,mate:{...mate,suppressed:true,name:'Edited',limits:{minimum:0,maximum:180}} as Omit<AssemblyLimitAngleMate,'id'>})
  expect(history.current.mates[0]).toMatchObject({suppressed:true,limits:{minimum:0,maximum:180}})
  expect(history.undo()).toEqual(document);expect(history.redo().mates[0]).toMatchObject({name:'Edited',suppressed:true})
  const definition=document.definitions[0];if(definition.kind!=='part')throw Error('Part missing')
  const plan=prepareAssemblyPartUpdate(document,partRef,definition.document,'r2');expect(plan.endpoints).toHaveLength(2)
  expect(inspectAssemblyMateReferences(plan.document)[0].first.diagnostics.map(value=>value.code)).toContain('STALE_DEFINITION')
  const repaired=repairAssemblyEndpoint(plan.document,{scope:{id:document.id,revision:document.revision},mateId:id,side:'first'},
    {...principal(),component:{occurrencePath:['moving'],definition:{id:partRef.id,revision:'r2'}}})
  expect(inspectAssemblyMateReferences(repaired)[0].first.diagnostics).toEqual([]);expect(repaired.mates[0]).toMatchObject({coordinate:'principal-direction',limits:{minimum:30,maximum:120}})
  document.occurrences[0].suppressed=true;expect(inspectAssemblyMateReferences(document)[0].first.diagnostics.map(value=>value.code)).toContain('SUPPRESSED_COMPONENT')
})

it.each([15,30,60,120,150])('measures radians and both physical margins at %s degrees without bilateral rows',degrees=>{
  const evaluation=evaluateRigidMates(problem(degrees));expect(evaluation.diagnostics).toEqual([]);expect(evaluation.rows).toEqual([])
  const measured=evaluation.limitAngles![0];near(measured.angleRadians,radians(degrees),1e-14)
  near(measured.marginsRadians.minimum,radians(degrees-30),1e-14);near(measured.marginsRadians.maximum,radians(120-degrees),1e-14)
  expect(measured.limitsDegrees).toEqual({minimum:30,maximum:120});expect(evaluation.inequalities).toHaveLength(2)
  expect(evaluation.inequalities!.every(value=>value.kind==='angle'&&value.tolerance===1e-8)).toBe(true)
  near(evaluation.checks[0].angleResidual,radians(Math.max(0,30-degrees,degrees-120)),1e-14);expect(evaluation.checks[0].lengthResidual).toBe(0)
})
it.each(['plane','cylinder','line'] as const)('keeps the same principal angle for all ordered directional pairs starting with %s',firstKind=>{
  const support=(kind:'plane'|'cylinder'|'line'):RigidMateSupport=>kind==='plane'?structuredClone(plane):kind==='line'?{kind,point:[0,0,0],axis:[0,0,1],tolerance:0}:{kind,point:[0,0,0],axis:[0,0,1],xDirection:[1,0,0],radius:3,tolerance:0}
  for(const secondKind of ['plane','cylinder','line'] as const){
    const input=problem();input.constraints=[angleLimit(30,120,end('moving',support(firstKind)),end(null,support(secondKind)))]
    const value=evaluateRigidMates(input);expect(value.diagnostics).toEqual([]);near(value.limitAngles![0].angleRadians,Math.PI/3,1e-14)
  }
})
it('checks all regular derivatives independently by finite differences and all six common rigid gauge modes',()=>{
  const input=problem();input.bodies=[{id:'moving',fixed:false,pose:{translation:[3,-2,5],rotation:rotationExp([.3,-.2,.1])}},
    {id:'other',fixed:false,pose:{translation:[-1,7,-2],rotation:rotationExp([-.2,.4,-.3])}}]
  input.constraints=[angleLimit(10,160,end('moving',plane,{translation:[2,3,-1],rotation:rotationExp([.2,0,.1])}),end('other',plane,{translation:[-4,1,2],rotation:rotationExp([0,-.1,.3])}))]
  const base=evaluateRigidMates(input);expect(base.diagnostics).toEqual([])
  for(const h of [2e-6,7e-7])for(let column=0;column<12;column++){
    const body=input.bodies[Math.floor(column/6)],delta=Array<number>(6).fill(0);delta[column%6]=h
    const plus=evaluateRigidMates(input,new Map([[body.id,retractRigidBodyPose(body.pose,delta,input.origin,input.lengthScale)]]));delta[column%6]=-h
    const minus=evaluateRigidMates(input,new Map([[body.id,retractRigidBodyPose(body.pose,delta,input.origin,input.lengthScale)]]))
    for(let index=0;index<2;index++)near(base.inequalities![index].jacobian[column],(plus.inequalities![index].margin-minus.inequalities![index].margin)/(2*h),3e-7)
  }
  for(const row of base.inequalities!)for(let axis=0;axis<6;axis++)near(row.jacobian[axis]+row.jacobian[axis+6],0,1e-14)
  expect(base.inequalities!.every(row=>[0,1,2,6,7,8].every(index=>row.jacobian[index]===0))).toBe(true)
})
it.each([0,180])('uses genuine endpoint tilt rows at %s and preserves their common gauge even off target',endpoint=>{
  const input=problem(60,endpoint,endpoint);input.bodies.push({id:'other',fixed:false,pose:identityRigidPose()});input.constraints=[angleLimit(endpoint,endpoint,end('moving'),end('other'))]
  const base=evaluateRigidMates(input),rows=base.angularLimitCharts![0].equalityRows!;expect(rows).toHaveLength(3);expect(base.inequalities??[]).toEqual([])
  for(const row of rows)for(let axis=0;axis<6;axis++)near(row.jacobian[axis]+row.jacobian[axis+6],0,1e-14)
  for(let column=3;column<6;column++){
    const h=7e-7,delta=Array<number>(6).fill(0);delta[column]=h
    const plus=evaluateRigidMates(input,new Map([['moving',retractRigidBodyPose(input.bodies[0].pose,delta,input.origin,input.lengthScale)]]));delta[column]=-h
    const minus=evaluateRigidMates(input,new Map([['moving',retractRigidBodyPose(input.bodies[0].pose,delta,input.origin,input.lengthScale)]]))
    rows.forEach((row,index)=>near(row.jacobian[column],(plus.angularLimitCharts![0].equalityRows![index].residual-minus.angularLimitCharts![0].equalityRows![index].residual)/(2*h),3e-7))
  }
})
it('keeps exchanged endpoints equivalent and reverses one direction only with complementary bounds',()=>{
  const input=problem(),mate=input.constraints[0],forward=evaluateRigidMates(input),reverse=evaluateRigidMates({...input,constraints:[{...mate,first:mate.second,second:mate.first}]})
  near(forward.limitAngles![0].angleRadians,reverse.limitAngles![0].angleRadians,1e-14)
  input.constraints=[angleLimit(60,150,end('moving',{...plane,normal:[0,0,-1]}),end(null))]
  const complemented=evaluateRigidMates(input);near(complemented.limitAngles![0].angleRadians,2*Math.PI/3,1e-14);expect(complemented.checks[0].satisfied).toBe(true)
})
it('ignores unused point, radius and translation arithmetic in a new angular-only mixed group',()=>{
  const input=problem(),huge=1e308;input.origin=[huge,-huge,huge];input.bodies[0].pose.translation=[-huge,huge,-huge]
  const unused:RigidMateSupport={kind:'cylinder',point:[huge,-huge,huge],axis:[0,0,1],xDirection:[1,0,0],radius:huge,tolerance:huge}
  input.constraints=[angleLimit(30,120,end('moving',unused,{translation:[huge,huge,huge],rotation:[0,0,0,1]}),end(null,unused)),
    {id:'legacy-angle',type:'angle',angle:60,first:end('moving',unused),second:end(null,unused)}]
  const evaluated=evaluateRigidMates(input);expect(evaluated.diagnostics).toEqual([]);expect(evaluated.checks.every(check=>check.satisfied)).toBe(true)
  near(evaluated.limitAngles![0].angleRadians,Math.PI/3,1e-14)
})
it('retains the legacy-only evaluation shape when the new family is absent',()=>{
  const input=problem();input.constraints=[{id:'legacy',type:'angle',angle:60,first:end('moving'),second:end(null)}]
  const evaluation=evaluateRigidMates(input);expect(evaluation).not.toHaveProperty('limitAngles');expect(evaluation).not.toHaveProperty('angularLimitCharts')
  expect(evaluation.rows).toHaveLength(1);expect(evaluation.rows[0].constraintId).toBe('legacy');near(evaluation.rows[0].residual,0,1e-14)
  expect(evaluation.inequalities).toBeUndefined()
})

it.each([{angle:60,min:30,max:120,lineality:6},{angle:30,min:30,max:120,lineality:5},{angle:120,min:30,max:120,lineality:5},
  {angle:60,min:60,max:60,lineality:5},{angle:0,min:0,max:180,lineality:6},{angle:180,min:0,max:180,lineality:6},
  {angle:0,min:0,max:0,lineality:4},{angle:180,min:180,max:180,lineality:4}])('separates bilateral rank0 from principal critical lineality $lineality at $angle degrees',({angle,min,max,lineality})=>{
  const input=problem(angle,min,max),result=solveRigidMates(input);expect(result.status).toBe('underdefined');expect(result.rank).toBe(0);expect(result.localDOF).toBe(6)
  expect(result.evidence.groups[0].rowCount).toBe(0);expect(result.evidence.groups[0].limitAngles).toHaveLength(1)
  expect(result.evidence.groups[0].limitCone?.linealityDimension).toBe(lineality);expect(result.evidence.groups[0].limitCone).not.toHaveProperty('dimension')
  expect(result.evidence.groups[0].limitCone?.activeBounds).toHaveLength(lineality===6?0:lineality===4?1:min===max?2:1)
})
it.each([0,180])('keeps six common floating gauge modes at the equal %s endpoint',endpoint=>{
  const input=problem(endpoint,endpoint,endpoint);input.bodies.push({id:'other',fixed:false,pose:identityRigidPose()});input.constraints=[angleLimit(endpoint,endpoint,end('moving'),end('other'))]
  const result=solveRigidMates(input);expect(result.poses).not.toBeNull();expect(result.rank).toBe(0);expect(result.localDOF).toBe(12)
  expect(result.evidence.groups[0].limitCone?.linealityDimension).toBe(10)
})
it.each([0,180])('opens a floating pair from the singular %s-degree stratum without adding a gauge anchor',start=>{
  const input=problem(start,start===0?30:120,start===0?60:150);input.bodies.push({id:'other',fixed:false,pose:identityRigidPose()})
  input.constraints=[angleLimit(start===0?30:120,start===0?60:150,end('moving'),end('other'))]
  const result=solveRigidMates(input);expect(result.poses).not.toBeNull();expect(result.rank).toBe(0);expect(result.localDOF).toBe(12)
  expect(result.evidence.groups[0].unanchored).toBe(true);expect(result.evidence.groups[0].seededConstraintIds).toEqual([])
  expect(evaluateRigidMates(input,result.poses!).checks.every(check=>check.satisfied)).toBe(true)
})
it.each([{start:0,min:30,max:60},{start:180,min:120,max:150},{start:180,min:0,max:0},{start:0,min:180,max:180}])('opens the singular $start-degree stratum into [$min,$max] without seeding',({start,min,max})=>{
  const input=problem(start,min,max),before=JSON.stringify(input),result=solveRigidMates(input)
  expect(result.poses,result.evidence.diagnostics.join('\n')).not.toBeNull();expect(result.evidence.groups[0].seededConstraintIds).toEqual([])
  const evaluated=evaluateRigidMates(input,result.poses!);expect(evaluated.diagnostics).toEqual([]);expect(evaluated.checks.every(check=>check.satisfied)).toBe(true)
  expect(result.rank).toBe(0);expect(result.evidence.groups[0].angularLimitSearch?.accepted).toBe(true);expect(JSON.stringify(input)).toBe(before)
})
it.each([15,150])('restores a regular %s degree violation without making a saved equality',degrees=>{
  const input=problem(degrees),result=solveRigidMates(input);expect(result.poses).not.toBeNull();expect(result.rank).toBe(0)
  const evaluation=evaluateRigidMates(input,result.poses!);near(evaluation.limitAngles![0].angleRadians,radians(degrees<30?30:120));expect(evaluation.checks[0].satisfied).toBe(true)
})
it('keeps contradictory free principal intervals honest without a global certificate',()=>{
  const input=problem(60,10,30);input.constraints.push({...angleLimit(120,150),id:'contradiction'})
  const before=JSON.stringify(input),result=solveRigidMates(input);expect(result.poses).toBeNull();expect(result.status).toBe('nonConverged');expect(result.certificates).toEqual([])
  expect(result.gearAngles.size+result.screwAngles.size+result.rackPinionAngles.size).toBe(0);expect(JSON.stringify(input)).toBe(before)
})
it.each([{maxIterations:0},{maxTrials:1}])('honors an exhausted bounded search policy %j atomically',options=>{
  const input=problem(0,30,60),before=JSON.stringify(input),result=solveRigidMates(input,options);expect(result.poses).toBeNull();expect(result.status).toBe('nonConverged')
  expect(result.certificates).toEqual([]);expect(result.gearAngles.size+result.screwAngles.size+result.rackPinionAngles.size).toBe(0);expect(JSON.stringify(input)).toBe(before)
})
it.each([{start:1e-12,target:180,floating:false},{start:Math.PI-1e-12,target:0,floating:false},
  {start:1e-12,target:180,floating:true},{start:Math.PI-1e-12,target:0,floating:true}])('restores a regular near-endpoint angle $start to equal$target, floating=$floating',({start,target,floating})=>{
  const input=problem(0,target,target);input.bodies[0].pose.rotation=rotationExp([start,0,0])
  if(floating){input.bodies.push({id:'other',fixed:false,pose:identityRigidPose()});input.constraints=[angleLimit(target,target,end('moving'),end('other'))]}
  const before=JSON.stringify(input),initial=evaluateRigidMates(input);expect(initial.limitAngles![0].stratum).toBe('regular');expect(initial.checks[0].satisfied).toBe(false)
  const result=solveRigidMates(input);expect(result.poses,result.evidence.diagnostics.join('\n')).not.toBeNull()
  const final=evaluateRigidMates(input,result.poses!);expect(final.checks[0].satisfied).toBe(true);near(final.limitAngles![0].angleRadians,radians(target))
  expect(result.evidence.groups[0].angularLimitSearch?.accepted).toBe(true);expect(result.evidence.groups[0].seededConstraintIds).toEqual([]);expect(JSON.stringify(input)).toBe(before)
})
it('retains a genuine fixed-constraint certificate for an infeasible fixed principal interval',()=>{
  const input=problem(15);input.bodies[0].fixed=true;const result=solveRigidMates(input);expect(result.status).toBe('inconsistent');expect(result.poses).toBeNull()
  expect(result.certificates[0]).toMatchObject({kind:'fixedConstraint',constraintIds:['limit']});expect(result.certificates[0].kind==='fixedConstraint'&&result.certificates[0].checks[0].angleResidual).toBeGreaterThan(0)
})
it.each([{requested:15,resolved:30},{requested:150,resolved:120},{requested:60,resolved:60}])('projects an actual regular rotational target $requested to $resolved degrees',({requested,resolved})=>{
  const input=problem(),before=JSON.stringify(input),result=projectRigidMateTarget(input,{bodyId:'moving',frame:identityRigidPose(),mode:'rotate',targetPose:{translation:[2,-3,5],rotation:rotationExp([radians(requested),0,0])}})
  expect(result.status,result.status==='rejected'?result.message:'').toBe('ready');if(result.status!=='ready')return
  const evaluation=evaluateRigidMates(input,result.result.poses!);expect(evaluation.checks[0].satisfied).toBe(true);near(evaluation.limitAngles![0].angleRadians,radians(resolved))
  expect(result.result.rank).toBe(0);expect(result.evidence.localOnly).toBe(true);expect(JSON.stringify(input)).toBe(before)
})
it.each([0,180])('retains the endpoint %s tilt kernel while allowing axial spin and secondary translation',endpoint=>{
  const input=problem(endpoint,endpoint,endpoint),spin=composeRigidPoses(input.bodies[0].pose,{translation:[0,0,0],rotation:rotationExp([0,0,.4])}),
    result=projectRigidMateTarget(input,{bodyId:'moving',frame:identityRigidPose(),mode:'rotate',targetPose:{translation:[7,2,-1],rotation:spin.rotation}})
  expect(result.status,result.status==='rejected'?result.message:'').toBe('ready');if(result.status!=='ready')return
  const evaluation=evaluateRigidMates(input,result.result.poses!);expect(evaluation.checks[0].satisfied).toBe(true);near(evaluation.limitAngles![0].angleRadians,radians(endpoint))
  result.resolvedPose.translation.forEach((value,index)=>near(value,[7,2,-1][index],1e-6));expect(result.result.evidence.groups[0].limitCone?.linealityDimension).toBe(4)
})
it('preserves exact rotate-primary orientation during secondary translation with zero bilateral rows',()=>{
  const input=problem(),desired:RigidPose={translation:[7,2,-1],rotation:[...input.bodies[0].pose.rotation]},
    result=projectRigidMateTarget(input,{bodyId:'moving',frame:identityRigidPose(),mode:'rotate',targetPose:desired})
  expect(result.status,result.status==='rejected'?result.message:'').toBe('ready');if(result.status!=='ready')return
  expect(result.resolvedPose.rotation.every((value,index)=>value===desired.rotation[index])).toBe(true);expect(result.evidence.primaryCost).toBe(0)
  result.resolvedPose.translation.forEach((value,index)=>near(value,desired.translation[index],1e-6));expect(result.result.rank).toBe(0)
})
it.each([0,60,180])('projects through the full principal domain from %s degrees without manufacturing active stops',degrees=>{
  const input=problem(degrees,0,180),requested=degrees===180?150:degrees+20,
    result=projectRigidMateTarget(input,{bodyId:'moving',frame:identityRigidPose(),mode:'rotate',targetPose:{translation:[7,2,-1],rotation:rotationExp([radians(requested),0,0])}})
  expect(result.status,result.status==='rejected'?result.message:'').toBe('ready');if(result.status!=='ready')return
  const evaluation=evaluateRigidMates(input,result.result.poses!);expect(evaluation.inequalities??[]).toEqual([]);near(evaluation.limitAngles![0].angleRadians,radians(requested))
  expect(result.result.evidence.groups[0].limitCone?.activeBounds).toEqual([]);expect(result.result.evidence.groups[0].limitCone?.linealityDimension).toBe(6)
  result.resolvedPose.translation.forEach((value,index)=>near(value,[7,2,-1][index],1e-6))
})
it('rejects a strict rotational lock outside the angular interval',()=>{
  const input=problem();input.constraints.push({id:'driver',type:'lock',first:end(null,plane,{translation:[2,-3,5],rotation:rotationExp([radians(15),0,0])}),second:end('moving'),relativePose:identityRigidPose()})
  const result=solveRigidMates(input);expect(result.poses).toBeNull();expect(result.status).toBe('nonConverged');expect(result.certificates).toEqual([])
})
it('keeps fresh detached measurement and evidence objects separate from input and later evaluations',()=>{
  const input=problem(),first=evaluateRigidMates(input),second=evaluateRigidMates(input),result=solveRigidMates(input)
  first.limitAngles![0].limitsDegrees.minimum=99;first.limitAngles![0].domainBounds.minimum=true;first.angularLimitCharts![0].stratum='parallel'
  expect(second.limitAngles![0].limitsDegrees.minimum).toBe(30);expect(second.limitAngles![0].domainBounds.minimum).toBe(false)
  expect(result.evidence.groups[0].limitAngles![0].limitsDegrees.minimum).toBe(30);expect((input.constraints[0] as Extract<RigidMateConstraint,{type:'limit-angle'}>).limits.minimum).toBe(30)
})
it('distinguishes opposite signed motion paths with the same quaternion endpoint',()=>{
  const document=declaration();document.occurrences[0].pose={translation:[0,0,0],rotation:rotationExp([radians(-120),0,0])}
  document.mates=[{...document.mates[0] as AssemblyLimitAngleMate,limits:{minimum:90,maximum:180}}]
  const component={occurrencePath:['moving'],definition:{...partRef}},positive=planAssemblyComponentMotion(document,{component,translation:[0,0,0],rotation:{axis:0,angle:radians(240)}}),
    negative=planAssemblyComponentMotion(document,{component,translation:[0,0,0],rotation:{axis:0,angle:radians(-120)}})
  const forward=transformRigidDirection(positive.targetPose,[0,0,1]),backward=transformRigidDirection(negative.targetPose,[0,0,1]);forward.forEach((value,index)=>near(value,backward[index],1e-14))
  const check=(plan:typeof positive)=>Array.from({length:plan.stationCount+1},(_,station)=>{
    const input=problem(0,90,180);input.bodies[0].pose=plan.atStation(station).pose;return evaluateRigidMates(input).checks[0].satisfied
  })
  expect(check(positive).some(value=>!value)).toBe(true);expect(check(negative).every(Boolean)).toBe(true)
  // Principal direction limits do not count axial revolutions as tilt.
  document.occurrences[0].pose=identityRigidPose()
  for(const turns of [-4*Math.PI,4*Math.PI]){const plan=planAssemblyComponentMotion(document,{component,translation:[0,0,0],rotation:{axis:2,angle:turns}})
    for(let station=0;station<=plan.stationCount;station++){const input=problem(0,0,0);input.bodies[0].pose=plan.atStation(station).pose;expect(evaluateRigidMates(input).checks[0].satisfied).toBe(true)}}
})

it('finds a mixed critical-cone opener when every signed raw range mode is blocked',()=>{
  // Let the first selected normal tilt in (x,y). Two other upper90 limits
  // require y>=x/2 and y<=2x. None of +/-X,+/-Y is feasible; (1,1) is.
  const input=problem(0,30,60),line=(axis:Vec3):RigidMateSupport=>({kind:'line',axis,point:[0,0,0],tolerance:0}),
    d1:Vec3=[-1/Math.sqrt(5),2/Math.sqrt(5),0],d2:Vec3=[2/Math.sqrt(5),-1/Math.sqrt(5),0]
  input.constraints.push({...angleLimit(0,90,end('moving'),end(null,line(d1))),id:'cone-one'},
    {...angleLimit(0,90,end('moving'),end(null,line(d2))),id:'cone-two'})
  for(const [x,y] of [[1,0],[-1,0],[0,1],[0,-1]])expect(d1[0]*x+d1[1]*y<0||d2[0]*x+d2[1]*y<0).toBe(true)
  const evaluation=evaluateRigidMates(input),directions:number[][]=[]
  const search=searchAngularLimitOpening(evaluation,6,{maxTrials:16,maxStepNorm:1,angleTolerance:input.angleTolerance},delta=>{
    directions.push(delta);const actual=evaluateRigidMates(input,new Map([['moving',retractRigidBodyPose(input.bodies[0].pose,delta,input.origin,input.lengthScale)]]))
    return{value:actual.checks.every(check=>check.satisfied)?actual:null,trials:0}
  })
  expect(search.value).not.toBeNull();expect(search.evidence.method).toBe('critical-cone');expect(directions.some(delta=>Math.abs(delta[3])>0&&Math.abs(delta[4])>0)).toBe(true)
  const solved=solveRigidMates(input);expect(solved.poses).not.toBeNull();expect(evaluateRigidMates(input,solved.poses!).checks.every(check=>check.satisfied)).toBe(true)
})

function curvedProblem(antiparallel:boolean,offset:boolean):BinaryMateProblem {
  const input=problem(0,antiparallel?120:30,antiparallel?150:60),axisA:Vec3=[1,0,0],axisB:Vec3=[Math.SQRT1_2,0,Math.SQRT1_2],
    pivotA:Vec3=offset?[0,0,-2]:[0,0,0],pivotB:Vec3=offset?[Math.SQRT2,0,-Math.SQRT2]:[0,0,0],
    common:RigidPose=offset?{translation:[8,-5,3],rotation:rotationExp([.2,-.3,.1])}:identityRigidPose(),
    support=(axis:Vec3,point:Vec3):RigidMateSupport=>({kind:'cylinder',axis,point,xDirection:[0,1,0],radius:1,tolerance:0}),
    stop=(axis:Vec3,point:Vec3):RigidMateSupport=>({kind:'plane',normal:axis,point,xDirection:[0,1,0],tolerance:0}),
    first=end('a',support(axisA,pivotA)),second=end('b',support(axisB,pivotB)),gear:RigidGearConstraint={id:'gear',type:'gear',first,second,carrier:end(null,plane,common),
      ratio:{numerator:Math.SQRT2,denominator:1},direction:'same',neutralRotations:{first:[0,0,0,1],second:[0,0,0,1]},angles:{first:0,second:0},phase:0}
  input.bodies=[{id:'a',fixed:false,pose:structuredClone(common)},{id:'b',fixed:false,pose:structuredClone(common)}];input.origin=[...common.translation]
  input.constraints=[
    {id:'a-bearing',type:'concentric',first,second:end(null,support(axisA,pivotA),common),alignment:'aligned',rotationLock:null},
    {id:'a-stop',type:'coincident',first:end('a',stop(axisA,pivotA)),second:end(null,stop(axisA,pivotA),common),alignment:'aligned'},
    {id:'b-bearing',type:'concentric',first:second,second:end(null,support(axisB,pivotB),common),alignment:'aligned',rotationLock:null},
    {id:'b-stop',type:'coincident',first:end('b',stop(axisB,pivotB)),second:end(null,stop(axisB,pivotB),common),alignment:'aligned'},gear,
    angleLimit(antiparallel?120:30,antiparallel?150:60,end('a'),end('b',antiparallel?{...plane,normal:[0,0,-1]}:plane))]
  return input
}
it.each([{antiparallel:false,offset:false},{antiparallel:true,offset:false},{antiparallel:false,offset:true},{antiparallel:true,offset:true}])('restores a curved gear manifold with KN=0, antiparallel=$antiparallel offset=$offset',({antiparallel,offset})=>{
  const input=curvedProblem(antiparallel,offset),before=JSON.stringify(input),start=evaluateRigidMates(input);expect(start.diagnostics).toEqual([])
  const basis=certifiedAngularNullspace(start.rows,12),chart=start.angularLimitCharts![0];expect(basis).toHaveLength(1)
  for(const row of chart.openingRows!)near(row.jacobian.reduce((sum,value,index)=>sum+value*basis[0][index],0),0,1e-12)
  const startMerit=angularRestorationNorm(start),result=solveRigidMates(input);expect(result.poses,result.evidence.diagnostics.join('\n')).not.toBeNull()
  const final=evaluateRigidMates(input,result.poses!);expect(final.diagnostics).toEqual([]);expect(final.checks.every(check=>check.satisfied)).toBe(true)
  expect(angularRestorationNorm(final)).toBeLessThan(startMerit);expect(result.rank).toBe(11);expect(result.localDOF).toBe(1)
  const angles=result.gearAngles.get('gear')!;near(angles.second,Math.SQRT2*angles.first,input.angleTolerance);expect(Math.abs(angles.first)).toBeGreaterThan(.5)
  const dot=Math.sin(angles.first)*Math.sin(Math.SQRT2*angles.first)/Math.SQRT2+Math.cos(angles.first)*(1+Math.cos(Math.SQRT2*angles.first))/2,
    oracle=Math.acos(Math.max(-1,Math.min(1,antiparallel?-dot:dot)))
  near(final.limitAngles![0].angleRadians,oracle,input.angleTolerance);expect(result.evidence.groups[0].seededConstraintIds).toEqual([])
  for(const [id,pivot] of [['a',offset?[0,0,-2]:[0,0,0]],['b',offset?[Math.SQRT2,0,-Math.SQRT2]:[0,0,0]]] as [string,Vec3][]){
    const original=input.bodies.find(body=>body.id===id)!.pose,actual=result.poses!.get(id)!,worldPivot=transformRigidPoint(original,pivot),resolvedPivot=transformRigidPoint(actual,pivot)
    resolvedPivot.forEach((value,index)=>near(value,worldPivot[index],input.lengthTolerance))
    const axis:Vec3=id==='a'?[1,0,0]:[Math.SQRT1_2,0,Math.SQRT1_2],theta=id==='a'?angles.first:angles.second,
      rotation=rotationExp(axis.map(value=>value*theta) as Vec3),rotated=transformRigidDirection({translation:[0,0,0],rotation},pivot),
      expected=composeRigidPoses(original,{translation:pivot.map((value,index)=>value-rotated[index]) as Vec3,rotation})
    actual.translation.forEach((value,index)=>near(value,expected.translation[index],input.lengthTolerance))
  }
  expect(result.evidence.groups[0].angularLimitSearch?.finiteProbes).toBeGreaterThan(0);expect(result.certificates).toEqual([]);expect(JSON.stringify(input)).toBe(before)
})

function tracked(kind:'gear'|'screw'|'rack-pinion',passive:boolean,endpoint:boolean):BinaryMateProblem {
  const input=problem(0,endpoint?0:30,endpoint?0:120),turns=4*Math.PI,identity=identityRigidPose().rotation,
    cylinder:RigidMateSupport={kind:'cylinder',point:[0,0,0],axis:[0,0,1],xDirection:[1,0,0],radius:1,tolerance:0},
    selected:RigidMateSupport=endpoint?plane:{...plane,normal:[0,-Math.sqrt(3)/2,.5]}
  input.bodies[0].pose=identityRigidPose();input.bodies.push({id:'follower',fixed:false,pose:{translation:[0,0,kind==='gear'?0:kind==='screw'?4:turns],rotation:[...identity]}})
  input.constraints=[angleLimit(endpoint?0:30,endpoint?0:120,end('moving',selected),end(null))]
  const first=end('moving',cylinder),second=end('follower',cylinder)
  let mechanical:RigidGearConstraint|RigidScrewConstraint|RigidRackPinionConstraint
  if(kind==='gear')mechanical={id:'tracker',type:kind,first,second,carrier:null,ratio:{numerator:2,denominator:1},direction:'opposed',
    neutralRotations:{first:[...identity],second:[...identity]},angles:{first:turns,second:-2*turns},phase:0}
  else if(kind==='screw')mechanical={id:'tracker',type:kind,first,second,lead:2,reverse:false,alignment:'aligned',neutralRotation:[...identity],angle:turns,neutralTravel:0}
  else mechanical={id:'tracker',type:kind,first,second,conversion:{mode:'travel',override:2*Math.PI},reverse:false,neutralRotation:[...identity],angle:turns,neutralTravel:0}
  if(passive){if(mechanical.type==='gear')input.passiveGears=[mechanical];else if(mechanical.type==='screw')input.passiveScrews=[mechanical];else input.passiveRackPinions=[mechanical]}
  else{input.constraints.push(mechanical);if(kind!=='gear')input.constraints.push({id:'follower-guide',type:'concentric',first:end('follower',cylinder),second:end(null,cylinder),alignment:'aligned',rotationLock:[...identity]})}
  return input
}
it.each((['gear','screw','rack-pinion'] as const).flatMap(kind=>[false,true].flatMap(passive=>[false,true].map(endpoint=>({kind,passive,endpoint})))))('preserves $kind lifted state with angular limits, passive=$passive endpoint=$endpoint',({kind,passive,endpoint})=>{
  const input=tracked(kind,passive,endpoint),before=JSON.stringify(input),result=projectRigidMateTarget(input,{bodyId:'moving',frame:identityRigidPose(),mode:'rotate',targetPose:{translation:[0,0,20],rotation:[0,0,0,1]}})
  expect(result.status,result.status==='rejected'?result.message:'').toBe('ready');if(result.status!=='ready')return
  near(result.resolvedPose.translation[2],20,1e-6);expect(result.evidence.primaryCost).toBe(0)
  const physical=evaluateRigidMates(input,result.result.poses!);expect(physical.diagnostics).toEqual([]);expect(physical.checks.every(check=>check.satisfied)).toBe(true)
  if(kind==='gear'){near(result.result.gearAngles.get('tracker')!.first,4*Math.PI);near(result.result.gearAngles.get('tracker')!.second,-8*Math.PI)}
  else if(kind==='screw')near(result.result.screwAngles.get('tracker')!,4*Math.PI)
  else near(result.result.rackPinionAngles.get('tracker')!,4*Math.PI)
  expect(JSON.stringify(input)).toBe(before)
})
it.each((['gear','screw','rack-pinion'] as const).flatMap(kind=>[false,true].map(passive=>({kind,passive}))))('rolls back all active and passive maps for failed angular restoration $kind passive=$passive',({kind,passive})=>{
  const input=tracked(kind,passive,false);input.bodies[0].pose.rotation=rotationExp([radians(120),0,0])
  const before=JSON.stringify(input),result=solveRigidMates(input,{maxIterations:0});expect(result.poses).toBeNull();expect(result.status).toBe('nonConverged')
  expect(result.gearAngles.size+result.screwAngles.size+result.rackPinionAngles.size).toBe(0);expect(JSON.stringify(input)).toBe(before)
})
it('rejects unresolved and spherical numeric supports instead of inventing an angular coordinate',()=>{
  for(const support of [undefined,{kind:'sphere',point:[0,0,0],radius:1,tolerance:0} as RigidMateSupport]){
    const input=problem();input.constraints=[angleLimit(30,120,{bodyId:'moving',frame:identityRigidPose(),...(support?{support}:{})},end(null))]
    expect(evaluateRigidMates(input).diagnostics[0].code).toBe('invalidGeometry');expect(solveRigidMates(input).poses).toBeNull()
  }
})
it('reports precision loss in a nonzero principal interval rather than accepting it as zero',()=>{
  const input=problem(0,0,Number.MIN_VALUE);expect(evaluateRigidMates(input).diagnostics[0].code).toBe('precisionLimit')
  expect(solveRigidMates(input).status).toBe('precisionLimit')
})
it('retains the existing per-group row capacity envelope for angular endpoint charts and both bounds',()=>{
  const input=problem();input.constraints=Array.from({length:52},(_,index)=>({...angleLimit(),id:'limit-'+index}))
  const before=JSON.stringify(input),result=solveRigidMates(input);expect(result.status).toBe('capacityLimit');expect(result.poses).toBeNull();expect(JSON.stringify(input)).toBe(before)
})
it('charges opening QP pivots and finite probes against the same caller budget',()=>{
  const evaluation=evaluateRigidMates(problem(0,30,60));let callbacks=0
  const result=searchAngularLimitOpening(evaluation,6,{maxTrials:1,maxStepNorm:1,angleTolerance:1e-8},()=>{callbacks++;return{value:true,trials:0}})
  expect(result.value).toBeNull();expect(result.evidence.trials).toBeLessThanOrEqual(1);expect(callbacks).toBe(0)
})
it('rejects dishonest nested trial accounting without publishing a candidate',()=>{
  const evaluation=evaluateRigidMates(problem(0,30,60))
  expect(()=>searchAngularLimitOpening(evaluation,6,{maxTrials:16,maxStepNorm:1,angleTolerance:1e-8},(_,remaining)=>({value:true,trials:remaining+1}))).toThrow('shared trial budget')
})
it('carries accepted inner continuation past a half-turn back to the original angular transaction',()=>{
  const cylinder:RigidMateSupport={kind:'cylinder',point:[0,0,0],axis:[0,0,1],xDirection:[1,0,0],radius:1,tolerance:0},input=problem(0,0,0),
    gear:RigidGearConstraint={id:'gear',type:'gear',first:end('moving',cylinder),second:end('follower',cylinder),carrier:null,ratio:{numerator:2,denominator:1},direction:'opposed',
      neutralRotations:{first:[0,0,0,1],second:[0,0,0,1]},angles:{first:0,second:0},phase:0}
  input.bodies=[{id:'moving',fixed:false,pose:identityRigidPose()},{id:'follower',fixed:false,pose:identityRigidPose()}];input.constraints.push(gear)
  input.passiveScrews=[{id:'screw',type:'screw',first:end('follower',cylinder),second:end(null,cylinder),lead:2,reverse:false,alignment:'aligned',neutralRotation:[0,0,0,1],angle:0,neutralTravel:0}]
  input.passiveRackPinions=[{id:'rack',type:'rack-pinion',first:end('follower',cylinder),second:end(null,cylinder),conversion:{mode:'travel',override:2*Math.PI},reverse:false,neutralRotation:[0,0,0,1],angle:0,neutralTravel:0}]
  let local:RigidMateProblem=structuredClone(input),poses=new Map(input.bodies.map(body=>[body.id,structuredClone(body.pose)])),evaluation=evaluateRigidMates(local,poses)
  const outer=evaluation,steps=new Map([['moving',radians(20)],['follower',radians(40)]]);expect(Math.hypot(...steps.values())).toBeLessThan(1)
  for(let station=0;station<6;station++){
    local=rebaseRigidRackPinionAngles(rebaseRigidScrewAngles(rebaseRigidGearAngles(local,evaluation.gearAngles),evaluation.screwAngles),evaluation.rackPinionAngles)
    expect(admitRigidGearStep(local,poses,steps)).toBe(true);expect(admitRigidScrewStep(local,poses,steps)).toBe(true);expect(admitRigidRackPinionStep(local,poses,steps)).toBe(true)
    poses=new Map([['moving',retractRigidBodyPose(poses.get('moving')!,[0,0,0,0,0,radians(20)],input.origin,input.lengthScale)],
      ['follower',retractRigidBodyPose(poses.get('follower')!,[0,0,0,0,0,radians(-40)],input.origin,input.lengthScale)]])
    evaluation=evaluateRigidMates(local,poses);expect(evaluation.diagnostics).toEqual([]);expect(evaluation.checks.every(check=>check.satisfied)).toBe(true)
  }
  const restored=evaluateAngularManifoldCandidate(input,poses,evaluation.gearAngles,evaluation.screwAngles,evaluation.rackPinionAngles),
    stale=evaluateAngularManifoldCandidate(input,poses,outer.gearAngles,outer.screwAngles,outer.rackPinionAngles)
  expect(restored.diagnostics).toEqual([]);expect(restored.checks.every(check=>check.satisfied)).toBe(true);expect(stale.checks.some(check=>!check.satisfied)).toBe(true)
  near(restored.gearAngles.get('gear')!.first,radians(120));near(restored.gearAngles.get('gear')!.second,radians(-240))
  near(restored.screwAngles.get('screw')!,radians(-240));near(restored.rackPinionAngles.get('rack')!,radians(-240))
  expect(outer.gearAngles.get('gear')).toEqual({first:0,second:0});expect(outer.screwAngles.get('screw')).toBe(0);expect(outer.rackPinionAngles.get('rack')).toBe(0)
})
