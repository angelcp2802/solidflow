import { copyRigidLinePathConstraint } from './assemblyLinePathNumeric'
import { expect,it } from 'vitest'
import { identityRigidPose } from './rigidPose'
import { evaluateRigidMates } from './assemblyMateEquations'
import { solveRigidMates } from './assemblySolver'
import { retractRigidBodyPose,rotationExp } from './assemblyKinematics'
import { projectRigidMateTarget } from './assemblyProjection'
import type { RigidLinePathConstraint,RigidMateProblem } from './assemblySolveTypes'
function original(coordinateMm:number|null=null):RigidMateProblem {
 const c:RigidLinePathConstraint={id:'path',type:'line-path',first:{bodyId:'a',frame:identityRigidPose(),support:{kind:'point',point:[0,0,0],tolerance:0}},second:{bodyId:'b',frame:identityRigidPose(),line:{start:[1,2,3],direction:[.6,.8,0],lengthMm:5,positionErrorMm:0,directionErrorRad:0,lengthErrorMm:0}},coordinateMm}
 return {bodies:[{id:'a',pose:{translation:[2.2,3.6,3],rotation:[0,0,0,1]},fixed:false},{id:'b',pose:identityRigidPose(),fixed:true}],constraints:[c],origin:[0,0,0],lengthScale:10,lengthTolerance:1e-6,angleTolerance:1e-8}
}
for(const fixed of [false,true])it('literal rational LINE coordinate and rank, fixed='+fixed,()=>{
 const p=original(fixed?2:null),e=evaluateRigidMates(p);expect(e.diagnostics).toEqual([]);expect(e.checks[0].satisfied).toBe(true);expect(e.rows.length).toBe(fixed?3:2)
 const r=solveRigidMates(p);expect(r.status).toBe('underdefined');expect(r.rank).toBe(fixed?3:2);expect(r.localDOF).toBe(fixed?3:4)
 if(!fixed){p.bodies[0].pose.translation=[7,10,3];expect(evaluateRigidMates(p).checks[0].satisfied).toBe(true)}
})
for(const coordinate of [null,2])it('all12 off-solution derivatives and common gauge at two steps '+coordinate,()=>{
 const p=original(coordinate);p.bodies[1].fixed=false;p.bodies[1].pose={translation:[-.2,.4,.7],rotation:rotationExp([.2,-.3,.1])};p.bodies[0].pose.translation=[3,-2,4]
 const e=evaluateRigidMates(p);expect(e.diagnostics).toEqual([])
 for(const row of e.rows)for(let j=0;j<6;j++)expect(Math.abs(row.jacobian[j]+row.jacobian[6+j])).toBeLessThan(1e-12)
 for(const h of [1e-5,2e-6])for(let col=0;col<12;col++){
  const values=[-1,1].map(sign=>{const q=structuredClone(p),step=Array(6).fill(0);step[col%6]=h*sign;q.bodies[Math.floor(col/6)].pose=retractRigidBodyPose(q.bodies[Math.floor(col/6)].pose,step,q.origin,q.lengthScale);return evaluateRigidMates(q).rows})
  e.rows.forEach((row,i)=>expect(Math.abs((values[1][i].residual-values[0][i].residual)/(2*h)-row.jacobian[col])).toBeLessThan(2e-8))
 }
})
it('solves offset without prescribing free axial pose and rejects conflicts atomically',()=>{
 const p=original();p.bodies[0].pose.translation=[4,0,6];const before=structuredClone(p);const r=solveRigidMates(p);expect(r.status).toBe('underdefined');expect(p).toEqual(before);expect(r.poses).not.toBeNull();expect(evaluateRigidMates(p,r.poses!).checks[0].satisfied).toBe(true)
 const c=structuredClone(p.constraints[0]) as RigidLinePathConstraint;c.id='conflict';c.coordinateMm=3;(p.constraints[0] as RigidLinePathConstraint).coordinateMm=2;p.constraints.push(c);const bad=solveRigidMates(p);expect(bad.poses).toBeNull()
})
it('handles repeated and null fixed owners without fabricated variable columns',()=>{
 const p=original(2),c=p.constraints[0] as RigidLinePathConstraint;c.first.bodyId=null;c.first.frame.translation=[2.2,3.6,3];c.second.bodyId=null;expect(evaluateRigidMates(p).checks[0].satisfied).toBe(true)
 c.first.bodyId='a';c.second.bodyId='a';c.first.frame.translation=[2.2,3.6,3];const e=evaluateRigidMates(p);expect(e.checks[0].satisfied).toBe(true);e.rows.forEach(r=>expect(Math.hypot(...r.jacobian)).toBeLessThan(1e-12))
})
it('rejects executable and extra declarations without invoking getters',()=>{
 const p=original();let reads=0;Object.defineProperty(p.constraints[0],'coordinateMm',{enumerable:true,get(){reads++;return 2}});expect(()=>copyRigidLinePathConstraint(p.constraints[0])).toThrow();solveRigidMates(p);expect(reads).toBe(0)
 const q=original();Object.assign(q.constraints[0],{extra:true});expect(()=>copyRigidLinePathConstraint(q.constraints[0])).toThrow()
})
it('charges long axial lever against explicit direction uncertainty',()=>{
 const p=original(),c=p.constraints[0] as RigidLinePathConstraint;p.bodies[0].pose.translation=[600001,800002,3];c.second.line.directionErrorRad=1e-8;expect(evaluateRigidMates(p).diagnostics[0].code).toBe('precisionLimit')
})
it('projects movement along the unbounded line without finite trim clipping',()=>{
 const p=original();const r=projectRigidMateTarget(p,{bodyId:'a',frame:identityRigidPose(),targetPose:{translation:[7,10,3],rotation:[0,0,0,1]},mode:'translate'});expect(r.status).toBe('ready');if(r.status==='ready')expect(Math.hypot(...r.resolvedPose.translation.map((v,i)=>v-[7,10,3][i]))).toBeLessThan(1e-6)
})
it('uses declared noncommuting nested endpoint frames and checks fixed-only geometry',()=>{
 const p=original(2),c=p.constraints[0] as RigidLinePathConstraint
 // Line local X, frame Rx90 then owner Rz90: world line direction Y.
 c.second.line.start=[0,0,0];c.second.line.direction=[1,0,0];c.second.frame={translation:[2,0,0],rotation:[Math.SQRT1_2,0,0,Math.SQRT1_2]}
 p.bodies[1].pose={translation:[10,20,30],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2]};p.bodies[0].pose.translation=[10,24,30];p.bodies[0].fixed=true
 expect(evaluateRigidMates(p).checks[0].satisfied).toBe(true);expect(['fullyDefined','underdefined']).toContain(solveRigidMates(p).status)
 p.bodies[0].pose.translation[0]+=.5;expect(evaluateRigidMates(p).checks[0].lengthResidual).toBeCloseTo(.5,12);expect(solveRigidMates(p).poses).toBeNull()
})
it('rejects normalized underflow rather than losing a declared length',()=>{
 const p=original(),c=p.constraints[0] as RigidLinePathConstraint;c.second.line.lengthMm=Number.MIN_VALUE;p.lengthScale=1e100
 expect(evaluateRigidMates(p).diagnostics[0].code).toBe('precisionLimit')
})
for(const reverse of [false,true])for(const coordinate of [null,2])it('signed follow solves exact antipode and retains physical DOF '+reverse+'/'+coordinate,()=>{
 const p=original(coordinate),c=p.constraints[0] as RigidLinePathConstraint
 c.second.line.direction=[1,0,0];c.second.line.start=[0,0,0];c.follow={axis:[1,0,0],reverse,directionErrorRad:0};p.bodies[0].pose={translation:[coordinate??8,0,0],rotation:reverse?[0,0,0,1]:[0,0,1,0]}
 expect(evaluateRigidMates(p).diagnostics[0].code).toBe('orientationChart')
 const r=solveRigidMates(p);expect(r.status).toBe('underdefined');expect(r.poses).not.toBeNull();expect(r.rank).toBe(coordinate===null?4:5);expect(r.localDOF).toBe(coordinate===null?2:1)
 const e=evaluateRigidMates(p,r.poses!);expect(e.diagnostics).toEqual([]);expect(e.checks[0].angleResidual).toBeLessThanOrEqual(1e-8);expect(e.checks[0].satisfied).toBe(true)
})
for(const reverse of [false,true])it('follow full off-solution moving-frame derivatives and gauge '+reverse,()=>{
 const p=original(),c=p.constraints[0] as RigidLinePathConstraint;c.follow={axis:[0,1,0],reverse,directionErrorRad:0};p.bodies[0].pose.rotation=rotationExp([-.3,.4,.2]);p.bodies[1].fixed=false;p.bodies[1].pose={translation:[.4,-.2,.3],rotation:rotationExp([.2,-.1,.3])}
 const e=evaluateRigidMates(p);expect(e.diagnostics).toEqual([]);expect(e.rows).toHaveLength(5)
 for(const row of e.rows)for(let j=0;j<6;j++)expect(Math.abs(row.jacobian[j]+row.jacobian[6+j])).toBeLessThan(1e-12)
 for(const h of [1e-5,2e-6])for(let col=0;col<12;col++){
 const values=[-1,1].map(sign=>{const q=structuredClone(p),step=Array(6).fill(0);step[col%6]=h*sign;q.bodies[Math.floor(col/6)].pose=retractRigidBodyPose(q.bodies[Math.floor(col/6)].pose,step,q.origin,q.lengthScale);return evaluateRigidMates(q).rows})
 e.rows.forEach((row,i)=>expect(Math.abs((values[1][i].residual-values[0][i].residual)/(2*h)-row.jacobian[col])).toBeLessThan(3e-8))
 }
})
it('follows the component material axis through a nonidentity first frame',()=>{
 const p=original(),c=p.constraints[0] as RigidLinePathConstraint;c.first.frame.rotation=[0,0,Math.SQRT1_2,Math.SQRT1_2];c.follow={axis:[1,0,0],reverse:false,directionErrorRad:0};c.second.line.direction=[0,1,0]
 const e=evaluateRigidMates(p);expect(e.diagnostics).toEqual([]);expect(e.checks[0].angleResidual).toBeLessThan(1e-14)
 c.follow.reverse=true;expect(evaluateRigidMates(p).diagnostics[0].code).toBe('orientationChart')
})
it('preserves same-owner rotational invariance and rejects explicit undefined or executable follow',()=>{
 const p=original(),c=p.constraints[0] as RigidLinePathConstraint;c.first.bodyId='a';c.second.bodyId='a';c.follow={axis:[.6,.8,0],reverse:false,directionErrorRad:0}
 const e=evaluateRigidMates(p);expect(e.diagnostics).toEqual([]);e.rows.filter(r=>r.kind==='angle').forEach(r=>expect(Math.hypot(...r.jacobian)).toBeLessThan(1e-12))
 const q=original();Object.assign(q.constraints[0],{follow:undefined});expect(()=>copyRigidLinePathConstraint(q.constraints[0])).toThrow()
 let reads=0;Object.defineProperty(q.constraints[0],'follow',{enumerable:true,get(){reads++;return undefined}});expect(()=>copyRigidLinePathConstraint(q.constraints[0])).toThrow();expect(reads).toBe(0)
})
it('does not enlarge angular tolerance to absorb follow uncertainty',()=>{
 const p=original(),c=p.constraints[0] as RigidLinePathConstraint;c.follow={axis:[.6,.8,0],reverse:false,directionErrorRad:2e-8}
 expect(evaluateRigidMates(p).diagnostics[0].code).toBe('precisionLimit')
})
it('seeds the movable path owner when the point owner is fixed',()=>{
 const p=original(),c=p.constraints[0] as RigidLinePathConstraint;c.follow={axis:[1,0,0],reverse:false,directionErrorRad:0};c.second.line.direction=[-1,0,0];p.bodies[0].fixed=true;p.bodies[1].fixed=false
 const r=solveRigidMates(p);expect(r.status).toBe('underdefined');expect(r.rank).toBe(4);expect(r.poses).not.toBeNull();expect(evaluateRigidMates(p,r.poses!).checks[0].satisfied).toBe(true)
})
it('does not seed away a rigid same-owner antipodal incompatibility',()=>{
 const p=original(),c=p.constraints[0] as RigidLinePathConstraint;c.second.bodyId='a';c.follow={axis:[-.6,-.8,0],reverse:false,directionErrorRad:0}
 expect(evaluateRigidMates(p).diagnostics[0].code).toBe('orientationChart');expect(solveRigidMates(p).poses).toBeNull()
})
function rollProblem(coordinateMm:number|null=null):RigidMateProblem{
 const p=original(coordinateMm),c=p.constraints[0] as RigidLinePathConstraint
 p.bodies[0].pose={translation:[2,0,0],rotation:[0,0,0,1]};c.second.line.start=[0,0,0];c.second.line.direction=[1,0,0]
 p.bodies.push({id:'g',pose:identityRigidPose(),fixed:true});c.follow={axis:[1,0,0],reverse:false,directionErrorRad:0}
 c.roll={axis:[0,1,0],reverse:false,directionErrorRad:0,guideDirectionErrorRad:0,guide:{bodyId:'g',frame:identityRigidPose(),support:{kind:'plane',point:[0,0,0],normal:[.8,.6,0],xDirection:[0,0,1],tolerance:0}}}
 return p
}
for(const fixed of [false,true])it('projected UP adds one physical constraint with oblique literal guide '+fixed,()=>{
 const p=rollProblem(fixed?2:null),e=evaluateRigidMates(p);expect(e.diagnostics).toEqual([]);expect(e.checks[0].angleResidual).toBeLessThan(1e-14)
 // The source Y is not directly aligned with N: atan2(.8,.6), although projection matches.
 expect(Math.atan2(.8,.6)).toBeGreaterThan(.9)
 const r=solveRigidMates(p);expect(['underdefined','fullyDefined']).toContain(r.status);expect(r.rank).toBe(fixed?6:5);expect(r.localDOF).toBe(fixed?0:1)
})
for(const reverse of [false,true])it('seeds a genuine movable third owner through the signed pi chart '+reverse,()=>{
 const p=rollProblem(2),c=p.constraints[0] as RigidLinePathConstraint;p.bodies[0].fixed=true;p.bodies[2].fixed=false;c.roll!.reverse=reverse
 c.roll!.guide.support={kind:'plane',point:[0,0,0],normal:reverse?[.8,.6,0]:[.8,-.6,0],xDirection:[0,0,1],tolerance:0}
 expect(evaluateRigidMates(p).diagnostics[0].code).toBe('orientationChart');const before=structuredClone(p),r=solveRigidMates(p);expect(r.status).toBe('underdefined');expect(r.rank).toBe(1);expect(r.localDOF).toBe(5);expect(r.poses).not.toBeNull();expect(evaluateRigidMates(p,r.poses!).checks[0].satisfied).toBe(true);expect(p).toEqual(before)
})
for(const ids of [['a','b','g'],['a','a','g'],['a','b','a'],['a','b','b'],['a','a','a'],['a','b',null]] as const)it('full UP owner derivatives at two steps '+JSON.stringify(ids),()=>{
 const p=rollProblem(),c=p.constraints[0] as RigidLinePathConstraint;c.first.bodyId=ids[0];c.second.bodyId=ids[1];c.roll!.guide.bodyId=ids[2]
 p.bodies.forEach((body,i)=>{body.fixed=false;body.pose.rotation=rotationExp([.11*(i+1),-.17*(i+1),.07*(i+1)])});const e=evaluateRigidMates(p);expect(e.diagnostics).toEqual([]);expect(e.rows).toHaveLength(6)
 for(const h of [1e-5,2e-6])for(let col=0;col<18;col++){
 const values=[-1,1].map(sign=>{const q=structuredClone(p),step=Array(6).fill(0);step[col%6]=h*sign;q.bodies[Math.floor(col/6)].pose=retractRigidBodyPose(q.bodies[Math.floor(col/6)].pose,step,q.origin,q.lengthScale);return evaluateRigidMates(q).rows})
 e.rows.forEach((row,i)=>expect(Math.abs((values[1][i].residual-values[0][i].residual)/(2*h)-row.jacobian[col])).toBeLessThan(4e-8))
 }
 if(ids[2]!==null)for(const row of e.rows)for(let j=0;j<6;j++)expect(Math.abs(row.jacobian[j]+row.jacobian[6+j]+row.jacobian[12+j])).toBeLessThan(1e-12)
})
it('rejects roll declarations without Follow, with nonplane guides, duplicate axes and executable fields',()=>{
 for(const mutate of [(c:RigidLinePathConstraint)=>{delete c.follow},(c:RigidLinePathConstraint)=>{c.roll!.axis=[1,0,0]},(c:RigidLinePathConstraint)=>{c.roll!.guide.support={kind:'point',point:[0,0,0],tolerance:0}},(c:RigidLinePathConstraint)=>{Object.assign(c,{roll:undefined})}]){const p=rollProblem();mutate(p.constraints[0] as RigidLinePathConstraint);expect(()=>copyRigidLinePathConstraint(p.constraints[0])).toThrow()}
 const p=rollProblem(),c=p.constraints[0] as RigidLinePathConstraint;let reads=0;Object.defineProperty(c.roll!,'guideDirectionErrorRad',{enumerable:true,get(){reads++;return 0}});expect(()=>copyRigidLinePathConstraint(c)).toThrow();expect(reads).toBe(0)
})
it('refuses zero or uncertain projected guides without choosing an alternate UP frame',()=>{
 const p=rollProblem(),c=p.constraints[0] as RigidLinePathConstraint;c.roll!.guide.support={kind:'plane',point:[0,0,0],normal:[1,0,0],xDirection:[0,1,0],tolerance:0};expect(evaluateRigidMates(p).diagnostics[0].code).toBe('precisionLimit')
 c.roll!.guide.support={kind:'plane',point:[0,0,0],normal:[Math.sqrt(1-1e-12),1e-6,0],xDirection:[0,0,1],tolerance:0};c.roll!.guideDirectionErrorRad=1e-10;expect(evaluateRigidMates(p).diagnostics[0].code).toBe('precisionLimit')
})
it('retains local projection with roll and no hidden guide-variable bypass',()=>{
 const p=rollProblem();const r=projectRigidMateTarget(p,{bodyId:'a',frame:identityRigidPose(),targetPose:{translation:[8,0,0],rotation:[0,0,0,1]},mode:'translate'});expect(r.status).toBe('ready');if(r.status==='ready'){expect(r.result.rank).toBe(5);expect(r.resolvedPose.translation[0]).toBeCloseTo(8,5)}
})
for(const shared of ['point-path','path-guide'] as const)it('seeds shared owner partition without fabricating an independent guide '+shared,()=>{
 const p=rollProblem(2),c=p.constraints[0] as RigidLinePathConstraint
 if(shared==='point-path'){c.second.bodyId='a';p.bodies[0].pose={translation:[0,0,0],rotation:[1,0,0,0]};c.first.frame.translation=[2,0,0]}
 else {c.roll!.guide.bodyId='b';p.bodies[0].fixed=true;p.bodies[1].fixed=false;c.roll!.guide.support={kind:'plane',point:[0,0,0],normal:[.8,-.6,0],xDirection:[0,0,1],tolerance:0}}
 const r=solveRigidMates(p);expect(r.poses).not.toBeNull();expect(evaluateRigidMates(p,r.poses!).checks[0].satisfied).toBe(true)
})
it('requires nominal UP angle plus finite uncertainty to fit the unchanged requested band',()=>{
 const p=rollProblem(2),c=p.constraints[0] as RigidLinePathConstraint;p.bodies[0].fixed=true;c.roll!.directionErrorRad=1.5e-9;c.roll!.guideDirectionErrorRad=1.5e-9;p.bodies[0].pose.rotation=rotationExp([8e-9,0,0])
 const e=evaluateRigidMates(p);expect(e.checks[0].angleResidual).toBeCloseTo(8e-9,15);expect(e.checks[0].angleResidual).toBeLessThan(p.angleTolerance);expect(e.checks[0].satisfied).toBe(false);expect(e.diagnostics[0].code).toBe('precisionLimit');expect(e.rows.at(-1)!.residual).toBeCloseTo(8e-9,15)
 const rejected=solveRigidMates(p);expect(rejected.status).toBe('precisionLimit');expect(rejected.certificates).toEqual([]);expect(rejected.poses).toBeNull()
 p.bodies[0].pose.rotation=rotationExp([2e-9,0,0]);const safe=evaluateRigidMates(p);expect(safe.diagnostics).toEqual([]);expect(safe.checks[0].satisfied).toBe(true);expect(safe.checks[0].angleResidual).toBeCloseTo(2e-9,15)
})
for(const axis of ['Y','Z'] as const)for(const followReverse of [false,true])for(const upReverse of [false,true])it('restores unsatisfied Follow before interpreting initially parallel UPX '+axis+'/'+followReverse+'/'+upReverse,()=>{
 const p=rollProblem(2),c=p.constraints[0] as RigidLinePathConstraint;c.follow!.axis=axis==='Y'?[0,1,0]:[0,0,1];c.follow!.reverse=followReverse;c.roll!.axis=[1,0,0];c.roll!.reverse=upReverse
 // Point initially identity: its selected roll X is exactly parallel to path X,
 // but this is off the separately requested Follow Y/Z manifold.
 expect(evaluateRigidMates(p).diagnostics[0].code).toBe('orientationChart')
 const r=solveRigidMates(p);expect(r.poses).not.toBeNull();expect(r.rank).toBe(6);expect(r.localDOF).toBe(0);expect(evaluateRigidMates(p,r.poses!).checks[0].satisfied).toBe(true)
})
it('does not treat a singular guide or an immovable Follow as an UP fallback',()=>{
 const p=rollProblem(2),c=p.constraints[0] as RigidLinePathConstraint;c.follow!.axis=[0,1,0];c.roll!.axis=[1,0,0];p.bodies[0].fixed=true
 expect(evaluateRigidMates(p).diagnostics[0].code).toBe('precisionLimit');expect(solveRigidMates(p).poses).toBeNull()
 const q=rollProblem(2),d=q.constraints[0] as RigidLinePathConstraint;d.roll!.guide.support={kind:'plane',point:[0,0,0],normal:[1,0,0],xDirection:[0,1,0],tolerance:0}
 expect(evaluateRigidMates(q).diagnostics[0].code).toBe('precisionLimit');expect(solveRigidMates(q).poses).toBeNull()
})
for(const onlyPathFree of [false,true])it('refuses an initially singular guide before source Follow chart restoration, onlyPathFree='+onlyPathFree,()=>{
 const p=rollProblem(2),c=p.constraints[0] as RigidLinePathConstraint;c.follow!.axis=[0,1,0];c.roll!.axis=[1,0,0];c.roll!.guide.support={kind:'plane',point:[0,0,0],normal:[1,0,0],xDirection:[0,0,1],tolerance:0}
 p.bodies[0].fixed=onlyPathFree;p.bodies[1].fixed=!onlyPathFree
 const e=evaluateRigidMates(p);expect(e.diagnostics[0].code).toBe('precisionLimit');expect(e.diagnostics[0].message).toContain('guide projection');expect(solveRigidMates(p).poses).toBeNull()
 if(onlyPathFree){
  // A different path pose could make both projections regular. The current
  // increment deliberately refuses to invent this guide-chart reconstruction.
  const poses=new Map(p.bodies.map(b=>[b.id,b.pose]));poses.set('b',{translation:[2,-2,0],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2]})
  const actual=evaluateRigidMates(p,poses);expect(actual.diagnostics).toEqual([]);expect(actual.checks[0].satisfied).toBe(true)
 }
})
