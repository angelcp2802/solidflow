import type { Vec3 } from '../cad/kernel.types'
import { assemblyDefinitionKey, validateAssemblyDocument, type AssemblyComponentReference,
  type AssemblyDefinition, type AssemblyDefinitionReference, type AssemblyDocument, type AssemblyOccurrence } from './assemblyDocument'
import { validateAssemblyMoveIntent, type AssemblyComponentMove } from './assemblyMovement'
import { assemblySourceScopePaths } from './assemblySourceUpdates'
import { rotationExp } from './assemblyKinematics'
import { measureAssemblyGearTwist } from './assemblyGear'
import { composeRigidPoses, identityRigidPose, validateRigidPose, type Quaternion, type RigidPose } from './rigidPose'

/** Per-request admission limits, not changes to solver or desktop deadlines. */
export const MAX_ASSEMBLY_MOTION_STATIONS = 128
export const MAX_ASSEMBLY_MOTION_ANGULAR_STEP = Math.PI / 3
export interface AssemblyComponentMotion {
  component: AssemblyComponentReference
  /** Absolute local destination relative to the containing assembly, in mm. */
  translation: Vec3
  /** Intrinsic component-axis increment, in signed radians; never modulo a turn. */
  rotation: { axis: 0 | 1 | 2; angle: number }
}
export interface AssemblyComponentMotionPlan {
  request: AssemblyComponentMotion
  component: AssemblyComponentReference
  scope: AssemblyDefinitionReference
  occurrenceId: string
  startPose: RigidPose
  targetPose: RigidPose
  affectedPaths: string[][]
  stationCount: number
  maxAngularStep: number
  /** Index zero is the original placement; 1..stationCount are requested stations. */
  atStation(index: number): AssemblyComponentMove
}
function fail(message: string): never { throw new Error('Movimiento angular de componente: ' + message) }
function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail('se esperaba un objeto de datos simple.')
  const output: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(input)) {
    const field = Object.getOwnPropertyDescriptor(input, key)!
    if (typeof key !== 'string' || !keys.includes(key) || !field.enumerable || !('value' in field)) fail('solo se admiten los campos de datos enumerables declarados, sin accesores.')
    output[key] = field.value
  }
  if (keys.some(key => !Object.hasOwn(output, key))) fail('faltan campos obligatorios.')
  return output
}
function axis(value: unknown): 0 | 1 | 2 {
  if (value !== 0 && value !== 1 && value !== 2) fail('el eje local debe ser 0, 1 o 2.')
  return value
}
function vector(value: Vec3, name: string): Vec3 {
  if (!value.every(Number.isFinite) || !Number.isFinite(Math.hypot(...value))) fail(name + ' excede la aritmética finita.')
  return value
}
function stations(angle: number): number {
  if (typeof angle !== 'number' || !Number.isFinite(angle)) fail('el incremento angular debe ser finito.')
  if (Math.abs(angle) > MAX_ASSEMBLY_MOTION_STATIONS * MAX_ASSEMBLY_MOTION_ANGULAR_STEP) fail('se supera el presupuesto de 128 estaciones angulares.')
  const count = Math.max(1, Math.ceil(Math.abs(angle) / MAX_ASSEMBLY_MOTION_ANGULAR_STEP))
  if (count > MAX_ASSEMBLY_MOTION_STATIONS) fail('se supera el presupuesto de 128 estaciones angulares.')
  if (angle !== 0 && angle / (2 * count) === 0) fail('el incremento angular pierde precisión representable.')
  return count
}
function componentCopy(value: AssemblyComponentReference): AssemblyComponentReference {
  return { occurrencePath: [...value.occurrencePath], definition: { ...value.definition } }
}
function requestCopy(value: AssemblyComponentMotion): AssemblyComponentMotion {
  return { component: componentCopy(value.component), translation: [...value.translation], rotation: { ...value.rotation } }
}
/** Strict intent data only; graph resolution and native checks are separate. */
export function validateAssemblyComponentMotion(input: unknown): AssemblyComponentMotion {
  const source = record(input, ['component', 'translation', 'rotation']), rotation = record(source.rotation, ['axis', 'angle'])
  const localAxis = axis(rotation.axis), angle = rotation.angle as number
  stations(angle) // Reject an excessive/underflowed request before trigonometry.
  const checked = validateAssemblyMoveIntent({ component: source.component,
    pose: { translation: source.translation, rotation: [0, 0, 0, 1] } })
  return { component: checked.component, translation: vector(checked.pose.translation, 'El destino local'), rotation: { axis: localAxis, angle } }
}

/**
 * Original-base local intent path. This pure plan neither solves mates nor
 * certifies motion between stations, collision avoidance or Apply authority.
 * Whole-turn endpoint representation may equal the original quaternion; the
 * signed increment and all intermediate stations remain in the request.
 */
export function planAssemblyComponentMotion(current: AssemblyDocument, input: AssemblyComponentMotion): AssemblyComponentMotionPlan {
  const request = validateAssemblyComponentMotion(input), stationCount = stations(request.rotation.angle)
  const document = validateAssemblyDocument(current), definitions = new Map([document, ...document.definitions].map(value => [assemblyDefinitionKey(value), value]))
  let scope: AssemblyDefinition = document, occurrenceId = '', start: RigidPose | undefined
  for (let index = 0; index < request.component.occurrencePath.length; index++) {
    if (scope.kind !== 'assembly') fail('la ruta atraviesa una pieza en lugar de un ensamblaje.')
    const id = request.component.occurrencePath[index]
    const occurrence: AssemblyOccurrence | undefined = scope.occurrences.find(value => value.id === id)
    if (!occurrence) fail('la ocurrencia seleccionada ya no existe.')
    if (occurrence.suppressed) fail('no se puede mover una ocurrencia suprimida ni un descendiente suyo.')
    if (index === request.component.occurrencePath.length - 1) {
      if (assemblyDefinitionKey(occurrence.definition) !== assemblyDefinitionKey(request.component.definition)) fail('la revisión seleccionada ya no coincide con la ruta actual.')
      if (occurrence.fixed) fail('la ocurrencia seleccionada está fijada en su ensamblaje.')
      occurrenceId = id; start = validateRigidPose(occurrence.pose); break
    }
    scope = definitions.get(assemblyDefinitionKey(occurrence.definition))!
  }
  if (!start || scope.kind !== 'assembly') fail('falta una ruta completa de ocurrencia activa.')
  vector(start.translation, 'El origen local')
  const original = validateRigidPose(start), delta = vector(request.translation.map((value, coordinate) => value - original.translation[coordinate]) as Vec3, 'El desplazamiento local')
  const translationAt = (index: number): Vec3 => index === 0 ? [...original.translation] : index === stationCount ? [...request.translation]
    : vector(original.translation.map((value, coordinate) => value + delta[coordinate] * (index / stationCount)) as Vec3, 'La estación local')
  // Bound and inspect interpolation before any angular trigonometry. A small
  // requested coordinate step must not vanish in a large local placement.
  let previous = original.translation
  for (let index = 1; index <= stationCount; index++) {
    const next = translationAt(index)
    for (let coordinate = 0; coordinate < 3; coordinate++) if (delta[coordinate] !== 0 && next[coordinate] === previous[coordinate]) {
      fail('una estación de traslación pierde precisión representable.')
    }
    previous = next
  }
  const poseAt = (index: number): RigidPose => {
    if (index === 0) return validateRigidPose(original)
    const translation = translationAt(index)
    if (index === stationCount && request.rotation.angle % (2 * Math.PI) === 0) return { translation, rotation: [...original.rotation] }
    const tangent: Vec3 = [0, 0, 0]; tangent[request.rotation.axis] = request.rotation.angle * (index / stationCount)
    const rotation = composeRigidPoses({ translation: [0, 0, 0], rotation: original.rotation },
      { translation: [0, 0, 0], rotation: rotationExp(tangent) }).rotation
    return { translation, rotation }
  }
  const reference = { id: scope.id, revision: scope.revision }
  return { request: requestCopy(request), component: componentCopy(request.component), scope: reference, occurrenceId,
    startPose: validateRigidPose(original), targetPose: poseAt(stationCount),
    affectedPaths: assemblySourceScopePaths(document, reference).map(prefix => [...prefix, occurrenceId]),
    stationCount, maxAngularStep: MAX_ASSEMBLY_MOTION_ANGULAR_STEP,
    atStation(index: number): AssemblyComponentMove {
      if (!Number.isInteger(index) || index < 0 || index > stationCount) fail('el índice de estación debe ser entero entre cero y el total.')
      return { component: componentCopy(request.component), pose: poseAt(index) }
    } }
}

/** Measure actual resolved spin against the original local frame, not intent. */
export function measureAssemblyComponentMotionAngle(startRotation: Quaternion, localAxis: 0 | 1 | 2,
  actualRotation: Quaternion, previousAngle: number, angleTolerance = 1e-8): number {
  const direction: Vec3 = [0, 0, 0]; direction[axis(localAxis)] = 1
  return measureAssemblyGearTwist(startRotation, identityRigidPose().rotation, actualRotation, direction, previousAngle, angleTolerance).angle
}
