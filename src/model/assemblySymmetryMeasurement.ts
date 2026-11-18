import type { Vec3 } from '../cad/kernel.types'

type Base = { pointMm: Vec3; positionErrorMm: number }
export type SymmetryMeasuredSupport =
  | (Base & { kind: 'point' })
  | (Base & { kind: 'sphere'; radiusMm: number; radiusErrorMm: number })
  | (Base & { kind: 'plane'; normal: Vec3; directionErrorRad: number })
  | (Base & { kind: 'line'; axis: Vec3; directionErrorRad: number })
  | (Base & { kind: 'cylinder'; axis: Vec3; directionErrorRad: number; radiusMm: number; radiusErrorMm: number })
export type SymmetryMeasurement = { status: 'ok'; positionErrorMm: number; angleRadians: number | null;
  radiusDifferenceMm: number | null; uncertainty: { positionMm: number; angleRad: number | null; radiusMm: number | null }; satisfied: boolean }
  | { status: 'precisionLimit'; message: string }
const dot = (a: Vec3, b: Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const sub = (a: Vec3,b: Vec3): Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]]
const norm = (a: Vec3) => Math.hypot(...a)
const scaled = (a: Vec3,s: number): Vec3 => [a[0]*s,a[1]*s,a[2]*s]
const vector = (a: Vec3) => { if (!Array.isArray(a)||a.length!==3||![0,1,2].every(i=>Number.isFinite(a[i]))) throw Error('Invalid measurement vector.'); }
const positive = (x: number) => { if (!Number.isFinite(x)||x<=0) throw Error('Invalid positive measurement value.'); }
const error = (x: number) => { if (!Number.isFinite(x)||x<0) throw Error('Invalid measurement uncertainty.'); }
function direction(s: SymmetryMeasuredSupport): Vec3 | null { return s.kind==='plane'?s.normal:s.kind==='line'||s.kind==='cylinder'?s.axis:null }
function validate(s: SymmetryMeasuredSupport) {
  if (!s||!['point','line','plane','sphere','cylinder'].includes(s.kind)) throw Error('Invalid measured support.');
  vector(s.pointMm); error(s.positionErrorMm)
  const n=direction(s)
  if(n){vector(n);if(Math.abs(norm(n)-1)>1e-12)throw Error('Measurement direction must be unit.');error((s as {directionErrorRad:number}).directionErrorRad)}
  if(s.kind==='sphere'||s.kind==='cylinder'){positive(s.radiusMm);error(s.radiusErrorMm)}
}
/** Independent physical comparison in a nearby physical-mm frame. Bounds are
 * conservative first-order estimates plus rounding, not interval metrology.
 * Supplied uncertainty never enlarges the requested comparison bands. */
export function measureSymmetrySupports(source: SymmetryMeasuredSupport,target: SymmetryMeasuredSupport,
  mirror: SymmetryMeasuredSupport & {kind:'plane'},alignment: 'aligned'|'opposed'|null,
  lengthToleranceMm: number,angleToleranceRad: number): SymmetryMeasurement {
  validate(source);validate(target);validate(mirror);positive(lengthToleranceMm);positive(angleToleranceRad)
  if(angleToleranceRad>=Math.PI||mirror.kind!=='plane'||source.kind!==target.kind)throw Error('Invalid symmetry measurement purposes.');
  const minimumNormal=2**-1022
  const unrepresentable=(x:number)=>!Number.isFinite(x)||(x!==0&&Math.abs(x)<minimumNormal)
  const lengths=[lengthToleranceMm,angleToleranceRad,...[source,target,mirror].flatMap(s=>[
    ...s.pointMm,s.positionErrorMm,...('directionErrorRad' in s?[s.directionErrorRad]:[]),
    ...('radiusMm' in s?[s.radiusMm,s.radiusErrorMm]:[])])]
  if(lengths.some(unrepresentable))return {status:'precisionLimit',message:'Symmetry measurement input is below normal representable precision.'}
  const unit=(n:Vec3|null)=>n?scaled(n,1/norm(n)):null
  const na=unit(direction(source)),nb=unit(direction(target))
  if(na?alignment!=='aligned'&&alignment!=='opposed':alignment!==null)throw Error('Invalid symmetry alignment.');
  const m=unit(mirror.normal)!,lever=sub(source.pointMm,mirror.pointMm),t=dot(m,lever)
  const reflected=sub(source.pointMm,scaled(m,2*t)),delta=sub(target.pointMm,reflected)
  if([...lever,t,...reflected,...delta].some(unrepresentable))return {status:'precisionLimit',message:'Symmetry reflection arithmetic is not normally representable.'}
  let position=delta
  if(target.kind==='plane')position=scaled(nb!,dot(nb!,delta))
  if(target.kind==='line'||target.kind==='cylinder')position=sub(delta,scaled(nb!,dot(nb!,delta)))
  if(position.some(unrepresentable))return {status:'precisionLimit',message:'Symmetry projection arithmetic is not normally representable.'}
  const magnitude=Math.max(...source.pointMm.map(Math.abs),...target.pointMm.map(Math.abs),...mirror.pointMm.map(Math.abs),norm(lever),norm(delta))
  const round=128*Number.EPSILON*magnitude
  if(magnitude!==0&&(round===0||unrepresentable(round)))return {status:'precisionLimit',message:'Symmetry rounding bound is not normally representable.'}
  // ||d reflection|| <= da + 2 ds + 4 ||a-s|| dm.
  let positionUncertainty=source.positionErrorMm+target.positionErrorMm+2*mirror.positionErrorMm+4*norm(lever)*mirror.directionErrorRad+round
  if(nb)positionUncertainty+=2*norm(delta)*(target as {directionErrorRad:number}).directionErrorRad
  let angle: number|null=null,angleUncertainty: number|null=null
  if(na&&nb){
    const reflectedNormal=sub(na,scaled(m,2*dot(m,na))),signed=scaled(reflectedNormal,alignment==='aligned'?1:-1)
    const cross:Vec3=[signed[1]*nb[2]-signed[2]*nb[1],signed[2]*nb[0]-signed[0]*nb[2],signed[0]*nb[1]-signed[1]*nb[0]]
    angle=Math.atan2(norm(cross),dot(signed,nb))
    angleUncertainty=(source as {directionErrorRad:number}).directionErrorRad+(target as {directionErrorRad:number}).directionErrorRad+2*mirror.directionErrorRad+128*Number.EPSILON
  }
  let radiusDifference:number|null=null,radiusUncertainty:number|null=null
  if((source.kind==='sphere'||source.kind==='cylinder')&&(target.kind==='sphere'||target.kind==='cylinder')){
    radiusDifference=target.radiusMm-source.radiusMm
    radiusUncertainty=source.radiusErrorMm+target.radiusErrorMm+8*Number.EPSILON*Math.max(source.radiusMm,target.radiusMm)
    if(unrepresentable(radiusDifference)||unrepresentable(radiusUncertainty)||radiusUncertainty===0)
      return {status:'precisionLimit',message:'Symmetry radius arithmetic is not normally representable.'}
  }
  const distance=norm(position)
  if(![distance,positionUncertainty,...(angle===null?[]:[angle,angleUncertainty!]),...(radiusDifference===null?[]:[radiusDifference,radiusUncertainty!])].every(Number.isFinite)
    ||positionUncertainty>lengthToleranceMm||(angleUncertainty!==null&&angleUncertainty>angleToleranceRad)||(radiusUncertainty!==null&&radiusUncertainty>lengthToleranceMm))
    return {status:'precisionLimit',message:'Symmetry measurement uncertainty exceeds the requested bands.'}
  return {status:'ok',positionErrorMm:distance,angleRadians:angle,radiusDifferenceMm:radiusDifference,
    uncertainty:{positionMm:positionUncertainty,angleRad:angleUncertainty,radiusMm:radiusUncertainty},
    satisfied:distance<=lengthToleranceMm&&(angle===null||angle<=angleToleranceRad)&&(radiusDifference===null||Math.abs(radiusDifference)<=lengthToleranceMm)}
}
