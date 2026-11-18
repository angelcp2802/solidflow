import { validateAssemblyLinePathMateRequest, coordinateAssemblyLinePathPosition, assemblyLinePathFollowAxis, assemblyLinePathRollAxis } from '../model/assemblyLinePathMate'
import { assemblyOccurrencePathKey, type AssemblyDocument } from '../model/assemblyDocument'
import { transformRigidDirection, type RigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, assemblyLinePathPlacementArithmetic, assemblyPointPlacementArithmetic, assemblyEndpointPlacementArithmetic } from './kernel.assembly-snapshot'
import { NativeCleanupError } from './kernel.native-ownership'
import type { Vec3 } from './kernel.types'
const ROUND=128*Number.EPSILON,MIN=2**-1022
/** Independent fresh native physical check. Detached output grants no Apply authority. */
export function evaluateAssemblyLinePathReferences(snapshot:AssemblyGeometrySnapshot,document:AssemblyDocument,input:unknown,
 options:{lengthToleranceMm?:number;angleToleranceRad?:number}={},scopePath:readonly string[]=[]){
 const request=validateAssemblyLinePathMateRequest(input),scope=JSON.parse(assemblyOccurrencePathKey(scopePath)) as string[]
 const bands={lengthToleranceMm:1e-6,angleToleranceRad:1e-8}
 if(!options||typeof options!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(options)))throw Error('LINE path bands require plain data.')
 for(const k of Reflect.ownKeys(options)){const d=Object.getOwnPropertyDescriptor(options,k)!;if(typeof k!=='string'||!Object.hasOwn(bands,k)||!d.enumerable||!('value'in d)||typeof d.value!=='number'||!Number.isFinite(d.value)||d.value<=0)throw Error('Invalid LINE path band.');bands[k as keyof typeof bands]=d.value}
 if(bands.angleToleranceRad>=Math.PI)throw Error('Invalid LINE path angular band.')
 try{
  const point=snapshot.resolveVertexReference(document,request.point,scope),path=snapshot.resolveLinePathSelection(document,request.path,scope,bands)
  const up=typeof request.orientation.roll==='object'?snapshot.resolveDirectionReference(document,request.orientation.roll.guide,scope):null
  if(up&&(up.kind!=='support'||up.origin!=='native-face'||up.localSupport.kind!=='plane'))throw Error('UP needs an actual native plane face.')
  const pa=assemblyPointPlacementArithmetic(point,document),pb=assemblyLinePathPlacementArithmetic(path,document),line=path.localCurve
  const origin=point.declaredWorldPose.translation
  const poseCopy=(pose:typeof point.declaredWorldPose):RigidPose=>({translation:[...pose.translation],rotation:[...pose.rotation]})
  const compose=(pose:typeof point.declaredWorldPose,p:readonly number[]):Vec3=>{const r=transformRigidDirection(poseCopy(pose),[...p] as Vec3);return r.map((v,i)=>v+(pose.translation[i]-origin[i])) as Vec3}
  const x=compose(point.declaredWorldPose,point.localSupport.point),c=compose(path.declaredWorldPose,line.startPoint)
  const t=transformRigidDirection(poseCopy(path.declaredWorldPose),line.increasingDirection.map(v=>v*line.sense) as Vec3),delta=x.map((v,i)=>v-c[i]) as Vec3
  const coordinateMm=delta.reduce((sum,v,i)=>sum+v*t[i],0),targetCoordinateMm=coordinateAssemblyLinePathPosition(request.position,line.lengthMm)
  const transverseResidualMm=Math.hypot(...delta.map((v,i)=>v-coordinateMm*t[i])),coordinateResidualMm=targetCoordinateMm===null?null:coordinateMm-targetCoordinateMm
  const positionResidualMm=targetCoordinateMm===null?transverseResidualMm:Math.hypot(...delta.map((v,i)=>v-targetCoordinateMm*t[i]))
  const axis=assemblyLinePathFollowAxis(request.orientation)
  const pointAxis=axis===null?null:transformRigidDirection(poseCopy(point.declaredWorldPose),axis)
  const reverse=typeof request.orientation.pitchYaw==='object'&&request.orientation.pitchYaw.reverse
  const target=t.map(v=>reverse?-v:v) as Vec3
  const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
  const orientationResidualRad=pointAxis===null?null:Math.atan2(Math.hypot(...cross(pointAxis,target)),pointAxis.reduce((sum,v,i)=>sum+v*target[i],0))
  const roundA=ROUND*(pa.depth+1),roundB=ROUND*(pb.depth+1)
  const pointError=point.localSupport.tolerance+roundA*(pa.placementSum+Math.hypot(...point.localSupport.point)+Math.hypot(...origin)+Math.hypot(...x))
  const pathError=line.precision.positionMm+roundB*(pb.placementSum+Math.hypot(...line.startPoint)+Math.hypot(...origin)+Math.hypot(...c))
  const directionError=line.precision.tangentRad+roundB+Math.abs(Math.hypot(...t)-1)
  const position=request.position
  const lengthCoefficient=position.mode==='free'?0:position.mode==='distance'?(position.reverse?1:0):Math.abs(position.reverse?1-position.percent/100:position.percent/100)
  const coordinateError=lengthCoefficient*line.precision.lengthMm
  const positionErrorMm=pointError+pathError+(targetCoordinateMm===null?Math.hypot(...delta):Math.abs(targetCoordinateMm))*directionError+coordinateError+ROUND*(Math.hypot(...x)+Math.hypot(...c)+Math.hypot(...delta)+(Math.abs(targetCoordinateMm??0)))
  const orientationErrorRad=pointAxis===null?null:directionError+roundA+Math.abs(Math.hypot(...pointAxis)-1)
  const rollAxis=assemblyLinePathRollAxis(request.orientation)
  let rollResidualRad:number|null=null,rollErrorRad:number|null=null
  if(rollAxis){
   if(!up||up.kind!=='support'||up.origin!=='native-face'||up.localSupport.kind!=='plane'||typeof request.orientation.roll!=='object')throw Error('Missing native UP proof.')
   const rollSign=request.orientation.roll.reverse?-1:1
   const b=transformRigidDirection(poseCopy(point.declaredWorldPose),rollAxis),g=transformRigidDirection(poseCopy(up.declaredWorldPose),[...up.localSupport.normal])
   const dot=(a:Vec3,b:Vec3)=>a.reduce((v,x,i)=>v+x*b[i],0)
   const projection=(v:Vec3)=>v.map((x,i)=>x-t[i]*dot(t,v)) as Vec3
   const bp=projection(b),gp=projection(g),lb=Math.hypot(...bp),lg=Math.hypot(...gp)
   const guideBudget=assemblyEndpointPlacementArithmetic(up,document),guideError=ROUND*(guideBudget.depth+1)+Math.abs(Math.hypot(...g)-1)
   const axisError=roundA+Math.abs(Math.hypot(...b)-1)
   // Finite angular-input chord plus worst-case projector operator perturbation.
   // A ball enclosing zero supplies no directional proof; never widen bands.
   const cone=(e:number,l:number)=>{const delta=2*Math.sin(Math.min(e,Math.PI)/2)+Math.sin(Math.min(directionError,Math.PI/2))+ROUND;return delta<l?Math.asin(delta/l):Infinity}
   rollErrorRad=cone(axisError,lb)+cone(guideError,lg)+ROUND
   if(lb>0&&lg>0){const u=bp.map(x=>x/lb) as Vec3,v=gp.map(x=>x/lg*rollSign) as Vec3;rollResidualRad=Math.atan2(Math.hypot(...cross(u,v)),dot(u,v))}
   else rollResidualRad=null // Undefined direction: no physical value; infinite error withholds precision.
  }
  const values=[...(orientationResidualRad===null?[]:[orientationResidualRad,orientationErrorRad!,...pointAxis!]),...x,...c,...t,coordinateMm,line.lengthMm,transverseResidualMm,positionResidualMm,positionErrorMm,directionError,...(targetCoordinateMm===null?[]:[targetCoordinateMm,coordinateResidualMm!])]
  if(!values.every(Number.isFinite))throw new RangeError('Native LINE path composition exceeds finite precision.')
  const precise=(rollErrorRad===null||Number.isFinite(rollErrorRad)&&rollErrorRad<=bands.angleToleranceRad&&(rollResidualRad===null||rollResidualRad>bands.angleToleranceRad||rollResidualRad+rollErrorRad<=bands.angleToleranceRad))&&values.every(v=>Number.isFinite(v)&&(v===0||Math.abs(v)>=MIN))&&positionErrorMm<=bands.lengthToleranceMm&&directionError<=bands.angleToleranceRad&&(orientationErrorRad===null||orientationErrorRad<=bands.angleToleranceRad)
  snapshot.assertPointWitness(point,document);snapshot.assertLinePathWitness(path,document);if(up)snapshot.assertMateWitness(up,document)
  const result={componentPaths:{point:[...point.componentPath],path:[...path.componentPath],...(up?{up:[...up.componentPath]}:{})},position:request.position,orientation:request.orientation,curveLengthMm:line.lengthMm,coordinateMm,targetCoordinateMm,transverseResidualMm,coordinateResidualMm,positionResidualMm,orientationResidualRad,rollResidualRad,angleTolerance:bands.angleToleranceRad,lengthTolerance:bands.lengthToleranceMm,underlyingLine:true as const,materialOrigin:true as const,verificationOnly:true as const,precision:{positionErrorMm,directionErrorRad:directionError,orientationErrorRad,rollErrorRad}}
  return precise?{...result,status:'ok' as const,satisfied:positionResidualMm<=bands.lengthToleranceMm&&(orientationResidualRad===null||orientationResidualRad<=bands.angleToleranceRad)&&(rollResidualRad===null||rollResidualRad+rollErrorRad!<=bands.angleToleranceRad)}:{...result,status:'precisionLimit' as const,satisfied:false,message:'Native LINE path precision cannot retain the requested bands.'}
 }catch(error){try{snapshot.dispose()}catch(cleanup){throw new NativeCleanupError({error},[cleanup],'LINE path verification or release failed.')}throw error}
}
