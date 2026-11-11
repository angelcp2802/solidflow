import type { Vec3 } from '../cad/kernel.types'
import type { PlaneBisectorSupport, ConditionedPlaneBisectorSupport, PlaneBisectorConditioning } from './assemblyPlaneBisectors'

export type PlanePlacementSupport = PlaneBisectorSupport
export type ConditionedPlanePlacementSupport = ConditionedPlaneBisectorSupport
export type PlanePlacementConditioning = PlaneBisectorConditioning
export interface PlanePlacementOptions { directionSign: 1 | -1; tabSpanSign: 1 | -1 }
export type PlanePlacementTuple<T> = readonly [T, T, T, T]
export type PlanePlacementColumns = [number, number, number, number, number, number]
export interface PlanePlacementScalars {
  widthSpan: number
  signedTabSpan: number
  tabExtent: number
  availableSpan: number
  orderedStartDistance: number
  orderedEndDistance: number
}
export interface PlanePlacementDerivative {
  parameters: [PlanePlacementColumns, PlanePlacementColumns, PlanePlacementColumns, PlanePlacementColumns]
  widthSpan: PlanePlacementColumns
  signedTabSpan: PlanePlacementColumns
  tabExtent: PlanePlacementColumns
  availableSpan: PlanePlacementColumns
  orderedStartDistance: PlanePlacementColumns
  orderedEndDistance: PlanePlacementColumns
}
export interface PlanePlacementOwnerDerivative extends PlanePlacementDerivative { ownerId: string }
export interface PlanePlacementPrecision extends PlanePlacementScalars {
  parameters: [number, number, number, number]
  normalProjections: [number, number, number, number]
  parallelAngles: [number, number, number, number]
}
export interface OrderedPlanePlacement extends PlanePlacementScalars {
  status: 'ok'
  /** Every length and translational derivative uses the fixed normalized frame. */
  coordinateUnits: 'normalized'
  /** Present only for the world entrypoint. No world point is reconstructed. */
  lengthScaleMm?: number
  ray: { point: Vec3; direction: Vec3 }
  parameters: [number, number, number, number]
  normalProjections: [number, number, number, number]
  unorientedParallelAngles: [number, number, number, number]
  /** Conservative first-order estimates, not a formal interval certificate. */
  precision: PlanePlacementPrecision
  /** Formal independent support variations, including null-owner roles. */
  supports: [PlanePlacementDerivative, PlanePlacementDerivative, PlanePlacementDerivative, PlanePlacementDerivative]
  /** Repeated IDs sum once; null has no physical columns. IDs do not declare freedom. */
  owners: PlanePlacementOwnerDerivative[]
}
export interface PlanePlacementDiagnostic { status: 'nonTransverse' | 'precisionLimit'; message: string }
type Plane = { ownerId: string | null; point: Vec3; normal: Vec3; pointError: number; normalError: number }
const ROUND = 64 * Number.EPSILON, MIN_NORMAL = 2 ** -1022
const AXES: Vec3[] = [[1,0,0],[0,1,0],[0,0,1]]
const scalarNames = ['widthSpan','signedTabSpan','tabExtent','availableSpan','orderedStartDistance','orderedEndDistance'] as const
const dot = (a: Vec3,b: Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const sub = (a: Vec3,b: Vec3): Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]]
const mul = (a: Vec3,s: number): Vec3 => [a[0]*s,a[1]*s,a[2]*s]
const cross = (a: Vec3,b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
function data(value: unknown,required: string[],optional: string[]=[]): Record<string,unknown> {
  if(!value || typeof value!=='object' || Object.getPrototypeOf(value)!==Object.prototype)throw Error('Plane placement needs plain data records.')
  const result: Record<string,unknown> = {}, allowed=new Set([...required,...optional])
  for(const key of Reflect.ownKeys(value)){
    if(typeof key!=='string'||!allowed.has(key))throw Error('Unknown plane placement field.')
    const field=Object.getOwnPropertyDescriptor(value,key)!
    if(!field.enumerable||!('value'in field))throw Error('Plane placement forbids executable fields.')
    result[key]=field.value
  }
  if(required.some(key=>!Object.hasOwn(result,key)))throw Error('Missing plane placement field.')
  return result
}
function tuple(value: unknown,count: number): unknown[] {
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length!==count||Reflect.ownKeys(value).length!==count+1)throw Error('Plane placement needs exact dense tuples.')
  return Array.from({length:count},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!('value'in d))throw Error('Plane placement forbids tuple accessors.');return d.value})
}
function vector(value: unknown): Vec3 {const a=tuple(value,3);if(!a.every(v=>typeof v==='number'&&Number.isFinite(v)))throw Error('Plane placement needs finite coordinates.');return a as Vec3}
function positive(v: unknown): number {if(typeof v!=='number'||!Number.isFinite(v)||v<=0)throw Error('Plane placement tolerances and scale must be finite and positive.');return v}
function error(v: unknown): number {if(v===undefined)return 0;if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw Error('Plane placement errors must be finite and nonnegative.');return v}
function options(value: PlanePlacementOptions): PlanePlacementOptions {const d=data(value,['directionSign','tabSpanSign']);if((d.directionSign!==1&&d.directionSign!==-1)||(d.tabSpanSign!==1&&d.tabSpanSign!==-1))throw Error('Plane placement signs must be explicit +1 or -1.');return {directionSign:d.directionSign,tabSpanSign:d.tabSpanSign}}
function plane(value: unknown): Plane {
  const d=data(value,['ownerId','point','normal'],['pointError','normalErrorRad'])
  if(d.ownerId!==null&&(typeof d.ownerId!=='string'||!d.ownerId.length))throw Error('Plane owner must be an ID or null.')
  const point=vector(d.point),n=vector(d.normal),length=Math.hypot(...n)
  if(!Number.isFinite(length)||Math.abs(length-1)>1e-12)throw Error('Plane normal must be unit length within1e-12.')
  return {ownerId:d.ownerId as string|null,point,normal:mul(n,1/length),pointError:error(d.pointError),normalError:error(d.normalErrorRad)+ROUND}
}
function failure(message: string): PlanePlacementDiagnostic {return {status:'precisionLimit',message}}
function scalars(p: readonly number[],sign: number): PlanePlacementScalars {
  const widthSpan=p[1],signedTabSpan=p[3]-p[2],tabExtent=sign*signedTabSpan
  return {widthSpan,signedTabSpan,tabExtent,availableSpan:widthSpan-tabExtent,orderedStartDistance:p[2],orderedEndDistance:p[1]-p[3]}
}
function zero(): PlanePlacementDerivative {
  const six=(): PlanePlacementColumns => [0,0,0,0,0,0]
  return {parameters:[six(),six(),six(),six()],widthSpan:six(),signedTabSpan:six(),tabExtent:six(),availableSpan:six(),orderedStartDistance:six(),orderedEndDistance:six()}
}
function finiteBlock(block: PlanePlacementDerivative): boolean {return block.parameters.every(row=>row.every(Number.isFinite))&&scalarNames.every(key=>block[key].every(Number.isFinite))}

/** Four ORIGINAL ordered planes intersect a moving ray anchored at width0 and
 * directed by directionSign*normal0. This open transversal chart imposes no
 * parallelism, containment, sorting or Width/native mode. Tangential changes
 * of the anchor change the ray for nonparallel planes. Common rigid motion
 * leaves every scalar invariant, including away from a future target value.
 * Columns [vX,vY,vZ,wX,wY,wZ] follow normalized left retraction, w in radians. */
export function measureConditionedOrderedPlanePlacement(input: PlanePlacementTuple<ConditionedPlanePlacementSupport>, choices: PlanePlacementOptions,
  lengthTolerance: number, angleToleranceRad: number): OrderedPlanePlacement | PlanePlacementDiagnostic {
  const c=options(choices),p=tuple(input,4).map(plane),tol=positive(lengthTolerance),angleTol=positive(angleToleranceRad)
  if(angleTol>=Math.PI)throw Error('Plane placement angle tolerance must be less than pi.')
  if(tol<MIN_NORMAL||p.some(v=>v.point.some(x=>x!==0&&Math.abs(x)<MIN_NORMAL)||v.pointError!==0&&v.pointError<MIN_NORMAL))return failure('Plane placement inputs cannot be represented at ordinary normalized precision.')
  const anchor=p[0].point,e=mul(p[0].normal,c.directionSign),parameters: [number,number,number,number]=[0,0,0,0],projections: [number,number,number,number]=[c.directionSign,0,0,0],angles: [number,number,number,number]=[0,0,0,0]
  const errors: [number,number,number,number]=[0,0,0,0],projectionErrors: [number,number,number,number]=[0,0,0,0],angleErrors: [number,number,number,number]=[0,0,0,0]
  for(let i=1;i<4;i++){
    const a=p[i],delta=sub(a.point,anchor),A=dot(a.normal,delta),B=dot(a.normal,e)
    if(B===0)return {status:'nonTransverse',message:'An ordered plane does not meet the selected ray transversally.'}
    const uB=a.normalError+p[0].normalError+ROUND,uA=a.pointError+p[0].pointError+a.normalError*Math.hypot(...delta)+ROUND*(Math.hypot(...a.point)+Math.hypot(...anchor)+Math.abs(A))
    if(![A,B,uA,uB].every(Number.isFinite)||Math.abs(B)<=uB)return failure('Ray-plane denominator or its input uncertainty is unresolved.')
    const lambda=A/B,u=(uA+Math.abs(lambda)*uB)/(Math.abs(B)-uB)
    parameters[i]=lambda;errors[i]=u;projections[i]=B;projectionErrors[i]=uB;angleErrors[i]=uB
    angles[i]=Math.atan2(Math.hypot(...cross(a.normal,e)),Math.abs(B))
  }
  const values=scalars(parameters,c.tabSpanSign),precision: PlanePlacementPrecision={parameters:errors,normalProjections:projectionErrors,parallelAngles:angleErrors,
    widthSpan:errors[1],signedTabSpan:errors[2]+errors[3],tabExtent:errors[2]+errors[3],availableSpan:errors[1]+errors[2]+errors[3],orderedStartDistance:errors[2],orderedEndDistance:errors[1]+errors[3]}
  if(![...parameters,...projections,...angles,...scalarNames.map(k=>values[k]),...errors,...scalarNames.map(k=>precision[k]),...angleErrors].every(Number.isFinite)
    ||scalarNames.some(k=>precision[k]>tol)||angleErrors.some(v=>v>angleTol))return failure('Plane placement arithmetic or input uncertainty exceeds the explicit measurement bands.')
  const supports=p.map((_,role)=>{
    const block=zero()
    for(let column=0;column<6;column++){
      const axis=AXES[column%3],dx0=role===0?(column<3?axis:cross(axis,anchor)):[0,0,0] as Vec3,de=role===0&&column>=3?cross(axis,e):[0,0,0] as Vec3
      for(let i=1;i<4;i++){
        const a=p[i],dp=role===i?(column<3?axis:cross(axis,a.point)):[0,0,0] as Vec3,dn=role===i&&column>=3?cross(axis,a.normal):[0,0,0] as Vec3
        const dA=dot(dn,sub(a.point,anchor))+dot(a.normal,sub(dp,dx0)),dB=dot(dn,e)+dot(a.normal,de)
        block.parameters[i][column]=(dA-parameters[i]*dB)/projections[i]
      }
      const derived=scalars(block.parameters.map(v=>v[column]),c.tabSpanSign)
      for(const key of scalarNames)block[key][column]=derived[key]
    }
    return block
  }) as OrderedPlanePlacement['supports']
  const aggregated=new Map<string,PlanePlacementOwnerDerivative>()
  p.forEach((a,i)=>{if(a.ownerId===null)return;let block=aggregated.get(a.ownerId);if(!block){block={ownerId:a.ownerId,...zero()};aggregated.set(a.ownerId,block)}for(let j=0;j<6;j++){for(let k=0;k<4;k++)block.parameters[k][j]+=supports[i].parameters[k][j];for(const key of scalarNames)block[key][j]+=supports[i][key][j]}})
  const owners=[...aggregated.values()]
  if(!supports.every(finiteBlock)||!owners.every(finiteBlock))return failure('Plane placement support or accumulated owner derivatives exceed finite arithmetic.')
  return {status:'ok',coordinateUnits:'normalized',ray:{point:[...anchor],direction:e},parameters,normalProjections:projections,unorientedParallelAngles:angles,...values,precision,supports,owners}
}

/** World-coordinate convenience wrapper. Input uncertainty and normalization
 * magnitudes are accounted before cancellation; this cannot restore information
 * already lost by a caller composing a distant world point. */
export function measureOrderedPlanePlacement(input: PlanePlacementTuple<PlanePlacementSupport>, choices: PlanePlacementOptions,
  conditioning: PlanePlacementConditioning): OrderedPlanePlacement | PlanePlacementDiagnostic {
  const raw=data(conditioning,['originMm','lengthScaleMm','lengthToleranceMm','angleToleranceRad']),origin=vector(raw.originMm),scale=positive(raw.lengthScaleMm),tol=positive(raw.lengthToleranceMm),angleTol=positive(raw.angleToleranceRad)
  if(angleTol>=Math.PI)throw Error('Plane placement angle tolerance must be less than pi.')
  options(choices)
  let unresolved=false
  const normalized=(v: number)=>{const n=v/scale;if(!Number.isFinite(n)||v!==0&&Math.abs(n)<MIN_NORMAL)unresolved=true;return n}
  const lengthTolerance=normalized(tol)
  const supports=tuple(input,4).map(value=>{
    const d=data(value,['ownerId','pointMm','normal'],['pointErrorMm','normalErrorRad']),point=vector(d.pointMm),normal=vector(d.normal),errorMm=error(d.pointErrorMm),normalError=error(d.normalErrorRad)
    const local=point.map((x,i)=>normalized(x-origin[i])) as Vec3,inputError=normalized(errorMm)
    const pointError=inputError+ROUND*(Math.hypot(...point)/scale+Math.hypot(...origin)/scale+Math.hypot(...local))
    if(!Number.isFinite(pointError))unresolved=true
    // Validate the complete support even when conditioning precision is unresolved.
    plane({ownerId:d.ownerId,point,normal,pointError:errorMm,normalErrorRad:normalError})
    return {ownerId:d.ownerId,point:local,normal,pointError,normalErrorRad:normalError} as ConditionedPlanePlacementSupport
  }) as unknown as PlanePlacementTuple<ConditionedPlanePlacementSupport>
  if(unresolved||lengthTolerance<=0)return failure('World plane placement conditioning loses finite normal-range data.')
  const result=measureConditionedOrderedPlanePlacement(supports,choices,lengthTolerance,angleTol)
  return result.status==='ok'?{...result,lengthScaleMm:scale}:result
}
