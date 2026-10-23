import type { RigidLinePathConstraint } from './assemblySolveTypes'
import type { Vec3 } from '../cad/kernel.types'
import { validateRigidPose } from './rigidPose'
function record(v:unknown,keys:string[]):Record<string,unknown>{
 if(!v||typeof v!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).length!==keys.length)throw Error('Line path requires exact plain data.')
 const out:Record<string,unknown>={};for(const k of Reflect.ownKeys(v)){const d=Object.getOwnPropertyDescriptor(v,k)!;if(typeof k!=='string'||!keys.includes(k)||!d.enumerable||!('value'in d))throw Error('Line path requires own data.');out[k]=d.value}return out
}
function scalar(v:unknown,positive=false):number{if(typeof v!=='number'||!Number.isFinite(v)||positive&&v<0)throw Error('Invalid line path scalar.');return v}
function vector(v:unknown):Vec3{if(!Array.isArray(v)||v.length!==3||Reflect.ownKeys(v).length!==4)throw Error('Line path vector must be dense.');return [0,1,2].map(i=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!('value'in d))throw Error('Line path vector requires data.');return scalar(d.value)}) as Vec3}
function owner(v:unknown):string|null{if(v!==null&&(typeof v!=='string'||!v.length))throw Error('Invalid line path owner.');return v as string|null}
export function copyRigidLinePathConstraint(value:unknown):RigidLinePathConstraint{
 const hasFollow=!!value&&typeof value==='object'&&Object.hasOwn(value,'follow')
 const hasRoll=!!value&&typeof value==='object'&&Object.hasOwn(value,'roll')
 const c=record(value,['id','type','first','second','coordinateMm',...(hasFollow?['follow']:[]),...(hasRoll?['roll']:[])]),a=record(c.first,['bodyId','frame','support']),b=record(c.second,['bodyId','frame','line']),p=record(a.support,['kind','point','tolerance']),l=record(b.line,['start','direction','lengthMm','positionErrorMm','directionErrorRad','lengthErrorMm'])
 if(c.type!=='line-path'||typeof c.id!=='string'||!c.id.length||p.kind!=='point')throw Error('Line path requires point and explicit line.');const direction=vector(l.direction),lengthMm=scalar(l.lengthMm,true)
 if(Math.abs(Math.hypot(...direction)-1)>1e-12||lengthMm<=0)throw Error('Line path requires unit direction and positive length.')
 let follow:RigidLinePathConstraint['follow']
 if(hasFollow){const f=record(c.follow,['axis','reverse','directionErrorRad']),axis=vector(f.axis);if(typeof f.reverse!=='boolean'||Math.abs(Math.hypot(...axis)-1)>1e-12)throw Error('Follow requires explicit reverse and unit material axis.');follow={axis,reverse:f.reverse,directionErrorRad:scalar(f.directionErrorRad,true)}}
 let roll:RigidLinePathConstraint['roll']
 if(hasRoll){
  const r=record(c.roll,['axis','reverse','guide','directionErrorRad','guideDirectionErrorRad']),axis=vector(r.axis),e=record(r.guide,['bodyId','frame','support']),g=record(e.support,['kind','point','normal','xDirection','tolerance']),normal=vector(g.normal),xDirection=vector(g.xDirection)
  if(!follow||typeof r.reverse!=='boolean'||Math.abs(Math.hypot(...axis)-1)>1e-12||Math.abs(axis.reduce((sum,v,i)=>sum+v*follow.axis[i],0))>1e-12||g.kind!=='plane'||Math.abs(Math.hypot(...normal)-1)>1e-12||Math.abs(Math.hypot(...xDirection)-1)>1e-12||Math.abs(normal.reduce((sum,v,i)=>sum+v*xDirection[i],0))>1e-12)throw Error('Roll requires Follow, distinct perpendicular axes and an actual plane guide.')
  roll={axis,reverse:r.reverse,guide:{bodyId:owner(e.bodyId),frame:validateRigidPose(e.frame),support:{kind:'plane',point:vector(g.point),normal,xDirection,tolerance:scalar(g.tolerance,true)}},directionErrorRad:scalar(r.directionErrorRad,true),guideDirectionErrorRad:scalar(r.guideDirectionErrorRad,true)}
 }
 return {...(roll?{roll}:{}),...(follow?{follow}:{}),id:c.id,type:'line-path',first:{bodyId:owner(a.bodyId),frame:validateRigidPose(a.frame),support:{kind:'point',point:vector(p.point),tolerance:scalar(p.tolerance,true)}},second:{bodyId:owner(b.bodyId),frame:validateRigidPose(b.frame),line:{start:vector(l.start),direction,lengthMm,positionErrorMm:scalar(l.positionErrorMm,true),directionErrorRad:scalar(l.directionErrorRad,true),lengthErrorMm:scalar(l.lengthErrorMm,true)}},coordinateMm:c.coordinateMm===null?null:scalar(c.coordinateMm)}
}
