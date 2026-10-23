import { expect, it } from 'vitest'
import type { Vec3 } from '../cad/kernel.types'
import { evaluateRigidMates } from './assemblyMateEquations'
import { solveRigidMates } from './assemblySolver'
import { projectRigidMateTarget } from './assemblyProjection'
import { retractRigidBodyPose, rotationExp } from './assemblyKinematics'
import { composeRigidPoses, identityRigidPose, transformRigidDirection, transformRigidPoint, type RigidPose } from './rigidPose'
import type { RigidMateEndpoint, RigidMateProblem, RigidMateSupport, RigidSymmetryConstraint } from './assemblySolveTypes'

// Original infinite supports; no native geometry, serialized mate or application evidence.
const kinds=['point','line','plane','sphere','cylinder'] as const
type Kind=typeof kinds[number]
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,v,i)=>s+v*b[i],0)
const sub=(a:Vec3,b:Vec3)=>a.map((v,i)=>v-b[i]) as Vec3
const mul=(a:Vec3,s:number)=>a.map(v=>v*s) as Vec3
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const near=(a:readonly number[],b:readonly number[],tol=1e-8)=>{expect(a).toHaveLength(b.length);a.forEach((v,i)=>{expect(Number.isFinite(v)).toBe(true);expect(Math.abs(v-b[i])).toBeLessThanOrEqual(tol)})}
function support(kind:Kind,target=false):RigidMateSupport {
  const base={point:(target?[5,2,3]:[-5,2,3]) as Vec3,tolerance:0},axis=(target?[-.6,.8,0]:[.6,.8,0]) as Vec3
  if(kind==='point')return {...base,kind}
  if(kind==='sphere')return {...base,kind,radius:3}
  if(kind==='plane')return {...base,kind,normal:axis,xDirection:[0,0,1]}
  if(kind==='line')return {...base,kind,axis}
  return {...base,kind,axis,xDirection:[0,0,1],radius:3}
}
function problem(kind:Kind,ids:readonly [string|null,string|null,string|null]=['a','b','m']):RigidMateProblem {
  const endpoint=(bodyId:string|null,s:RigidMateSupport):RigidMateEndpoint=>({bodyId,frame:identityRigidPose(),support:s})
  const mate:RigidSymmetryConstraint={id:'symmetry-original',type:'symmetry',source:endpoint(ids[0],support(kind)),target:endpoint(ids[1],support(kind,true)),mirror:endpoint(ids[2],{kind:'plane',point:[0,0,0],normal:[1,0,0],xDirection:[0,0,1],tolerance:0}),alignment:kind==='point'||kind==='sphere'?null:'aligned'}
  return {bodies:[...new Set(ids.filter((id):id is string=>id!==null))].map(id=>({id,fixed:false,pose:identityRigidPose()})),constraints:[mate],origin:[1,-2,3],lengthScale:10,lengthTolerance:1e-6,angleTolerance:1e-8}
}
const mate=(p:RigidMateProblem)=>p.constraints[0] as RigidSymmetryConstraint
const poses=(p:RigidMateProblem)=>new Map(p.bodies.map(b=>[b.id,b.pose]))
function solved(p:RigidMateProblem){const r=solveRigidMates(p);expect(['underdefined','fullyDefined'],JSON.stringify(r.evidence.diagnostics)).toContain(r.status);expect(r.poses).not.toBeNull();if(!r.poses)throw Error('No poses');return {...r,poses:r.poses}}
function placed(e:RigidMateEndpoint,p:ReadonlyMap<string,RigidPose>){
  const s=e.support!;const frame=e.bodyId===null?e.frame:composeRigidPoses(p.get(e.bodyId)!,e.frame)
  const direction=s.kind==='plane'?s.normal:s.kind==='line'||s.kind==='cylinder'?s.axis:null
  return {kind:s.kind,point:transformRigidPoint(frame,s.point),direction:direction?transformRigidDirection(frame,direction):null}
}
/** Direct Euclidean reflection and target support projection; no residual helper. */
function physical(input:RigidMateProblem,p:ReadonlyMap<string,RigidPose>){
  const c=mate(input),a=placed(c.source,p),b=placed(c.target,p),m=placed(c.mirror,p),n=m.direction!
  const reflected=sub(a.point,mul(n,2*dot(n,sub(a.point,m.point)))),delta=sub(b.point,reflected),d=b.direction
  const residual=!d?delta:a.kind==='plane'?mul(d,dot(d,delta)):sub(delta,mul(d,dot(d,delta)))
  const reflectedDirection=a.direction?sub(a.direction,mul(n,2*dot(n,a.direction))):null
  const desired=reflectedDirection?mul(reflectedDirection,c.alignment==='opposed'?-1:1):null
  return {position:Math.hypot(...residual),angle:d&&desired?Math.atan2(Math.hypot(...cross(d,desired)),dot(d,desired)):null}
}
function verified(input:RigidMateProblem,p:ReadonlyMap<string,RigidPose>){const q=physical(input,p);expect(q.position).toBeLessThanOrEqual(input.lengthTolerance);if(q.angle!==null)expect(q.angle).toBeLessThanOrEqual(input.angleTolerance)}

for(const kind of kinds)it('evaluates and solves original '+kind+' reflection with all three owners retained',()=>{
  const input=problem(kind),constraint=mate(input),before=structuredClone(input)
  expect(constraint).not.toHaveProperty('first');expect(constraint).not.toHaveProperty('second')
  const evaluation=evaluateRigidMates(input);expect(evaluation.diagnostics).toEqual([]);expect(evaluation.checks[0].satisfied).toBe(true)
  expect(evaluation.symmetry).toHaveLength(1);expect(evaluation.symmetry![0]).toMatchObject({constraintId:'symmetry-original',entityKind:kind,alignment:constraint.alignment,lengthTolerance:1e-6,angleTolerance:1e-8})
  near([evaluation.symmetry![0].positionErrorMm],[0]);if(kind==='sphere'||kind==='cylinder')near([evaluation.symmetry![0].radiusDifferenceMm!],[0])
  const result=solved(input),rank=kind==='line'||kind==='cylinder'?4:3
  expect(result.rank).toBe(rank);expect(result.localDOF).toBe(18-rank)
  const group=result.evidence.groups[0];expect(group.bodyIds).toEqual(['a','b','m']);expect(group.unanchored).toBe(true);expect(group.symmetry).toHaveLength(1)
  verified(input,result.poses);expect(input).toEqual(before)
  input.bodies[1].pose.translation=[1,-.4,.7]
  const repaired=solved(input);verified(input,repaired.poses);expect(repaired.rank).toBe(rank)
})

for(const kind of kinds)it('retains and repairs the mirror-only third free owner for '+kind,()=>{
  const input=problem(kind);input.bodies[0].fixed=true;input.bodies[1].fixed=true;input.bodies[2].pose.translation=[1,0,0]
  expect(physical(input,poses(input)).position).toBeGreaterThan(.5)
  const result=solved(input),group=result.evidence.groups.find(g=>g.constraintIds.includes('symmetry-original'))!
  expect(group.bodyIds).toEqual(['m']);expect(group.unanchored).toBe(false);verified(input,result.poses)
  expect(result.poses.get('a')).toEqual(input.bodies[0].pose);expect(result.poses.get('b')).toEqual(input.bodies[1].pose)
})

for(const kind of kinds)it('checks actual retracted Jacobian columns, shared owners and fixed scopes for '+kind,()=>{
  for(const ids of [['a','b','m'],['s','s','m'],['s','b','s'],['a','s','s'],['s','s','s'],[null,'b','m']] as const){
    const input=problem(kind,ids);input.bodies.forEach((b,i)=>{b.pose={translation:[.2*i,-.1*i,.3*i],rotation:rotationExp([.02*i,-.03*(i+1),.04])}})
    mate(input).source.frame={translation:[.4,-.2,.1],rotation:rotationExp([.23,-.31,.17])}
    const base=evaluateRigidMates(input);expect(base.diagnostics).toEqual([])
    for(const h of [2e-6,7e-7])for(let col=0;col<input.bodies.length*6;col++){
      const owner=input.bodies[Math.floor(col/6)],d=Array(6).fill(0);d[col%6]=h
      const plus=evaluateRigidMates(input,new Map([[owner.id,retractRigidBodyPose(owner.pose,d,input.origin,input.lengthScale)]]));d[col%6]=-h
      const minus=evaluateRigidMates(input,new Map([[owner.id,retractRigidBodyPose(owner.pose,d,input.origin,input.lengthScale)]]))
      expect(plus.diagnostics).toEqual([]);expect(minus.diagnostics).toEqual([])
      base.rows.forEach((row,i)=>{const fd=(plus.rows[i].residual-minus.rows[i].residual)/(2*h);expect(Math.abs(row.jacobian[col]-fd)).toBeLessThanOrEqual(7e-7*Math.max(1,Math.abs(fd)))})
    }
    if(ids[0]!==null&&new Set(ids).size===3)for(const row of base.rows)for(let axis=0;axis<6;axis++)near([input.bodies.reduce((s,_,i)=>s+row.jacobian[6*i+axis],0)],[0],2e-10)
  }
})

for(const kind of kinds)it('retains exact shared-owner and fixed-scope zero sets for '+kind,()=>{
  for(const ids of [['s','s','m'],['s','b','s'],['a','s','s'],['s','s','s'],[null,'b',null],[null,null,null]] as const){
    const input=problem(kind,ids),r=solved(input);verified(input,r.poses)
    if(new Set(ids).size===1&&ids[0]!==null){expect(r.rank).toBe(0);expect(r.localDOF).toBe(6)}
  }
  const fixed=problem(kind);fixed.bodies.forEach(b=>{b.fixed=true});expect(solved(fixed).rank).toBe(0)
  fixed.bodies[1].pose.translation=[1,1,1];const r=solveRigidMates(fixed);expect(r.status).toBe('inconsistent');expect(r.poses).toBeNull()
})

for(const kind of kinds)it('projects a real target of the second owner with independent hard-support checks for '+kind,()=>{
  const input=problem(kind),before=structuredClone(input),target={translation:[1,-2,3] as Vec3,rotation:rotationExp([.1,-.05,.07])}
  const r=projectRigidMateTarget(input,{bodyId:'b',frame:identityRigidPose(),targetPose:target,mode:'translate'})
  expect(r.status).toBe('ready');if(r.status!=='ready')throw Error(r.message)
  near(r.resolvedPose.translation,target.translation,input.lengthTolerance)
  for(const direction of [[1,0,0],[0,1,0]] as Vec3[]){const a=transformRigidDirection(r.resolvedPose,direction),b=transformRigidDirection(target,direction);expect(Math.atan2(Math.hypot(...cross(a,b)),dot(a,b))).toBeLessThanOrEqual(input.angleTolerance)}
  verified(input,r.result.poses!);expect(r.evidence.localOnly).toBe(true);expect(r.evidence.inequalityProjection).toBeUndefined();expect(input).toEqual(before)
})

for(const kind of ['line','plane','cylinder'] as const)it('escapes exact antipodal directions through actual free ownership for '+kind,()=>{
  for(const ids of [['a','b','m'],['s','b','s'],['a','s','s'],['s','s','m'],[null,'b',null],['a',null,null]] as const){
    const input=problem(kind,ids),s=mate(input).target.support!
    if(s.kind==='plane')s.normal=mul(s.normal,-1);if(s.kind==='line'||s.kind==='cylinder')s.axis=mul(s.axis,-1)
    verified(input,solved(input).poses)
  }
  const mirrorOnly=problem(kind,['s','s','m']);mirrorOnly.bodies.find(b=>b.id==='s')!.fixed=true
  const target=mate(mirrorOnly).target.support!
  if(target.kind==='plane')target.normal=mul(target.normal,-1);if(target.kind==='line'||target.kind==='cylinder')target.axis=mul(target.axis,-1)
  verified(mirrorOnly,solved(mirrorOnly).poses)
})

it('preserves nested local source points in a distant normalized frame',()=>{
  const input=problem('point',[null,'b',null]);input.origin=[1e16,0,0];input.lengthScale=1
  mate(input).source.frame.translation=[1e16,0,0];mate(input).source.support={kind:'point',point:[-.25,0,0],tolerance:0}
  mate(input).mirror.frame.translation=[1e16,0,0]
  mate(input).target.frame.translation=[.5,0,0];mate(input).target.support={kind:'point',point:[0,0,0],tolerance:0};input.bodies[0].pose.translation=[1e16,0,0]
  const value=evaluateRigidMates(input);expect(value.diagnostics).toEqual([]);near([value.symmetry![0].positionErrorMm],[.25],1e-10)
})

it('rejects malformed declarations, radius mismatch and unresolved precision atomically',()=>{
  const mutations:((p:any)=>void)[]=[p=>{delete p.constraints[0].mirror},p=>{p.constraints[0].mirror.bodyId='absent'},p=>{p.constraints[0].mirror.support={kind:'point',point:[0,0,0],tolerance:0}},p=>{p.constraints[0].target.support={kind:'sphere',point:[0,0,0],radius:3,tolerance:0}},p=>{p.constraints[0].alignment='aligned'}]
  for(const mutate of mutations){const input=problem('point');mutate(input);const before=structuredClone(input),r=solveRigidMates(input);expect(r.poses).toBeNull();expect(input).toEqual(before)}
  const radius=problem('sphere'),s=mate(radius).target.support!;if(s.kind==='sphere')s.radius=4;expect(solveRigidMates(radius).poses).toBeNull()
  const tiny=problem('point');tiny.lengthScale=1e308;tiny.lengthTolerance=Number.MIN_VALUE;expect(solveRigidMates(tiny).poses).toBeNull()
  const canceled=problem('point');canceled.bodies[0].pose.translation=[1e308,0,0];mate(canceled).source.frame.translation=[-1e308,0,0]
  expect(evaluateRigidMates(canceled).diagnostics.some(d=>d.code==='precisionLimit')).toBe(true);expect(solveRigidMates(canceled).poses).toBeNull()
})

it('refines an already accepted tiny angular defect to the physical regular rank at two scales',()=>{
  for(const scale of [1,100])for(const kind of ['plane','line','cylinder'] as const){
    const input=problem(kind);input.lengthScale=scale;input.bodies[1].pose.rotation=rotationExp([0,0,1e-9])
    expect(evaluateRigidMates(input).checks[0].satisfied).toBe(true)
    const r=solved(input);verified(input,r.poses);expect(r.rank).toBe(kind==='plane'?3:4)
    expect(r.evidence.groups[0].rankRange).toEqual(kind==='plane'?[3,3]:[4,4])
  }
})
