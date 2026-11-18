import type {Vec3} from './kernel.types'
import { getOC, type Edge, type Vertex } from 'replicad'
import { withNativeOwners } from './kernel.native-ownership'
import { observeAssemblyPathCurve, evaluateAssemblyPathCurve, type AssemblyPathCurveObservation, type AssemblyPathCurveEvaluation, type AssemblyPathCurveCoordinate, type AssemblyPathCurveBands, type AssemblyCircleArithmetic, AssemblyPathCurvePrecisionError } from './kernel.assembly-path-curves'

/** Open circular trim with a chosen exact native material endpoint. No seam or
 * saved Path policy is established by this detached observation. */
export type AssemblyArcPathCurve = Extract<AssemblyPathCurveObservation,{kind:'circle'}> & {closed:false;materialFrame:{radial:Vec3;tangent:Vec3;normal:Vec3};arithmetic:AssemblyCircleArithmetic}
export type AssemblyArcPathEvaluation = Omit<AssemblyPathCurveEvaluation,'observation'> & {observation:AssemblyArcPathCurve;arithmetic:{referenceModel:'current-native-analytic-float64';positionMm:number;tangentRad:number}}
type CircleObservation=Extract<AssemblyPathCurveObservation,{kind:'circle'}>
/** Within-query coherence only, never native identity by coordinates. */
function sameCircle(a:CircleObservation,b:CircleObservation):boolean{
 return a.radiusMm===b.radiusMm&&a.parameterDomain.first===b.parameterDomain.first&&a.parameterDomain.last===b.parameterDomain.last&&a.startParameter===b.startParameter&&a.endParameter===b.endParameter&&a.sense===b.sense&&a.closed===b.closed&&a.periodic===b.periodic&&a.period===b.period&&a.parameterSpeed===b.parameterSpeed&&(['center','normal','xDirection']as const).every(k=>a[k].every((v,i)=>v===b[k][i]))
}
/** The selected native vertex determines the direction through this particular
 * trim. Coordinates, edge traversal and circle phase never establish identity. */
export function observeAssemblyArcPath(edge:Edge,startVertex:Vertex,bands:AssemblyPathCurveBands={}):AssemblyArcPathCurve{
 return withNativeOwners(owners=>{
  const oc=getOC(),raw=edge?.wrapped,chosen=startVertex?.wrapped
  if(!raw||!chosen||raw.IsNull()||chosen.IsNull()||chosen.ShapeType()!==oc.TopAbs_ShapeEnum.TopAbs_VERTEX)throw Error('A current material arc endpoint is required.')
  const observed=observeAssemblyPathCurve(edge,1,bands)
  if(observed.kind!=='circle'||observed.closed)throw Error('Material arc requires an open trimmed circle, not LINE or a closed seam.')
  const explorer=owners.own(new oc.TopExp_Explorer(raw,oc.TopAbs_ShapeEnum.TopAbs_VERTEX,oc.TopAbs_ShapeEnum.TopAbs_SHAPE))
  const vertices:ReturnType<typeof explorer.Current>[]=[];let occurrences=0
  while(explorer.More()){
   const vertex=owners.own(explorer.Current())
   if(++occurrences>2)throw Error('Material arc requires exactly two endpoint occurrences.')
   if(!vertices.some(v=>v.IsSame(vertex)))vertices.push(vertex)
   explorer.Next()
  }
  if(occurrences!==2||vertices.length!==2)throw Error('Material arc requires two distinct native endpoints.')
  const matches=vertices.map((v,i)=>v.IsSame(chosen)?i:-1).filter(i=>i>=0)
  if(matches.length!==1)throw Error('Material arc start is not an exact endpoint of this edge.')
  const parameters=vertices.map(v=>oc.BRep_Tool.Parameter(owners.own(oc.TopoDS.Vertex(v)),raw)),{first,last}=observed.parameterDomain
  if(!parameters.every(Number.isFinite)||!((parameters[0]===first&&parameters[1]===last)||(parameters[1]===first&&parameters[0]===last)))throw Error('Native endpoint parameters do not identify the exact circular trim.')
  const sense=parameters[matches[0]]===first?1:-1,result=sense===1?observed:observeAssemblyPathCurve(edge,-1,bands)
  if(result.kind!=='circle'||result.closed)throw Error('Native arc kind changed during material origin query.')
  const source=result.analyticArithmetic
  if(!source||source.referenceModel!=='current-native-analytic-float64'||![source.positionMm,source.radiusMm,source.frameRad,source.sweepRad].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)||source.radiusMm===0||source.frameRad===0||source.sweepRad===0)throw new AssemblyPathCurvePrecisionError()
  const sweep=result.parameterDomain.last-result.parameterDomain.first
  if(!(result.radiusMm-source.radiusMm>0)||!(sweep-source.sweepRad>0)||!(sweep+source.sweepRad<2*Math.PI))throw new AssemblyPathCurvePrecisionError()
  const dot=(a:Vec3,b:Vec3)=>a.reduce((sum,v,i)=>sum+v*b[i],0),cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
  const unit=(a:Vec3):Vec3=>{const length=Math.hypot(...a);if(!Number.isFinite(length)||length===0)throw new AssemblyPathCurvePrecisionError();return a.map(v=>v/length) as Vec3}
  const phase=result.startParameter,y=cross(result.normal,result.xDirection)
  const radial=unit(result.xDirection.map((v,i)=>Math.cos(phase)*v+Math.sin(phase)*y[i]) as Vec3)
  const analyticTangent=unit(result.xDirection.map((v,i)=>sense*(-Math.sin(phase)*v+Math.cos(phase)*y[i])) as Vec3)
  const tangent=unit(analyticTangent.map((v,i)=>v-radial[i]*dot(radial,analyticTangent)) as Vec3),normal=unit(cross(radial,tangent))
  // Query actual D1 at the material start, which is LAST for reverse. Its
  // discrepancy corroborates tangent; the other two native axes establish the
  // full proper frame rather than treating one tangent as a 3-DOF certificate.
  const start=evaluateAssemblyPathCurve(edge,sense,{kind:'arc-length',distanceMm:0},bands)
  if(start.observation.kind!=='circle'||start.observation.closed||start.parameter!==phase||!sameCircle(result,start.observation))throw Error('Native material arc start changed during frame query.')
  const discrepancy=Math.atan2(Math.hypot(...cross(tangent,start.tangent)),dot(tangent,start.tangent)),frameDefect=Math.abs(dot(radial,analyticTangent))+Math.abs(Math.hypot(...radial)-1)+Math.abs(Math.hypot(...analyticTangent)-1)
  const arithmetic={...source,frameRad:source.frameRad+128*Number.EPSILON*(1+Math.abs(phase))+start.precision.tangentRad+discrepancy+frameDefect}
  // The generic observer permits topological endpoint tolerance. This new
  // analytic purpose additionally requires numerical coherence with its declared
  // circle; a tau-sized D1/Value defect is not center arithmetic uncertainty.
  const magnitude=(p:Vec3)=>Math.hypot(...p)
  const expectedAt=(u:number):Vec3=>result.center.map((c,i)=>c+result.radiusMm*(Math.cos(u)*result.xDirection[i]+Math.sin(u)*y[i])) as Vec3
  const coherent=(actual:Vec3,parameter:number)=>{
   const expected=expectedAt(parameter),frameAngle=arithmetic.frameRad+source.sweepRad
   const budget=source.positionMm+source.radiusMm+2*result.radiusMm*Math.sin(Math.min(frameAngle,Math.PI)/2)+128*Number.EPSILON*(magnitude(actual)+magnitude(result.center)+result.radiusMm*(1+Math.abs(parameter)))
   if(!Number.isFinite(budget)||magnitude(actual.map((v,i)=>v-expected[i]) as Vec3)>budget)throw new AssemblyPathCurvePrecisionError()
  }
  coherent(result.startPoint,result.startParameter);coherent(result.endPoint,result.endParameter);coherent(start.point,phase)
  if(!Object.values(arithmetic).filter(v=>typeof v==='number').every(Number.isFinite)||arithmetic.positionMm>(bands.lengthToleranceMm??1e-6)||arithmetic.radiusMm>(bands.lengthToleranceMm??1e-6)||arithmetic.frameRad>(bands.angleToleranceRad??1e-8)||arithmetic.sweepRad>(bands.angleToleranceRad??1e-8))throw new AssemblyPathCurvePrecisionError()
  return {...result,closed:false,materialFrame:{radial,tangent,normal},arithmetic}
 },undefined,'Material arc origin query or release failed.')
}
/** Finite material-coordinate evaluation only: no extrapolation or periodic
 * wrapping. The generic observer's native parameter domain remains verbatim. */
export function evaluateAssemblyArcPath(edge:Edge,startVertex:Vertex,coordinate:AssemblyPathCurveCoordinate,bands:AssemblyPathCurveBands={}):AssemblyArcPathEvaluation{
 const material=observeAssemblyArcPath(edge,startVertex,bands),evaluation=evaluateAssemblyPathCurve(edge,material.sense,coordinate,bands),actual=evaluation.observation
 if(actual.kind!=='circle'||actual.closed||!sameCircle(material,actual))throw Error('Native arc changed during material evaluation.')
 const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a:Vec3,b:Vec3)=>a.reduce((sum,v,i)=>sum+v*b[i],0)
 const u=evaluation.parameter,y=cross(actual.normal,actual.xDirection),R=actual.radiusMm,source=material.arithmetic,round=128*Number.EPSILON
 const expected=actual.center.map((c,i)=>c+R*(Math.cos(u)*actual.xDirection[i]+Math.sin(u)*y[i])) as Vec3
 const expectedTangent=actual.xDirection.map((v,i)=>material.sense*(-Math.sin(u)*v+Math.cos(u)*y[i])) as Vec3
 const discrepancy=Math.atan2(Math.hypot(...cross(evaluation.tangent,expectedTangent)),dot(evaluation.tangent,expectedTangent))
 // Separate D1 arithmetic from the generic precision envelope, which retains
 // topological tolerance for its older observation contract.
 const arithmetic={referenceModel:'current-native-analytic-float64' as const,
  positionMm:source.positionMm+source.radiusMm+2*R*Math.sin(Math.min(source.frameRad+source.sweepRad,Math.PI)/2)+round*(Math.hypot(...evaluation.point)+Math.hypot(...actual.center)+R*(1+Math.abs(u))+actual.lengthMm),
  tangentRad:source.frameRad+round*(1+Math.abs(u))+discrepancy}
 if(!Number.isFinite(arithmetic.positionMm)||!Number.isFinite(arithmetic.tangentRad)||Math.hypot(...evaluation.point.map((v,i)=>v-expected[i]))>arithmetic.positionMm||arithmetic.positionMm>(bands.lengthToleranceMm??1e-6)||arithmetic.tangentRad>(bands.angleToleranceRad??1e-8))throw new AssemblyPathCurvePrecisionError()
 return {...evaluation,arithmetic,observation:{...actual,closed:false,materialFrame:material.materialFrame,arithmetic:material.arithmetic}}
}
