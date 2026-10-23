import { expect,it } from 'vitest'
import { copyRigidCircularPathConstraint } from './assemblyCircularPathNumeric'
import { evaluateRigidMates } from './assemblyMateEquations'
import { rotationExp,retractRigidBodyPose } from './assemblyKinematics'
import { identityRigidPose } from './rigidPose'
import type { RigidMateProblem,RigidCircularPathConstraint } from './assemblySolveTypes'
function original():RigidMateProblem {
 const c:RigidCircularPathConstraint={id:'arc',type:'circular-path',first:{bodyId:'a',frame:identityRigidPose(),support:{kind:'point',point:[.3,-.2,.1],tolerance:0}},second:{bodyId:'b',frame:identityRigidPose(),arc:{center:[1,-2,.5],radial:[.6,.8,0],tangent:[-.8,.6,0],radiusMm:4,sweepRad:4,positionErrorMm:0,radiusErrorMm:0,frameErrorRad:0,sweepErrorRad:0}},position:{mode:'free',domain:'trim'}}
 return {bodies:[{id:'a',pose:{translation:[2,1,2],rotation:rotationExp([.2,-.1,.3])},fixed:false},{id:'b',pose:{translation:[-.4,.2,.3],rotation:rotationExp([-.2,.3,.1])},fixed:false},{id:'g',pose:identityRigidPose(),fixed:false}],constraints:[c],origin:[0,0,0],lengthScale:10,lengthTolerance:1e-6,angleTolerance:1e-8}
}
it('copies exact detached declarations and refuses executable, sparse and extra fields',()=>{
 const p=original(),c=p.constraints[0] as RigidCircularPathConstraint,copy=copyRigidCircularPathConstraint(c);expect(copy).toEqual(c);expect(copy.second.arc.radial).not.toBe(c.second.arc.radial)
 let reads=0;Object.defineProperty(c,'position',{enumerable:true,get(){reads++;return {mode:'free',domain:'trim'}}});expect(()=>copyRigidCircularPathConstraint(c)).toThrow();expect(reads).toBe(0)
 const q=original().constraints[0] as RigidCircularPathConstraint;delete (q.second.arc.radial as unknown[])[1];expect(()=>copyRigidCircularPathConstraint(q)).toThrow()
 const r=original().constraints[0];Object.assign(r,{extra:true});expect(()=>copyRigidCircularPathConstraint(r)).toThrow()
})
it('requires explicit domains, an open trim and a bounded fixed coordinate',()=>{
 const c=original().constraints[0] as RigidCircularPathConstraint
 for(const position of [{mode:'free'},{mode:'free',domain:'unknown'},{mode:'coordinate',distanceMm:-1},{mode:'coordinate',distanceMm:17}])expect(()=>copyRigidCircularPathConstraint({...c,position})).toThrow()
 c.second.arc.sweepRad=2*Math.PI;expect(()=>copyRigidCircularPathConstraint(c)).toThrow()
})
it('requires Follow and a perpendicular source axis for an actual UP plane',()=>{
 const c=original().constraints[0] as RigidCircularPathConstraint
 const roll={axis:[0,1,0] as [number,number,number],reverse:false,directionErrorRad:0,guideDirectionErrorRad:0,guide:{bodyId:'g',frame:identityRigidPose(),support:{kind:'plane' as const,point:[0,0,0] as [number,number,number],normal:[0,0,1] as [number,number,number],xDirection:[1,0,0] as [number,number,number],tolerance:0}}}
 expect(()=>copyRigidCircularPathConstraint({...c,roll})).toThrow();c.follow={axis:[1,0,0],reverse:false,directionErrorRad:0};expect(copyRigidCircularPathConstraint({...c,roll}).roll).toEqual(roll)
 expect(()=>copyRigidCircularPathConstraint({...c,follow:undefined})).toThrow()
})
for(const mode of ['trim','support-circle','coordinate','follow','up'] as const)it('all moving columns at two FD steps and common gauge, '+mode,()=>{
 const p=original(),c=p.constraints[0] as RigidCircularPathConstraint
 if(mode==='support-circle')c.position={mode:'free',domain:'support-circle'}
 if(mode==='coordinate')c.position={mode:'coordinate',distanceMm:3}
 if(mode==='follow'||mode==='up')c.follow={axis:[1,0,0],reverse:false,directionErrorRad:0}
 if(mode==='up')c.roll={axis:[0,1,0],reverse:false,directionErrorRad:0,guideDirectionErrorRad:0,guide:{bodyId:'g',frame:{translation:[8,-9,7],rotation:rotationExp([.1,.2,-.1])},support:{kind:'plane',point:[3,4,5],normal:[0,0,1],xDirection:[1,0,0],tolerance:0}}}
 const e=evaluateRigidMates(p);expect(e.diagnostics).toEqual([])
 const rows=[...e.rows,...(e.inequalities??[]).map(v=>({residual:v.margin,jacobian:v.jacobian}))]
 for(const row of rows)for(let k=0;k<6;k++)expect(Math.abs(row.jacobian[k]+row.jacobian[6+k]+row.jacobian[12+k])).toBeLessThan(2e-12)
 for(const h of [1e-5,2e-6])for(let col=0;col<18;col++){
  const values=[-1,1].map(sign=>{const q=structuredClone(p),step=Array(6).fill(0);step[col%6]=h*sign;q.bodies[Math.floor(col/6)].pose=retractRigidBodyPose(q.bodies[Math.floor(col/6)].pose,step,q.origin,q.lengthScale);const r=evaluateRigidMates(q);expect(r.diagnostics).toEqual([]);return [...r.rows.map(v=>v.residual),...(r.inequalities??[]).map(v=>v.margin)]})
  rows.forEach((row,i)=>expect(Math.abs((values[1][i]-values[0][i])/(2*h)-row.jacobian[col])).toBeLessThan(3e-7))
 }
})

for(const owners of [['a','a','g'],['a','b','a'],['a','b','b'],['a','a','a'],[null,'b',null]] as const)it('aggregates actual repeated/null owners with nested rotating frames '+owners.join('/'),()=>{
 const p=original(),c=p.constraints[0] as RigidCircularPathConstraint;c.first.bodyId=owners[0];c.second.bodyId=owners[1];c.first.frame.rotation=rotationExp([.1,.2,-.1]);c.second.frame.rotation=rotationExp([-.1,.15,.2]);
 c.follow={axis:[1,0,0],reverse:true,directionErrorRad:0};c.roll={axis:[0,1,0],reverse:true,directionErrorRad:0,guideDirectionErrorRad:0,guide:{bodyId:owners[2],frame:{translation:[8,-9,7],rotation:rotationExp([.1,.2,-.1])},support:{kind:'plane',point:[3,4,5],normal:[0,0,1],xDirection:[1,0,0],tolerance:0}}}
 const e=evaluateRigidMates(p);expect(e.diagnostics).toEqual([])
 for(const h of [1e-5,2e-6])for(let col=0;col<18;col++){
 const values=[-1,1].map(sign=>{const q=structuredClone(p),step=Array(6).fill(0);step[col%6]=h*sign;q.bodies[Math.floor(col/6)].pose=retractRigidBodyPose(q.bodies[Math.floor(col/6)].pose,step,q.origin,q.lengthScale);const result=evaluateRigidMates(q);expect(result.diagnostics).toEqual([]);return result.rows})
 e.rows.forEach((row,i)=>expect(Math.abs((values[1][i].residual-values[0][i].residual)/(2*h)-row.jacobian[col])).toBeLessThan(4e-7))
 }
})

function nextPositiveFloat(value:number):number {const b=new ArrayBuffer(8),view=new DataView(b);view.setFloat64(0,value);view.setBigUint64(0,view.getBigUint64(0)+1n);return view.getFloat64(0)}
it('preserves the strict physical coordinate endpoint independently of conditioning',()=>{
 const c=original().constraints[0] as RigidCircularPathConstraint;c.second.arc.radiusMm=2;c.second.arc.sweepRad=Math.PI/2;const length=2*(Math.PI/2)
 for(const distanceMm of [length,nextPositiveFloat(length)-2*(nextPositiveFloat(length)-length)]){c.position={mode:'coordinate',distanceMm};expect(copyRigidCircularPathConstraint(c).position).toEqual(c.position)}
 c.position={mode:'coordinate',distanceMm:nextPositiveFloat(length)};expect(()=>copyRigidCircularPathConstraint(c)).toThrow()
})
