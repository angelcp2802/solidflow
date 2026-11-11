import { expect,it } from 'vitest'
import { identityRigidPose } from './rigidPose'
import { evaluateRigidMates } from './assemblyMateEquations'
import { solveRigidMates } from './assemblySolver'
import { projectRigidMateTarget } from './assemblyProjection'
import type { RigidMateProblem,RigidCircularPathConstraint,RigidCircularPathPosition } from './assemblySolveTypes'
function original(position:RigidCircularPathPosition={mode:'free',domain:'trim'},sweepRad=Math.PI/2):RigidMateProblem{
 const c:RigidCircularPathConstraint={id:'arc',type:'circular-path',first:{bodyId:'a',frame:identityRigidPose(),support:{kind:'point',point:[0,0,0],tolerance:0}},second:{bodyId:'b',frame:identityRigidPose(),arc:{center:[1,2,3],radial:[1,0,0],tangent:[0,1,0],radiusMm:5,sweepRad,positionErrorMm:0,radiusErrorMm:0,frameErrorRad:0,sweepErrorRad:0}},position}
 return {bodies:[{id:'a',pose:{translation:[4,6,3],rotation:[0,0,0,1]},fixed:false},{id:'b',pose:identityRigidPose(),fixed:true}],constraints:[c],origin:[0,0,0],lengthScale:10,lengthTolerance:1e-6,angleTolerance:1e-8}
}
for(const position of [{mode:'free',domain:'trim'},{mode:'free',domain:'support-circle'},{mode:'coordinate',distanceMm:5*Math.atan2(4,3)}] as RigidCircularPathPosition[])it('literal 3-4-5 point and physical rank '+position.mode+('domain'in position?position.domain:''),()=>{
 const p=original(position),before=structuredClone(p),e=evaluateRigidMates(p);expect(e.diagnostics).toEqual([]);expect(e.checks[0].satisfied).toBe(true)
 const r=solveRigidMates(p);expect(r.status).toBe('underdefined');expect(r.rank).toBe(position.mode==='free'?2:3);expect(r.localDOF).toBe(position.mode==='free'?4:3);expect(p).toEqual(before)
})
it('distinguishes the complete support circle from its declared minor trim',()=>{
 const p=original({mode:'free',domain:'support-circle'});p.bodies[0].pose.translation=[-4,2,3];expect(evaluateRigidMates(p).checks[0].satisfied).toBe(true)
 ;(p.constraints[0] as RigidCircularPathConstraint).position={mode:'free',domain:'trim'};const e=evaluateRigidMates(p);expect(e.diagnostics).toEqual([]);expect(e.checks[0].satisfied).toBe(false);expect(e.checks[0].lengthResidual).toBeCloseTo(Math.sqrt(50),12)
})
for(const sweep of [Math.PI/2,3*Math.PI/2])it('repairs radial and plane error in a minor/major trim '+sweep,()=>{
 const p=original({mode:'free',domain:'trim'},sweep);p.bodies[0].pose.translation=[4.3,6.4,3.5];const before=structuredClone(p),r=solveRigidMates(p);expect(r.status).toBe('underdefined');expect(r.poses).not.toBeNull();expect(p).toEqual(before);expect(evaluateRigidMates(p,r.poses!).checks[0].satisfied).toBe(true)
})
for(const end of [0,Math.PI/2])it('retains exact endpoint feasibility without inventing a closed seam '+end,()=>{
 const p=original();p.bodies[0].pose.translation=[1+5*Math.cos(end),2+5*Math.sin(end),3];const e=evaluateRigidMates(p);expect(e.diagnostics).toEqual([]);expect(e.checks[0].satisfied).toBe(true);expect(solveRigidMates(p).poses).not.toBeNull()
})
it('preserves repeated-owner and null-owner incidence without fictitious columns',()=>{
 const p=original(),c=p.constraints[0] as RigidCircularPathConstraint;c.first.frame.translation=[4,6,3];c.second.bodyId='a';p.bodies[0].pose=identityRigidPose();let e=evaluateRigidMates(p);expect(e.diagnostics).toEqual([]);expect(e.checks[0].satisfied).toBe(true);e.rows.forEach(v=>expect(Math.hypot(...v.jacobian)).toBeLessThan(1e-12))
 c.first.bodyId=null;c.second.bodyId=null;e=evaluateRigidMates(p);expect(e.checks[0].satisfied).toBe(true);e.rows.forEach(v=>expect(Math.hypot(...v.jacobian)).toBe(0))
})
it('rejects incompatible fixed coordinates without publishing poses or mutating input',()=>{
 const p=original({mode:'coordinate',distanceMm:1}),c=structuredClone(p.constraints[0]) as RigidCircularPathConstraint;c.id='second';c.position={mode:'coordinate',distanceMm:3};p.constraints.push(c);const before=structuredClone(p),r=solveRigidMates(p);expect(r.poses).toBeNull();expect(p).toEqual(before)
})
it('projects a move onto the circle rather than a fixed latent phase',()=>{
 const p=original({mode:'free',domain:'support-circle'}),r=projectRigidMateTarget(p,{bodyId:'a',frame:identityRigidPose(),targetPose:{translation:[-2,-2,3],rotation:[0,0,0,1]},mode:'translate'});expect(r.status).toBe('ready');if(r.status==='ready'){const [x,y,z]=r.resolvedPose.translation;expect(Math.hypot(x-1,y-2)).toBeCloseTo(5,6);expect(z).toBeCloseTo(3,6)}
})
it('charges explicit finite errors without widening a near-boundary length band',()=>{
 const p=original(),c=p.constraints[0] as RigidCircularPathConstraint;c.second.arc.positionErrorMm=4e-7;p.bodies[0].pose.translation=[4,6,3+8e-7];const e=evaluateRigidMates(p);expect(e.checks[0].lengthResidual).toBeLessThan(p.lengthTolerance);expect(e.checks[0].satisfied).toBe(false);expect(e.diagnostics[0].code).toBe('precisionLimit')
})

for(const fixed of [false,true])for(const reverse of [false,true])it('solves signed Follow while phase changes, fixed='+fixed+'/reverse='+reverse,()=>{
 const p=original(fixed?{mode:'coordinate',distanceMm:5*Math.atan2(4,3)}:{mode:'free',domain:'trim'}),c=p.constraints[0] as RigidCircularPathConstraint;c.follow={axis:[1,0,0],reverse,directionErrorRad:0};p.bodies[0].pose.translation=[4.3,6.4,3.2]
 const r=solveRigidMates(p);expect(r.status).toBe('underdefined');expect(r.poses).not.toBeNull();expect(r.rank).toBe(fixed?5:4);expect(r.localDOF).toBe(fixed?1:2);const e=evaluateRigidMates(p,r.poses!);expect(e.diagnostics).toEqual([]);expect(e.checks[0].satisfied).toBe(true)
})
for(const onlyGuide of [false,true])it('solves actual UP with moving phase or only the actual guide '+onlyGuide,()=>{
 const p=original(),c=p.constraints[0] as RigidCircularPathConstraint;c.follow={axis:[1,0,0],reverse:false,directionErrorRad:0};p.bodies.push({id:'g',pose:identityRigidPose(),fixed:!onlyGuide});
 c.roll={axis:[0,1,0],reverse:false,directionErrorRad:0,guideDirectionErrorRad:0,guide:{bodyId:'g',frame:identityRigidPose(),support:{kind:'plane',point:[100,200,300],normal:[0,0,1],xDirection:[1,0,0],tolerance:0}}}
 if(onlyGuide){p.bodies[0].fixed=true;p.bodies[0].pose.rotation=[0,0,3/Math.sqrt(10),1/Math.sqrt(10)];c.roll.guide.support={kind:'plane',point:[100,200,300],normal:[.6,.8,0],xDirection:[0,0,1],tolerance:0}}
 const r=solveRigidMates(p);expect(r.status).toBe('underdefined');expect(r.poses).not.toBeNull();expect(evaluateRigidMates(p,r.poses!).checks[0].satisfied).toBe(true)
 if(!onlyGuide)expect(r.rank).toBe(5)
})

it('keeps a nominal trim-margin violation geometric when its chord distance fits a loose band',()=>{
 const p=original();p.lengthTolerance=1;p.bodies[0].pose.translation=[1+5*Math.cos(-.2001),2+5*Math.sin(-.2001),3]
 const e=evaluateRigidMates(p);expect(e.checks[0].lengthResidual).toBeLessThan(1);expect(e.inequalities![0].margin).toBeLessThan(-.1);expect(e.checks[0].satisfied).toBe(false);expect(e.diagnostics).toEqual([])
})
it('normalizes a near-unit Follow axis while retaining its declared direction error',()=>{
 const p=original(),c=p.constraints[0] as RigidCircularPathConstraint;c.follow={axis:[-.8*(1+8e-13),.6*(1+8e-13),0],reverse:false,directionErrorRad:0}
 const e=evaluateRigidMates(p);expect(e.diagnostics).toEqual([]);expect(e.checks[0].satisfied).toBe(true);expect(Math.hypot(...e.rows.filter(r=>r.kind==='angle').map(r=>r.residual))).toBeLessThan(2e-15)
 c.follow.directionErrorRad=2e-8;expect(evaluateRigidMates(p).diagnostics[0].code).toBe('precisionLimit')
})

for(const [radius,sweep,scale] of [[2,Math.PI/2,1e-6],[2,Math.PI/2,1e6],[2,3*Math.PI/2,1e-6],[2,3*Math.PI/2,1e6],[.2,.1,3]])it('retains a physically exact material endpoint through separated conditioning '+[radius,sweep,scale].join('/'),()=>{
 const p=original({mode:'coordinate',distanceMm:radius*sweep},sweep),c=p.constraints[0] as RigidCircularPathConstraint;c.second.arc.radiusMm=radius;c.second.arc.center=[0,0,0];p.lengthScale=scale
 // Literal endpoint directions for quarter/three-quarter circles; the small
 // original arc uses its declared physical sweep, never a normalized distance.
 p.bodies[0].pose.translation=sweep===Math.PI/2?[0,radius,0]:sweep===3*Math.PI/2?[0,-radius,0]:[radius*Math.cos(sweep),radius*Math.sin(sweep),0]
 const before=structuredClone(p),e=evaluateRigidMates(p);expect(e.diagnostics).toEqual([]);expect(e.checks[0].satisfied).toBe(true);expect(e.checks[0].lengthResidual).toBeLessThan(1e-12)
 const r=solveRigidMates(p);expect(r.status).toBe('underdefined');expect(r.poses).not.toBeNull();expect(evaluateRigidMates(p,r.poses!).checks[0].satisfied).toBe(true);expect(p).toEqual(before)
})

it('keeps a one-ULP interior physical coordinate inside the normalized trim at both scales',()=>{
 const radius=2,sweep=Math.PI/2,length=radius*sweep,b=new ArrayBuffer(8),view=new DataView(b);view.setFloat64(0,length);view.setBigUint64(0,view.getBigUint64(0)-1n);const distanceMm=view.getFloat64(0)
 expect(distanceMm).toBeLessThan(length)
 for(const scale of [1e-6,1e6]){
  const p=original({mode:'coordinate',distanceMm},sweep),c=p.constraints[0] as RigidCircularPathConstraint;c.second.arc.radiusMm=radius;c.second.arc.center=[0,0,0];p.lengthScale=scale;p.bodies[0].pose.translation=[radius*Math.cos(distanceMm/radius),radius*Math.sin(distanceMm/radius),0]
  const e=evaluateRigidMates(p);expect(e.diagnostics).toEqual([]);expect(e.checks[0].satisfied).toBe(true);expect(solveRigidMates(p).poses).not.toBeNull()
 }
})
