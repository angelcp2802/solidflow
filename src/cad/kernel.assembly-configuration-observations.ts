import type { AssemblyComponentReference } from '../model/assemblyDocument'
import { validateAssemblyProfileFaceSelection, validateAssemblyProfileAxisSelection, type AssemblyProfileFaceSelection, type AssemblyProfileAxisSelection } from '../model/assemblyProfileReferences'
import { validateAssemblyLinePathSelection, type AssemblyLinePathSelection } from '../model/assemblyLinePathReferences'
import { validateAssemblyArcPathSelection, type AssemblyArcPathSelection } from '../model/assemblyArcPathReferences'
import { validateAssemblyPathCurveSelection, validateAssemblyPathBands, validateAssemblyPathCoordinate, type AssemblyPathCurveSelection } from '../model/assemblyPathReferences'
import { transformRigidPoint, transformRigidDirection, type RigidPose } from '../model/rigidPose'
import type { CadEngine } from './kernel.engine'
import type { AssemblyNativeProfileSupport, AssemblyNativeRectangleAxisSupport } from './kernel.assembly-profile-supports'
import type { AssemblyLinePathCurve } from './kernel.assembly-line-path'
import type { AssemblyArcPathCurve, AssemblyArcPathEvaluation } from './kernel.assembly-arc-path'
import { AssemblyPathCurvePrecisionError, type AssemblyPathCurveBands, type AssemblyPathCurveCoordinate, type AssemblyPathCurveObservation, type AssemblyPathCurveEvaluation } from './kernel.assembly-path-curves'

export type ConfiguredAdvancedPurpose = 'profile' | 'profile-axis' | 'line-path' | 'arc-path' | 'arc-evaluation' | 'path-curve' | 'path-evaluation'
type Prepared<P extends ConfiguredAdvancedPurpose,S>={purpose:P;selection:S;component:AssemblyComponentReference;bands:AssemblyPathCurveBands|undefined}
export type ConfiguredAdvancedPrepared = Prepared<'profile',AssemblyProfileFaceSelection> | Prepared<'profile-axis',AssemblyProfileAxisSelection>
  | Prepared<'line-path',AssemblyLinePathSelection> | Prepared<'arc-path',AssemblyArcPathSelection>
  | (Prepared<'arc-evaluation',AssemblyArcPathSelection>&{coordinate:AssemblyPathCurveCoordinate})
  | Prepared<'path-curve',AssemblyPathCurveSelection> | (Prepared<'path-evaluation',AssemblyPathCurveSelection>&{coordinate:AssemblyPathCurveCoordinate})
export type ConfiguredAdvancedObservation =
  | {kind:'configured-profile';origin:'native-profile-face';localSupport:AssemblyNativeProfileSupport;worldSupport:AssemblyNativeProfileSupport}
  | {kind:'configured-profile-axis';origin:'native-profile-boundary-edge';localSupport:AssemblyNativeRectangleAxisSupport;worldSupport:AssemblyNativeRectangleAxisSupport}
  | {kind:'configured-line-path';origin:'native-line-material-endpoint';localCurve:AssemblyLinePathCurve;worldCurve:AssemblyLinePathCurve}
  | {kind:'configured-arc-path';origin:'native-circular-material-endpoint';localCurve:AssemblyArcPathCurve;worldCurve:AssemblyArcPathCurve}
  | {kind:'configured-arc-evaluation';origin:'native-circular-material-endpoint';localCurve:AssemblyArcPathCurve;worldCurve:AssemblyArcPathCurve;localEvaluation:AssemblyArcPathEvaluation;worldEvaluation:AssemblyArcPathEvaluation}
  | {kind:'configured-path-curve';origin:'native-bounded-edge';localCurve:AssemblyPathCurveObservation;worldCurve:AssemblyPathCurveObservation}
  | {kind:'configured-path-evaluation';origin:'native-bounded-edge';localCurve:AssemblyPathCurveObservation;worldCurve:AssemblyPathCurveObservation;localEvaluation:AssemblyPathCurveEvaluation;worldEvaluation:AssemblyPathCurveEvaluation}
export interface ConfiguredPlacementArithmetic {placementSum:number;depth:number}

function profileBands(value:unknown):AssemblyPathCurveBands|undefined {
  if(value===undefined)return undefined
  if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)throw Error('Las bandas de perfil requieren datos propios.')
  const result:AssemblyPathCurveBands={}
  for(const key of Reflect.ownKeys(value)) {
    if(key!=='lengthToleranceMm'&&key!=='angleToleranceRad')throw Error('Banda de perfil desconocida.')
    const field=Object.getOwnPropertyDescriptor(value,key)!
    if(!field.enumerable||!('value' in field)||typeof field.value!=='number'||!Number.isFinite(field.value)||field.value<=0||(key==='angleToleranceRad'&&field.value>=Math.PI))throw Error('Banda de perfil inválida.')
    result[key]=field.value
  }
  return result
}
/** Closed selection preflight only. Neither this data nor the observation is a proof. */
export function prepareConfiguredAdvancedObservation(purpose:ConfiguredAdvancedPurpose,selection:unknown,bands?:unknown,coordinate?:unknown):ConfiguredAdvancedPrepared {
  if(purpose!=='arc-evaluation'&&purpose!=='path-evaluation'&&coordinate!==undefined)throw Error('Esta observación no admite una coordenada.')
  switch(purpose) {
    case 'profile':{const parsed=validateAssemblyProfileFaceSelection(selection);return {purpose,selection:parsed,component:parsed.component,bands:profileBands(bands)}}
    case 'profile-axis':{const parsed=validateAssemblyProfileAxisSelection(selection);return {purpose,selection:parsed,component:parsed.component,bands:profileBands(bands)}}
    case 'line-path':{const parsed=validateAssemblyLinePathSelection(selection);return {purpose,selection:parsed,component:parsed.component,bands:validateAssemblyPathBands(bands)}}
    case 'arc-path':{const parsed=validateAssemblyArcPathSelection(selection);return {purpose,selection:parsed,component:parsed.component,bands:validateAssemblyPathBands(bands)}}
    case 'arc-evaluation':{const parsed=validateAssemblyArcPathSelection(selection);return {purpose,selection:parsed,component:parsed.component,bands:validateAssemblyPathBands(bands),coordinate:validateAssemblyPathCoordinate(coordinate)}}
    case 'path-curve':{const parsed=validateAssemblyPathCurveSelection(selection);return {purpose,selection:parsed,component:parsed.component,bands:validateAssemblyPathBands(bands)}}
    case 'path-evaluation':{const parsed=validateAssemblyPathCurveSelection(selection);return {purpose,selection:parsed,component:parsed.component,bands:validateAssemblyPathBands(bands),coordinate:validateAssemblyPathCoordinate(coordinate)}}
    default:throw Error('Propósito configurado avanzado desconocido.')
  }
}
/** Actual current engine query plus the legacy purpose's composition policy.
 * No registry, lifetime, current-document or native Apply authority is created.
 * The caller must post-check its complete context before privately issuing proof.
 */
export function observeConfiguredAdvanced(engine:CadEngine,prepared:ConfiguredAdvancedPrepared,pose:RigidPose,arithmetic:ConfiguredPlacementArithmetic):ConfiguredAdvancedObservation {
  if(!Number.isFinite(arithmetic.placementSum)||arithmetic.placementSum<0||!Number.isSafeInteger(arithmetic.depth)||arithmetic.depth<0)throw Error('Aritmética de colocación configurada inválida.')
  switch(prepared.purpose) {
    case 'profile':return observeProfile(engine,prepared.selection,prepared.bands,pose,arithmetic)
    case 'profile-axis':return observeProfileAxis(engine,prepared.selection,prepared.bands,pose,arithmetic)
    case 'line-path':return observeLine(engine,prepared.selection,prepared.bands??{},pose,arithmetic)
    case 'arc-path':return observeArc(engine,prepared.selection,prepared.bands??{},pose,arithmetic,null)
    case 'arc-evaluation':return observeArc(engine,prepared.selection,prepared.bands??{},pose,arithmetic,prepared.coordinate)
    case 'path-curve':return observePath(engine,prepared.selection,prepared.bands??{},pose,arithmetic,null)
    case 'path-evaluation':return observePath(engine,prepared.selection,prepared.bands??{},pose,arithmetic,prepared.coordinate)
    default:throw Error('Propósito configurado avanzado desconocido.')
  }
}

function observeProfile(engine:CadEngine,parsed:AssemblyProfileFaceSelection,checkedBands:AssemblyPathCurveBands|undefined,pose:RigidPose,{placementSum,depth}:ConfiguredPlacementArithmetic):Extract<ConfiguredAdvancedObservation,{kind:'configured-profile'}>{
  const localSupport = engine.inspectCurrentProfileSupport(parsed.face, parsed.body, checkedBands)
  const point = (p: readonly number[]) => transformRigidPoint(pose, p as [number, number, number])
  const direction = (p: readonly number[]) => transformRigidDirection(pose, p as [number, number, number])
  const common = { ...localSupport, center: point(localSupport.center), normal: direction(localSupport.normal), uncertainty: { ...localSupport.uncertainty } }
  const worldProfile: AssemblyNativeProfileSupport = localSupport.kind === 'circle' ? { ...common, kind: 'circle', radiusMm: localSupport.radiusMm, radiusErrorMm: localSupport.radiusErrorMm }
    : { ...common, kind: 'rectangle', corners: localSupport.corners.map(point) as typeof localSupport.corners,
      boundaryAxes: localSupport.boundaryAxes.map(direction) as typeof localSupport.boundaryAxes, lengthsMm: [...localSupport.lengthsMm] }
  const coordinates = [...worldProfile.center, ...worldProfile.normal, ...(worldProfile.kind === 'rectangle' ? [...worldProfile.corners.flat(), ...worldProfile.boundaryAxes.flat()] : [])]
  if (!coordinates.every(Number.isFinite)) throw new Error('La posición del perfil excede la precisión finita.')
  // The public world observation must not present local extraction error
  // as the error of a composed point. Preserve original chain magnitudes
  // even when placement composition cancelled them. These remain
  // first-order arithmetic estimates, not certified intervals. Pair
  // measurement uses localSupport and private chain data independently.
  const localPoints = localSupport.kind === 'rectangle' ? [localSupport.center, ...localSupport.corners] : [localSupport.center]
  const worldPoints = worldProfile.kind === 'rectangle' ? [worldProfile.center, ...worldProfile.corners] : [worldProfile.center]
  const localMagnitude = Math.max(...localPoints.map(p => Math.hypot(...p)))
  const worldMagnitude = Math.max(...worldPoints.map(p => Math.hypot(...p)))
  const worldPositionError = localSupport.uncertainty.positionErrorMm
    + 64 * Number.EPSILON * (depth + 1) * (placementSum + localMagnitude + worldMagnitude)
  const worldNormalError = localSupport.uncertainty.normalErrorRad + 64 * Number.EPSILON * (depth + 1)
  if (!Number.isFinite(worldPositionError) || !Number.isFinite(worldNormalError)) throw new Error('La incertidumbre de composición del perfil excede la precisión finita.')
  worldProfile.uncertainty = { positionErrorMm: worldPositionError, normalErrorRad: worldNormalError }

  return {kind:'configured-profile',origin:'native-profile-face',localSupport,worldSupport:worldProfile}
}

function observeProfileAxis(engine:CadEngine,parsed:AssemblyProfileAxisSelection,checkedBands:AssemblyPathCurveBands|undefined,pose:RigidPose,{placementSum,depth}:ConfiguredPlacementArithmetic):Extract<ConfiguredAdvancedObservation,{kind:'configured-profile-axis'}>{
  const localSupport = engine.inspectCurrentProfileAxisSupport(parsed.face, parsed.edge, parsed.body, parsed.sense, checkedBands)
  const point = (p: readonly number[]) => transformRigidPoint(pose, p as [number, number, number])
  const direction = (p: readonly number[]) => transformRigidDirection(pose, p as [number, number, number])
  const local = localSupport.profile
  const profile: Extract<AssemblyNativeProfileSupport, { kind: 'rectangle' }> = { ...local, center: point(local.center), normal: direction(local.normal),
    corners: local.corners.map(point) as typeof local.corners, boundaryAxes: local.boundaryAxes.map(direction) as typeof local.boundaryAxes,
    lengthsMm: [...local.lengthsMm], uncertainty: { ...local.uncertainty } }
  const round = 64 * Number.EPSILON * (depth + 1)
  const localMagnitude = Math.max(...[local.center, ...local.corners].map(p => Math.hypot(...p)))
  const worldMagnitude = Math.max(...[profile.center, ...profile.corners].map(p => Math.hypot(...p)))
  profile.uncertainty = { positionErrorMm: local.uncertainty.positionErrorMm + round * (placementSum + localMagnitude + worldMagnitude),
    normalErrorRad: local.uncertainty.normalErrorRad + round }
  const worldSupport: AssemblyNativeRectangleAxisSupport = { ...localSupport, profile, xDirection: direction(localSupport.xDirection),
    xDirectionErrorRad: localSupport.xDirectionErrorRad + round }
  const scalars = [...profile.center, ...profile.normal, ...profile.corners.flat(), ...profile.boundaryAxes.flat(),
    ...worldSupport.xDirection, profile.uncertainty.positionErrorMm, profile.uncertainty.normalErrorRad, worldSupport.xDirectionErrorRad]
  if (!scalars.every(Number.isFinite)) throw new Error('La composición del eje de perfil excede la precisión finita.')

  return {kind:'configured-profile-axis',origin:'native-profile-boundary-edge',localSupport,worldSupport}
}

function observeLine(engine:CadEngine,parsed:AssemblyLinePathSelection,checkedBands:AssemblyPathCurveBands,pose:RigidPose,{placementSum,depth}:ConfiguredPlacementArithmetic):Extract<ConfiguredAdvancedObservation,{kind:'configured-line-path'}>{
  const localCurve=engine.inspectCurrentLinePath(parsed.edge,parsed.startVertex,parsed.body,checkedBands)
  const point=(p:readonly number[])=>transformRigidPoint(pose,p as [number,number,number])
  const worldCurve:AssemblyLinePathCurve={...localCurve,startPoint:point(localCurve.startPoint),endPoint:point(localCurve.endPoint),firstPoint:point(localCurve.firstPoint),increasingDirection:transformRigidDirection(pose,localCurve.increasingDirection as [number,number,number]),precision:{...localCurve.precision}}
  const localMagnitude=Math.max(...[localCurve.startPoint,localCurve.endPoint,localCurve.firstPoint].map(p=>Math.hypot(...p)))
  const worldMagnitude=Math.max(...[worldCurve.startPoint,worldCurve.endPoint,worldCurve.firstPoint].map(p=>Math.hypot(...p)))
  const round=128*Number.EPSILON*(depth+1)
  worldCurve.precision.positionMm+=round*(placementSum+localMagnitude+worldMagnitude)
  worldCurve.precision.tangentRad+=round
  if(![placementSum,...worldCurve.startPoint,...worldCurve.endPoint,...worldCurve.firstPoint,...worldCurve.increasingDirection,...Object.values(worldCurve.precision)].every(Number.isFinite))throw new AssemblyPathCurvePrecisionError()
  if(worldCurve.precision.positionMm>(checkedBands.lengthToleranceMm??1e-6)||worldCurve.precision.lengthMm>(checkedBands.lengthToleranceMm??1e-6)||worldCurve.precision.tangentRad>(checkedBands.angleToleranceRad??1e-8))throw new AssemblyPathCurvePrecisionError()

  return {kind:'configured-line-path',origin:'native-line-material-endpoint',localCurve,worldCurve}
}

function observeArc(engine:CadEngine,parsed:AssemblyArcPathSelection,checkedBands:AssemblyPathCurveBands,pose:RigidPose,{placementSum,depth}:ConfiguredPlacementArithmetic,coordinate:AssemblyPathCurveCoordinate|null):Extract<ConfiguredAdvancedObservation,{kind:'configured-arc-path'|'configured-arc-evaluation'}>{
  const localEvaluation = coordinate === null ? null : engine.inspectCurrentArcPathEvaluation(parsed.edge, parsed.startVertex, parsed.body, coordinate, checkedBands)
  const localCurve = localEvaluation?.observation ?? engine.inspectCurrentArcPath(parsed.edge, parsed.startVertex, parsed.body, checkedBands)
  const point = (p: readonly number[]) => transformRigidPoint(pose, p as [number, number, number])
  const direction = (p: readonly number[]) => transformRigidDirection(pose, p as [number, number, number])
  const worldCurve: AssemblyArcPathCurve = { ...localCurve, startPoint: point(localCurve.startPoint), endPoint: point(localCurve.endPoint),
    center: point(localCurve.center), normal: direction(localCurve.normal), xDirection: direction(localCurve.xDirection), precision: { ...localCurve.precision },
    materialFrame: { radial: direction(localCurve.materialFrame.radial), tangent: direction(localCurve.materialFrame.tangent), normal: direction(localCurve.materialFrame.normal) },
    arithmetic: { ...localCurve.arithmetic }, ...(localCurve.analyticArithmetic ? { analyticArithmetic: { ...localCurve.analyticArithmetic } } : {}) }
  // Retain the original placement chain before any cancellation. Rigid
  // translation affects points, never the radius or tangent direction.
  const localMagnitude = Math.max(Math.hypot(...localCurve.startPoint), Math.hypot(...localCurve.endPoint),
    Math.hypot(...localCurve.center) + localCurve.radiusMm, localEvaluation ? Math.hypot(...localEvaluation.point) : 0)
  const worldMagnitude = Math.max(Math.hypot(...worldCurve.startPoint), Math.hypot(...worldCurve.endPoint), Math.hypot(...worldCurve.center) + worldCurve.radiusMm)
  const round = 128 * Number.EPSILON * (depth + 1)
  const positionError = round * (placementSum + localMagnitude + worldMagnitude), directionError = round
  worldCurve.precision.positionMm += positionError
  worldCurve.precision.tangentRad += directionError
  worldCurve.arithmetic.positionMm += positionError
  worldCurve.arithmetic.frameRad += directionError
  if (worldCurve.analyticArithmetic) {
    worldCurve.analyticArithmetic.positionMm += positionError
    worldCurve.analyticArithmetic.frameRad += directionError
  }
  // Interior D1 and parameter arithmetic have their own budgets. Do not
  // replace an evaluation's precision with its endpoint observation's.
  const worldEvaluation: AssemblyArcPathEvaluation | null = localEvaluation === null ? null : { ...localEvaluation, observation: worldCurve,
    point: point(localEvaluation.point), tangent: direction(localEvaluation.tangent), precision: { ...localEvaluation.precision,
      positionMm: localEvaluation.precision.positionMm + positionError, tangentRad: localEvaluation.precision.tangentRad + directionError },
    arithmetic: { ...localEvaluation.arithmetic, positionMm: localEvaluation.arithmetic.positionMm + positionError,
      tangentRad: localEvaluation.arithmetic.tangentRad + directionError } }
  const values = [placementSum, ...worldCurve.startPoint, ...worldCurve.endPoint, ...worldCurve.center, ...worldCurve.normal, ...worldCurve.xDirection,
    ...worldCurve.materialFrame.radial, ...worldCurve.materialFrame.tangent, ...worldCurve.materialFrame.normal,
    worldCurve.arithmetic.positionMm, worldCurve.arithmetic.radiusMm, worldCurve.arithmetic.frameRad, worldCurve.arithmetic.sweepRad,
    worldCurve.radiusMm, ...Object.values(worldCurve.precision), ...(worldEvaluation ? [...worldEvaluation.point, ...worldEvaluation.tangent, ...Object.values(worldEvaluation.precision), worldEvaluation.arithmetic.positionMm, worldEvaluation.arithmetic.tangentRad] : [])]
  if (!values.every(Number.isFinite)) throw new AssemblyPathCurvePrecisionError()
  const lengthBand = checkedBands.lengthToleranceMm ?? 1e-6, angleBand = checkedBands.angleToleranceRad ?? 1e-8
  if (worldCurve.arithmetic.referenceModel !== 'current-native-analytic-float64'
    || [worldCurve.arithmetic.positionMm, worldCurve.arithmetic.radiusMm, worldCurve.arithmetic.frameRad, worldCurve.arithmetic.sweepRad].some(value => value < 0)
    || worldCurve.arithmetic.positionMm > lengthBand || worldCurve.arithmetic.radiusMm > lengthBand || worldCurve.arithmetic.frameRad > angleBand || worldCurve.arithmetic.sweepRad > angleBand) throw new AssemblyPathCurvePrecisionError()
  if (worldEvaluation && (worldEvaluation.arithmetic.referenceModel !== 'current-native-analytic-float64'
    || worldEvaluation.arithmetic.positionMm < 0 || worldEvaluation.arithmetic.tangentRad < 0
    || worldEvaluation.arithmetic.positionMm > lengthBand || worldEvaluation.arithmetic.tangentRad > angleBand)) throw new AssemblyPathCurvePrecisionError()
  for (const precision of [worldCurve.precision, ...(worldEvaluation ? [worldEvaluation.precision] : [])]) {
    if (precision.positionMm > lengthBand || precision.lengthMm > lengthBand || precision.tangentRad > angleBand) throw new AssemblyPathCurvePrecisionError()
  }

  return localEvaluation&&worldEvaluation?{kind:'configured-arc-evaluation',origin:'native-circular-material-endpoint',localCurve,worldCurve,localEvaluation,worldEvaluation}:{kind:'configured-arc-path',origin:'native-circular-material-endpoint',localCurve,worldCurve}
}

function observePath(engine:CadEngine,parsed:AssemblyPathCurveSelection,checkedBands:AssemblyPathCurveBands,pose:RigidPose,{placementSum,depth}:ConfiguredPlacementArithmetic,coordinate:AssemblyPathCurveCoordinate|null):Extract<ConfiguredAdvancedObservation,{kind:'configured-path-curve'|'configured-path-evaluation'}>{
  const localEvaluation = coordinate === null ? null : engine.inspectCurrentPathEvaluation(parsed.edge, parsed.body, parsed.sense, coordinate, checkedBands)
  const localCurve = localEvaluation?.observation ?? engine.inspectCurrentPathCurve(parsed.edge, parsed.body, parsed.sense, checkedBands)
  const point = (p: readonly number[]) => transformRigidPoint(pose, p as [number, number, number])
  const direction = (p: readonly number[]) => transformRigidDirection(pose, p as [number, number, number])
  const common = { ...localCurve, startPoint: point(localCurve.startPoint), endPoint: point(localCurve.endPoint), precision: { ...localCurve.precision } }
  const worldCurve: AssemblyPathCurveObservation = localCurve.kind === 'line'
    ? { ...common, kind: 'line', firstPoint: point(localCurve.firstPoint), increasingDirection: direction(localCurve.increasingDirection) }
    : { ...common, kind: 'circle', center: point(localCurve.center), normal: direction(localCurve.normal), xDirection: direction(localCurve.xDirection), radiusMm: localCurve.radiusMm }
  const points = (curve: AssemblyPathCurveObservation) => [curve.startPoint, curve.endPoint, curve.kind === 'line' ? curve.firstPoint : curve.center]
  const localMagnitude = Math.max(...points(localCurve).map(p => Math.hypot(...p)), localEvaluation ? Math.hypot(...localEvaluation.point) : 0,
    localCurve.kind === 'circle' ? Math.hypot(...localCurve.center) + localCurve.radiusMm : 0)
  const worldMagnitude = Math.max(...points(worldCurve).map(p => Math.hypot(...p)),
    worldCurve.kind === 'circle' ? Math.hypot(...worldCurve.center) + worldCurve.radiusMm : 0)
  const round = 128 * Number.EPSILON * (depth + 1)
  const positionError = round * (placementSum + localMagnitude + worldMagnitude), directionError = round
  worldCurve.precision.positionMm += positionError
  worldCurve.precision.tangentRad += directionError
  const worldEvaluation = localEvaluation === null ? null : { ...localEvaluation, observation: worldCurve,
    point: point(localEvaluation.point), tangent: direction(localEvaluation.tangent),
    precision: { ...localEvaluation.precision, positionMm: localEvaluation.precision.positionMm + positionError,
      tangentRad: localEvaluation.precision.tangentRad + directionError } }
  if (worldCurve.kind === 'circle' && worldCurve.analyticArithmetic) {
    worldCurve.analyticArithmetic = { ...worldCurve.analyticArithmetic,
      positionMm: worldCurve.analyticArithmetic.positionMm + positionError, frameRad: worldCurve.analyticArithmetic.frameRad + directionError }
  }
  const values = [...points(worldCurve).flat(), ...Object.values(worldCurve.precision),
    ...(worldCurve.kind === 'line' ? worldCurve.increasingDirection : [...worldCurve.normal, ...worldCurve.xDirection]),
    ...(worldEvaluation ? [...worldEvaluation.point, ...worldEvaluation.tangent, ...Object.values(worldEvaluation.precision)] : [])]
  if (!values.every(Number.isFinite) || !Number.isFinite(placementSum)) throw new Error('La composición del trayecto excede la precisión finita.')
  const lengthBand = checkedBands.lengthToleranceMm ?? 1e-6, angleBand = checkedBands.angleToleranceRad ?? 1e-8
  if (worldCurve.kind === 'circle' && worldCurve.analyticArithmetic) {
    const arithmetic = worldCurve.analyticArithmetic
    if (arithmetic.referenceModel !== 'current-native-analytic-float64' || ![arithmetic.positionMm, arithmetic.radiusMm, arithmetic.frameRad, arithmetic.sweepRad].every(value => Number.isFinite(value) && value >= 0)
      || arithmetic.positionMm > lengthBand || arithmetic.radiusMm > lengthBand || arithmetic.frameRad > angleBand || arithmetic.sweepRad > angleBand) throw new AssemblyPathCurvePrecisionError()
  }
  for (const precision of [worldCurve.precision, ...(worldEvaluation ? [worldEvaluation.precision] : [])]) {
    if (precision.positionMm > lengthBand || precision.lengthMm > lengthBand || precision.tangentRad > angleBand) throw new AssemblyPathCurvePrecisionError()
  }

  return localEvaluation&&worldEvaluation?{kind:'configured-path-evaluation',origin:'native-bounded-edge',localCurve,worldCurve,localEvaluation,worldEvaluation}:{kind:'configured-path-curve',origin:'native-bounded-edge',localCurve,worldCurve}
}
