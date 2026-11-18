import type { RigidCircularPathConstraint } from './assemblySolveTypes'
import type { Vec3 } from '../cad/kernel.types'
import { validateRigidPose } from './rigidPose'
function record(v:unknown,keys:string[]):Record<string,unknown>{
 if(!v||typeof v!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).length!==keys.length)throw Error('Circular path requires exact plain data.')
 const out:Record<string,unknown>={};for(const k of Reflect.ownKeys(v)){const d=Object.getOwnPropertyDescriptor(v,k)!;if(typeof k!=='string'||!keys.includes(k)||!d.enumerable||!('value'in d))throw Error('Circular path requires own data.');out[k]=d.value}return out
}
function scalar(v:unknown,positive=false):number{if(typeof v!=='number'||!Number.isFinite(v)||positive&&v<0)throw Error('Invalid circular path scalar.');return v}
function vector(v:unknown):Vec3{if(!Array.isArray(v)||v.length!==3||Reflect.ownKeys(v).length!==4)throw Error('Circular path vector must be dense.');return [0,1,2].map(i=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!('value'in d))throw Error('Circular path vector requires data.');return scalar(d.value)}) as Vec3}
function owner(v:unknown):string|null{if(v!==null&&(typeof v!=='string'||!v.length))throw Error('Invalid circular path owner.');return v as string|null}
export function copyRigidCircularPathConstraint(value:unknown):RigidCircularPathConstraint{
 const hasFollow=!!value&&typeof value==='object'&&Object.hasOwn(value,'follow')
 const hasRoll=!!value&&typeof value==='object'&&Object.hasOwn(value,'roll')
 const c=record(value,['id','type','first','second','position',...(hasFollow?['follow']:[]),...(hasRoll?['roll']:[])]),a=record(c.first,['bodyId','frame','support']),b=record(c.second,['bodyId','frame','arc']),p=record(a.support,['kind','point','tolerance']),l=record(b.arc,['center','radial','tangent','radiusMm','sweepRad','positionErrorMm','radiusErrorMm','frameErrorRad','sweepErrorRad'])
 if(c.type!=='circular-path'||typeof c.id!=='string'||!c.id.length||p.kind!=='point')throw Error('Circular path requires a point and explicit arc.')
 const radial=vector(l.radial),tangent=vector(l.tangent),radiusMm=scalar(l.radiusMm,true),sweepRad=scalar(l.sweepRad,true)
 if(Math.abs(Math.hypot(...radial)-1)>1e-12||Math.abs(Math.hypot(...tangent)-1)>1e-12||Math.abs(radial.reduce((v,x,i)=>v+x*tangent[i],0))>1e-12||radiusMm<=0||sweepRad<=0||sweepRad>=2*Math.PI)throw Error('Circular path requires a unit orthogonal frame, positive radius and open sweep below two pi.')
 const rawPosition=record(c.position,typeof c.position==='object'&&c.position!==null&&Object.getOwnPropertyDescriptor(c.position,'mode')?.value==='free'?['mode','domain']:['mode','distanceMm'])
 let position:RigidCircularPathConstraint['position']
 if(rawPosition.mode==='free'){if(rawPosition.domain!=='trim'&&rawPosition.domain!=='support-circle')throw Error('Circular Free requires an explicit domain.');position={mode:'free',domain:rawPosition.domain}}
 else {if(rawPosition.mode!=='coordinate')throw Error('Invalid circular position.');const distanceMm=scalar(rawPosition.distanceMm,true);if(distanceMm>radiusMm*sweepRad||!Number.isFinite(radiusMm*sweepRad))throw Error('Circular coordinate must fit the declared trim.');position={mode:'coordinate',distanceMm}}
 let follow:RigidCircularPathConstraint['follow']
 if(hasFollow){const f=record(c.follow,['axis','reverse','directionErrorRad']),axis=vector(f.axis);if(typeof f.reverse!=='boolean'||Math.abs(Math.hypot(...axis)-1)>1e-12)throw Error('Follow requires explicit reverse and unit material axis.');follow={axis,reverse:f.reverse,directionErrorRad:scalar(f.directionErrorRad,true)}}
 let roll:RigidCircularPathConstraint['roll']
 if(hasRoll){
  const r=record(c.roll,['axis','reverse','guide','directionErrorRad','guideDirectionErrorRad']),axis=vector(r.axis),e=record(r.guide,['bodyId','frame','support']),g=record(e.support,['kind','point','normal','xDirection','tolerance']),normal=vector(g.normal),xDirection=vector(g.xDirection)
  if(!follow||typeof r.reverse!=='boolean'||Math.abs(Math.hypot(...axis)-1)>1e-12||Math.abs(axis.reduce((sum,v,i)=>sum+v*follow.axis[i],0))>1e-12||g.kind!=='plane'||Math.abs(Math.hypot(...normal)-1)>1e-12||Math.abs(Math.hypot(...xDirection)-1)>1e-12||Math.abs(normal.reduce((sum,v,i)=>sum+v*xDirection[i],0))>1e-12)throw Error('Roll requires Follow, distinct perpendicular axes and an actual plane guide.')
  roll={axis,reverse:r.reverse,guide:{bodyId:owner(e.bodyId),frame:validateRigidPose(e.frame),support:{kind:'plane',point:vector(g.point),normal,xDirection,tolerance:scalar(g.tolerance,true)}},directionErrorRad:scalar(r.directionErrorRad,true),guideDirectionErrorRad:scalar(r.guideDirectionErrorRad,true)}
 }
 return {...(roll?{roll}:{}),...(follow?{follow}:{}),id:c.id,type:'circular-path',first:{bodyId:owner(a.bodyId),frame:validateRigidPose(a.frame),support:{kind:'point',point:vector(p.point),tolerance:scalar(p.tolerance,true)}},second:{bodyId:owner(b.bodyId),frame:validateRigidPose(b.frame),arc:{center:vector(l.center),radial,tangent,radiusMm,sweepRad,positionErrorMm:scalar(l.positionErrorMm,true),radiusErrorMm:scalar(l.radiusErrorMm,true),frameErrorRad:scalar(l.frameErrorRad,true),sweepErrorRad:scalar(l.sweepErrorRad,true)}},position}
}
