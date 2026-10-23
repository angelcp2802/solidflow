import { validateAssemblyDirectedAngleArc } from './assemblyLimitDirectedAngle'
import type  {
  RigidHingeConstraint, RigidMateEndpoint, RigidMateSupport
} from './assemblySolveTypes'
import type  {
  Vec3
} from '../cad/kernel.types'
import  {
  validateRigidPose, transformRigidDirection
} from './rigidPose'
function record(v:unknown,keys:string[]):Record<string,unknown> {
  if(!v||typeof v!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).length!==keys.length)throw Error('Hinge requires exact plain data.');
  const out:Record<string,unknown>= {
  };
  for(const k of Reflect.ownKeys(v)) {
    const d=Object.getOwnPropertyDescriptor(v,k)!;
    if(typeof k!=='string'||!keys.includes(k)||!d.enumerable||!('value'in d))throw Error('Hinge requires own data.');
    out[k]=d.value
  }
  return out
}
function scalar(v:unknown):number {
  if(typeof v!=='number'||!Number.isFinite(v))throw Error('Hinge requires finite scalars.');
  return v
}
function vector(v:unknown):Vec3 {
  if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length!==3||Reflect.ownKeys(v).length!==4)throw Error('Hinge needs dense vectors.');
  return [0,1,2].map(i=> {
    const d=Object.getOwnPropertyDescriptor(v,String(i));
    if(!d?.enumerable||!('value'in d))throw Error('Hinge vectors require data.');
    return scalar(d.value)
  }) as Vec3
}
function unit(v:unknown):Vec3 {
  const a=vector(v);
  if(Math.abs(Math.hypot(...a)-1)>1e-12)throw Error('Hinge direction must be unit.');
  return a
}
export function copyRigidHingeConstraint(value:unknown):RigidHingeConstraint {
  const has=!!value&&typeof value==='object'&&Object.hasOwn(value,'uncertainty');
  const hasStops=!!value&&typeof value==='object'&&Object.hasOwn(value,'stops');
  const c=record(value,['id','type','axis','axial','alignment',...(has?['uncertainty']:[]),...(hasStops?['stops']:[])]);
  if(c.type!=='hinge'||typeof c.id!=='string'||!c.id.length||!['aligned','opposed'].includes(c.alignment as string))throw Error('Invalid hinge identity or alignment.')
  const pair=(v:unknown,plane:boolean):[RigidMateEndpoint,RigidMateEndpoint]=> {
    if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length!==2||Reflect.ownKeys(v).length!==3)throw Error('Hinge requires dense ordered pairs.');
    return [0,1].map(i=> {
      const d=Object.getOwnPropertyDescriptor(v,String(i));
      if(!d?.enumerable||!('value'in d))throw Error('Hinge roles require data.');
      const e=record(d.value,['bodyId','frame','support']);
      if(e.bodyId!==null&&(typeof e.bodyId!=='string'||!e.bodyId.length))throw Error('Invalid hinge owner.');
      const kind=Object.getOwnPropertyDescriptor(e.support as object,'kind');
      if(!kind||!('value'in kind))throw Error('Hinge support needs own kind.');
      const k=kind.value;
      if(plane?k!=='plane':k!=='line'&&k!=='cylinder')throw Error('Hinge needs actual axes and axial planes.');
      const s=record(e.support,['kind','point',...(k==='plane'?['normal','xDirection']:k==='cylinder'?['axis','xDirection','radius']:['axis']),'tolerance']),point=vector(s.point),tolerance=scalar(s.tolerance);
      if(tolerance<0)throw Error('Invalid hinge tolerance.');
      const direction=unit(k==='plane'?s.normal:s.axis);
      let support:RigidMateSupport;
      if(k==='line')support= {
        kind:k,point,axis:direction,tolerance
      };
      else {
        const xDirection=unit(s.xDirection);
        if(Math.abs(xDirection.reduce((a,x,j)=>a+x*direction[j],0))>1e-12)throw Error('Hinge frame must be orthogonal.');
        if(k==='plane')support= {
          kind:k,point,normal:direction,xDirection,tolerance
        };
        else {
          const radius=scalar(s.radius);
          if(radius<=0)throw Error('Invalid hinge cylinder radius.');
          support= {
            kind:'cylinder',point,axis:direction,xDirection,radius,tolerance
          }
        }
      }
      return  {
        bodyId:e.bodyId as string|null,frame:validateRigidPose(e.frame),support
      }
    }) as [RigidMateEndpoint,RigidMateEndpoint]
  }
  const axis=pair(c.axis,false),axial=pair(c.axial,true)
  for(let i=0; i<2; i++) {
    if(axis[i].bodyId!==axial[i].bodyId)throw Error('Each hinge axis and axial plane must share its effective rigid owner.');
    const a=axis[i].support!,p=axial[i].support!,u=transformRigidDirection(axis[i].frame,a.kind==='line'||a.kind==='cylinder'?a.axis:[0,0,0]),n=transformRigidDirection(axial[i].frame,p.kind==='plane'?p.normal:[0,0,0]);
    if(Math.hypot(u[1]*n[2]-u[2]*n[1],u[2]*n[0]-u[0]*n[2],u[0]*n[1]-u[1]*n[0])>1e-12)throw Error('Hinge axial plane must be perpendicular to its own axis.')
  }
  let uncertainty:RigidHingeConstraint['uncertainty'];
  if(has) {
    const v=c.uncertainty;
    if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length!==4||Reflect.ownKeys(v).length!==5)throw Error('Hinge uncertainty requires four dense roles.');
    uncertainty=[0,1,2,3].map(i=> {
      const d=Object.getOwnPropertyDescriptor(v,String(i));
      if(!d?.enumerable||!('value'in d))throw Error('Hinge uncertainty requires data.');
      const u=record(d.value,['positionErrorMm','directionErrorRad']),positionErrorMm=scalar(u.positionErrorMm),directionErrorRad=scalar(u.directionErrorRad);
      if(positionErrorMm<0||directionErrorRad<0)throw Error('Invalid hinge uncertainty.');
      // Explicit positionErrorMm is a TOTAL envelope, including the supplied
      // support tolerance; it may not erase that incidence uncertainty.
      if (positionErrorMm < [...axis, ...axial][i].support!.tolerance) throw Error('Hinge total position error must include its support tolerance.');
      return  {
        positionErrorMm,directionErrorRad
      }
    }) as NonNullable<RigidHingeConstraint['uncertainty']>
  }
  let stops: RigidHingeConstraint['stops'];
  if (hasStops) {
    const hasStopUncertainty = !!c.stops && typeof c.stops === 'object' && Object.hasOwn(c.stops, 'uncertainty');
    const value = record(c.stops, ['coordinate', 'angular', 'arc', ...(hasStopUncertainty ? ['uncertainty'] : [])]);
    if (value.coordinate !== 'directed-about-axis') throw Error('Hinge stops require an explicit directed coordinate.');
    const angular = pair(value.angular, true);
    for (let i = 0; i < 2; i++) if (angular[i].bodyId !== axis[i].bodyId) throw Error('Each hinge angular plane must share its corresponding rigid owner.');
    let stopUncertainty: NonNullable<RigidHingeConstraint['stops']>['uncertainty'];
    if (hasStopUncertainty) {
      const list = value.uncertainty;
      if (!Array.isArray(list) || Object.getPrototypeOf(list) !== Array.prototype || list.length !== 2 || Reflect.ownKeys(list).length !== 3) throw Error('Hinge stop uncertainty requires two dense roles.');
      stopUncertainty = [0, 1].map(i => {
        const descriptor = Object.getOwnPropertyDescriptor(list, String(i));
        if (!descriptor?.enumerable || !('value' in descriptor)) throw Error('Hinge stop uncertainty requires own data.');
        const error = record(descriptor.value, ['positionErrorMm', 'directionErrorRad']);
        const positionErrorMm = scalar(error.positionErrorMm), directionErrorRad = scalar(error.directionErrorRad);
        if (positionErrorMm < angular[i].support!.tolerance || directionErrorRad < 0) throw Error('Hinge stop error must include support tolerance and a nonnegative direction error.');
        return { positionErrorMm, directionErrorRad };
      }) as NonNullable<NonNullable<RigidHingeConstraint['stops']>['uncertainty']>;
    }
    stops = { coordinate: 'directed-about-axis', angular, arc: validateAssemblyDirectedAngleArc(value.arc),
      ...(stopUncertainty ? { uncertainty: stopUncertainty } : {}) };
  }
  return { id: c.id, type: 'hinge', axis, axial, ...(stops ? { stops } : {}),
    ...(uncertainty ? { uncertainty } : {}), alignment: c.alignment as 'aligned' | 'opposed' };
}
