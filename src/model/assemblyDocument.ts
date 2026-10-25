import { validateAssemblyLimitedHingeReferenceRequest, type AssemblyLimitedHingeReferenceRequest } from './assemblyLimitedHingeReferences'
import { validateAssemblyHingeReferenceRequest, type AssemblyHingeReferenceRequest } from './assemblyHingeReferences'
import { validateAssemblySourceLink, type AssemblySourceLink } from './assemblySourceLink'
export type { AssemblySourceLink } from './assemblySourceLink'
import type { BodyReference, EdgeReference, FaceReference, Plane, VertexReference } from '../cad/kernel.types'
import { validateVertexReference } from '../cad/kernel.vertex-references'
import { validateDocument, type Document } from './document'
import { composeRigidPoses, identityRigidPose, validateRigidPose, type Quaternion, type RigidPose } from './rigidPose'
import { validateAssemblyGearData, type AssemblyGearData } from './assemblyGear'
import { validateAssemblyScrewData, type AssemblyScrewData } from './assemblyScrew'
import { validateAssemblyRackPinionData, type AssemblyRackPinionData } from './assemblyRackPinion'
import { assemblyDirectionMateAngle, assemblyDirectionReferenceKind, type AssemblyDirectionAlignment } from './assemblyDirectionMates'
import { assemblyTangentSideSign, type AssemblyTangentSide } from './assemblyTangentMates'
import { validateAssemblyCylinderTangentBranch, type AssemblyCylinderTangentBranch } from './assemblyCylinderTangentMates'
import { validateAssemblySphereTangentBranch, type AssemblySphereTangentBranch } from './assemblySphereTangentMates'
import { validateAssemblyLimitDistanceLimits, type AssemblyLimitDistanceLimits } from './assemblyLimitDistance'
import { validateAssemblyLimitAngleLimits, type AssemblyLimitAngleLimits } from './assemblyLimitAngle'
import { validateAssemblyDirectedAngleArc, type AssemblyDirectedAngleArc } from './assemblyLimitDirectedAngle'
import type { PlaneBisectorBranch } from './assemblyPlaneBisectors'
import { validateAssemblySymmetryReferenceSet, type AssemblySymmetryReferenceSet } from './assemblySymmetryReferences'
import { validateAssemblyLinePathMateRequest, type AssemblyLinePathMateRequest } from './assemblyLinePathMate'
import { validateAssemblyCircularPathReferenceRequest, type AssemblyCircularPathReferenceRequest } from './assemblyCircularPathReferences'
import { validateAssemblyProfileCenterReferenceRequest, type AssemblyProfileCenterReferenceRequest } from './assemblyProfileCenterReferences'

export const ASSEMBLY_DOCUMENT_VERSION = 2
export const MAX_ASSEMBLY_BYTES = 20 * 1024 * 1024
export const MAX_ASSEMBLY_DEFINITIONS = 512
export const MAX_ASSEMBLY_OCCURRENCES = 4096
export const MAX_ASSEMBLY_MATES = 4096
export const MAX_ASSEMBLY_DEPTH = 32
export const MAX_ASSEMBLY_PART_FEATURES = 20_000
const MAX_JSON_NODES = 1_000_000
const MAX_JSON_DEPTH = 128

/** Opaque labels, not proof that the content or native geometry is current. */
export interface AssemblyDefinitionReference { id: string; revision: string }
export interface AssemblyComponentReference {
  /** Local to the assembly that declares this endpoint, never an array index. */
  occurrencePath: string[]
  definition: AssemblyDefinitionReference
}
export interface AssemblyOccurrence {
  id: string
  name: string
  definition: AssemblyDefinitionReference
  pose: RigidPose
  /** Fixed relative to this occurrence's containing assembly, not always world. */
  fixed: boolean
  suppressed: boolean
  visible: boolean
}
export interface AssemblyFaceReference {
  kind: 'face'
  component: AssemblyComponentReference
  /** Null declares a legacy aggregate; only native resolution can attest it. */
  body: BodyReference | null
  face: FaceReference
  support: 'plane' | 'axis'
}
export interface AssemblyPrincipalPlaneReference {
  kind: 'principal-plane'
  /** Null names the declaring assembly's frame, not an inferred component. */
  component: AssemblyComponentReference | null
  plane: Plane
}
export interface AssemblyEdgeReference {
  kind: 'edge'
  component: AssemblyComponentReference
  body: BodyReference | null
  edge: EdgeReference
  support: 'line'
}
/** Analytic datum line through the declaring frame's origin; no material radius. */
export interface AssemblyPrincipalAxisReference {
  kind: 'principal-axis'
  component: AssemblyComponentReference | null
  axis: 'X' | 'Y' | 'Z'
}
/** Point purpose is separate from directional references and explicit datums. */
export interface AssemblyVertexReference {
  kind: 'vertex'
  component: AssemblyComponentReference
  /** Null is an exact legacy aggregate, never a choice of an explicit body. */
  body: BodyReference | null
  vertex: VertexReference
  support: 'point'
}
export type AssemblyGeometryReference = AssemblyFaceReference | AssemblyPrincipalPlaneReference | AssemblyPrincipalAxisReference | AssemblyEdgeReference
export type AssemblyPlaneReference = AssemblyPrincipalPlaneReference | (AssemblyFaceReference & { support: 'plane' })
export type AssemblyAxisReference = AssemblyFaceReference & { support: 'axis' }
export type AssemblyConcentricReference = AssemblyAxisReference | AssemblyPrincipalAxisReference
export type AssemblyRackReference = AssemblyAxisReference | AssemblyEdgeReference
/** Explicit surface intent. Existing axis and generic geometry references stay unchanged. */
export type AssemblyCylinderSurfaceReference = Omit<AssemblyFaceReference, 'support'> & { support: 'cylinder-surface' }
export type AssemblyTangentReference = AssemblyPlaneReference | AssemblyCylinderSurfaceReference
export type AssemblySphereSurfaceReference = Omit<AssemblyFaceReference, 'support'> & { support: 'sphere-surface' }
/** Explicit analytic surface intent, excluded from the legacy geometry union. */
export type AssemblySphereTangentReference = AssemblyPlaneReference | AssemblyCylinderSurfaceReference | AssemblySphereSurfaceReference
interface AssemblyMateBase { id: string; name: string; suppressed: boolean }
export type AssemblyLimitAngleMate = AssemblyMateBase & { type: 'limit-angle'; coordinate: 'principal-direction';
  first: AssemblyGeometryReference; second: AssemblyGeometryReference; limits: AssemblyLimitAngleLimits }
export type AssemblyLimitDirectedAngleMate = AssemblyMateBase & { type: 'limit-directed-angle'; coordinate: 'directed-about-axis';
  first: AssemblyGeometryReference; second: AssemblyGeometryReference; guide: AssemblyGeometryReference; arc: AssemblyDirectedAngleArc }
export type AssemblyLimitDistanceMate = AssemblyMateBase & { type: 'limit-distance'; first: AssemblyPlaneReference; second: AssemblyPlaneReference;
  alignment: 'aligned' | 'opposed'; limits: AssemblyLimitDistanceLimits }
export type AssemblyCylinderTangentMate = AssemblyMateBase & {
  first: AssemblyCylinderSurfaceReference; second: AssemblyCylinderSurfaceReference; branch: AssemblyCylinderTangentBranch
} & ({ type: 'skew-cylinder-tangent' } | { type: 'parallel-cylinder-tangent' })
export type AssemblySphereTangentMate = AssemblyMateBase & (
  | { type: 'plane-sphere-tangent'; first: AssemblyPlaneReference | AssemblySphereSurfaceReference;
      second: AssemblyPlaneReference | AssemblySphereSurfaceReference; side: AssemblyTangentSide }
  | { type: 'sphere-sphere-tangent'; first: AssemblySphereSurfaceReference; second: AssemblySphereSurfaceReference; branch: AssemblySphereTangentBranch }
  | { type: 'cylinder-sphere-tangent'; first: AssemblyCylinderSurfaceReference | AssemblySphereSurfaceReference;
      second: AssemblyCylinderSurfaceReference | AssemblySphereSurfaceReference; branch: AssemblySphereTangentBranch }
)
export type AssemblyBinaryMate =
  | AssemblyLimitDirectedAngleMate
  | AssemblyLimitAngleMate
  | AssemblyLimitDistanceMate
  | AssemblyCylinderTangentMate
  | AssemblySphereTangentMate
  | (AssemblyMateBase & { type: 'concentric'; first: AssemblyConcentricReference; second: AssemblyConcentricReference;
      alignment: 'aligned' | 'opposed'; rotationLock: Quaternion | null })
  | (AssemblyMateBase & { type: 'coincident'; first: AssemblyPlaneReference; second: AssemblyPlaneReference;
      alignment: 'aligned' | 'opposed' })
  | (AssemblyMateBase & { type: 'distance'; first: AssemblyPlaneReference; second: AssemblyPlaneReference;
      alignment: 'aligned' | 'opposed'; distance: number })
  | (AssemblyMateBase & { type: 'angle'; first: AssemblyGeometryReference; second: AssemblyGeometryReference; angle: number })
  | (AssemblyMateBase & { type: 'parallel'; first: AssemblyGeometryReference; second: AssemblyGeometryReference;
      alignment: AssemblyDirectionAlignment })
  | (AssemblyMateBase & { type: 'perpendicular'; first: AssemblyGeometryReference; second: AssemblyGeometryReference;
      alignment: AssemblyDirectionAlignment })
  | (AssemblyMateBase & { type: 'tangent'; first: AssemblyTangentReference; second: AssemblyTangentReference;
      /** Cylinder center is on this side of the plane's oriented normal. */
      side: AssemblyTangentSide })
  | (AssemblyMateBase & { type: 'lock'; first: AssemblyComponentReference; second: AssemblyComponentReference;
      /** T_first^-1 * T_second, captured from an actual fresh solved placement. */
      relativePose: RigidPose })
  | (AssemblyMateBase & AssemblyGearData & { type: 'gear'; first: AssemblyAxisReference; second: AssemblyAxisReference;
      /** Explicit carrier; null names this declaration's fixed assembly frame. */
      carrier: AssemblyComponentReference | null })
  | (AssemblyMateBase & AssemblyScrewData & { type: 'screw'; first: AssemblyAxisReference; second: AssemblyAxisReference })
  | (AssemblyMateBase & AssemblyRackPinionData & { type: 'rack-pinion'; first: AssemblyAxisReference; second: AssemblyRackReference })

/** Saved ordered plane-group intent; native purpose and satisfaction remain separate checks. */
export type AssemblyWidthCenteredMate = AssemblyMateBase & {
  type: 'width'
  mode: 'centered'
  width: [AssemblyPlaneReference, AssemblyPlaneReference]
  tab: [AssemblyPlaneReference, AssemblyPlaneReference]
  widthBranch: PlaneBisectorBranch
  tabBranch: PlaneBisectorBranch
  alignment: 'aligned' | 'opposed'
}
export type AssemblySymmetryMate = AssemblyMateBase & { type: 'symmetry' } & AssemblySymmetryReferenceSet
export type AssemblyProfileCenterMate = AssemblyMateBase & { type: 'profile-center' } & AssemblyProfileCenterReferenceRequest
export type AssemblyLinePathMate = AssemblyMateBase & { type: 'line-path' } & AssemblyLinePathMateRequest
export type AssemblyCircularPathMate = AssemblyMateBase & { type: 'circular-path' } & AssemblyCircularPathReferenceRequest
export type AssemblyHingeMate = AssemblyMateBase & { type: 'hinge'; stops?: AssemblyLimitedHingeReferenceRequest['stops'] } & AssemblyHingeReferenceRequest
export type AssemblyMate = AssemblyHingeMate | AssemblyCircularPathMate | AssemblyLinePathMate | AssemblyBinaryMate | AssemblyWidthCenteredMate | AssemblySymmetryMate | AssemblyProfileCenterMate

interface AssemblyNode extends AssemblyDefinitionReference {
  kind: 'assembly'
  name: string
  occurrences: AssemblyOccurrence[]
  mates: AssemblyMate[]
  createdAt: string
  updatedAt: string
}
export interface EmbeddedPartDefinition extends AssemblyDefinitionReference {
  kind: 'part'
  document: Document
  sourceLink?: AssemblySourceLink
}
export interface EmbeddedAssemblyDefinition extends AssemblyNode { sourceLink?: AssemblySourceLink }
export type AssemblyDefinition = EmbeddedPartDefinition | EmbeddedAssemblyDefinition
export interface AssemblyDocument extends AssemblyNode {
  version: 2
  units: 'mm'
  /** Flat, revision-addressed table; nested occurrences reference this table. */
  definitions: AssemblyDefinition[]
}
export type CadDocument = Document | AssemblyDocument
export interface ExpandedPartOccurrence {
  path: string[]
  definition: EmbeddedPartDefinition
  occurrence: AssemblyOccurrence
  /** Complete local state chain; do not OR fixed flags into a world anchor. */
  chain: AssemblyOccurrence[]
  worldPose: RigidPose
  suppressed: boolean
  visible: boolean
}

function fail(path: string, message: string): never { throw new Error(path + ': ' + message) }
function text(value: unknown, path: string, maximum = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) fail(path, 'texto no válido')
  return value
}
function identifier(value: unknown, path: string): string {
  const result = text(value, path, 128)
  if (/[\x00-\x1f\x7f]/.test(result)) fail(path, 'identificador con caracteres de control')
  return result
}
function record(value: unknown, path: string, required: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'se esperaba un objeto')
  const fields = Object.getOwnPropertyDescriptors(value)
  for (const key of Reflect.ownKeys(fields)) {
    if (typeof key !== 'string' || !required.includes(key)) fail(path, 'campo desconocido')
    if (!('value' in fields[key]) || !fields[key].enumerable) fail(path, 'se esperaban campos de datos')
  }
  for (const key of required) if (!Object.hasOwn(fields, key)) fail(path + '.' + key, 'campo obligatorio')
  return value as Record<string, unknown>
}
function list(value: unknown, path: string, maximum: number, minimum = 0): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail(path, 'longitud de lista no válida')
  for (let index = 0; index < value.length; index++) {
    const field = Object.getOwnPropertyDescriptor(value, String(index))
    if (!field || !('value' in field)) fail(path + '[' + index + ']', 'elemento de datos obligatorio')
  }
  return value
}
function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'se esperaba verdadero o falso')
  return value
}
function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'se esperaba un número finito')
  return value
}
function stamp(value: unknown, path: string): string {
  const result = text(value, path, 40)
  const date = new Date(result)
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== result) fail(path, 'fecha ISO UTC no válida')
  return result
}
function metadata(source: Record<string, unknown>, path: string) {
  const createdAt = stamp(source.createdAt, path + '.createdAt'), updatedAt = stamp(source.updatedAt, path + '.updatedAt')
  if (Date.parse(updatedAt) < Date.parse(createdAt)) fail(path + '.updatedAt', 'anterior a la fecha de creación')
  return { id: identifier(source.id, path + '.id'), revision: identifier(source.revision, path + '.revision'),
    name: text(source.name, path + '.name'), createdAt, updatedAt }
}

/**
 * Bound object-form inputs before invoking the part parser. Only JSON data is
 * admitted: no accessors/toJSON, hidden fields, JS object cycles or prototypes.
 * Repeated references are counted each time, just as JSON serialization does.
 */
function checkJsonData(value: unknown): void {
  type Frame = { value: unknown; depth: number; exit?: boolean }
  const stack: Frame[] = [{ value, depth: 0 }], ancestors = new Set<object>(), encoder = new TextEncoder()
  let bytes = 0, nodes = 0
  const add = (amount: number) => {
    bytes += amount
    if (bytes > MAX_ASSEMBLY_BYTES) fail('Ensamblaje', 'el documento supera los 20 MB admitidos')
  }
  const stringBytes = (value: string) => {
    if (value.length > MAX_ASSEMBLY_BYTES) fail('Ensamblaje', 'el documento supera los 20 MB admitidos')
    return encoder.encode(JSON.stringify(value)).byteLength
  }
  while (stack.length) {
    const frame = stack.pop()!, current = frame.value
    if (frame.exit) { ancestors.delete(current as object); continue }
    if (++nodes > MAX_JSON_NODES || frame.depth > MAX_JSON_DEPTH) fail('Ensamblaje', 'datos JSON demasiado complejos')
    if (current === null) { add(4); continue }
    if (typeof current === 'string') { add(stringBytes(current)); continue }
    if (typeof current === 'boolean') { add(current ? 4 : 5); continue }
    if (typeof current === 'number' && Number.isFinite(current)) { add(JSON.stringify(current).length); continue }
    if (!current || typeof current !== 'object') fail('Ensamblaje', 'solo se admiten datos JSON finitos')
    const array = Array.isArray(current), prototype = Object.getPrototypeOf(current)
    if ((!array && prototype !== Object.prototype && prototype !== null) ||
        (array && prototype !== Array.prototype)) fail('Ensamblaje', 'prototipo no válido')
    if (ancestors.has(current)) fail('Ensamblaje', 'ciclo de objetos JSON')
    ancestors.add(current); stack.push({ value: current, depth: frame.depth, exit: true })
    if (array && current.length > MAX_JSON_NODES) fail('Ensamblaje', 'lista JSON demasiado compleja')
    const descriptors = Object.getOwnPropertyDescriptors(current)
    const keys = Reflect.ownKeys(descriptors).filter(key => !array || key !== 'length')
    if (array) {
      if (current.length > MAX_JSON_NODES || keys.length !== current.length) fail('Ensamblaje', 'lista JSON no densa')
      for (const key of keys) {
        if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= current.length) fail('Ensamblaje', 'campo de lista desconocido')
      }
    }
    add(2 + Math.max(0, keys.length - 1))
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index]
      if (typeof key !== 'string') fail('Ensamblaje', 'clave JSON no válida')
      const descriptor = descriptors[key]
      if (!descriptor.enumerable || !('value' in descriptor)) fail('Ensamblaje', 'se esperaban campos de datos JSON')
      if (!array) add(stringBytes(key) + 1)
      stack.push({ value: descriptor.value, depth: frame.depth + 1 })
    }
  }
}

export function assemblyDefinitionKey(reference: AssemblyDefinitionReference): string {
  return JSON.stringify([reference.id, reference.revision])
}
export function assemblyOccurrencePathKey(path: readonly string[]): string {
  checkJsonData(path)
  return JSON.stringify(list(path, 'Ruta', MAX_ASSEMBLY_DEPTH).map((id, index) => identifier(id, 'Ruta[' + index + ']')))
}
function definitionReference(value: unknown, path: string): AssemblyDefinitionReference {
  const source = record(value, path, ['id', 'revision'])
  return { id: identifier(source.id, path + '.id'), revision: identifier(source.revision, path + '.revision') }
}
function componentReference(value: unknown, path: string): AssemblyComponentReference {
  const source = record(value, path, ['occurrencePath', 'definition'])
  return { occurrencePath: list(source.occurrencePath, path + '.occurrencePath', MAX_ASSEMBLY_DEPTH, 1)
    .map((id, index) => identifier(id, path + '.occurrencePath[' + index + ']')),
  definition: definitionReference(source.definition, path + '.definition') }
}
function geometryReference(value: unknown, path: string): AssemblyGeometryReference {
  if (!value || typeof value !== 'object') fail(path, 'referencia geométrica no válida')
  const kind = (value as Record<string, unknown>).kind
  if (kind === 'principal-axis') {
    const source = record(value, path, ['kind', 'component', 'axis'])
    if (!['X', 'Y', 'Z'].includes(source.axis as string)) fail(path + '.axis', 'eje principal desconocido')
    return { kind, component: source.component === null ? null : componentReference(source.component, path + '.component'), axis: source.axis as 'X' | 'Y' | 'Z' }
  }
  if (kind === 'principal-plane') {
    const source = record(value, path, ['kind', 'component', 'plane'])
    if (!['XY', 'XZ', 'YZ'].includes(source.plane as string)) fail(path + '.plane', 'plano principal desconocido')
    return { kind, component: source.component === null ? null : componentReference(source.component, path + '.component'), plane: source.plane as Plane }
  }
  if (kind !== 'face' && kind !== 'edge') fail(path + '.kind', 'tipo de referencia desconocido')
  const locator = kind === 'face' ? 'face' : 'edge', source = record(value, path, ['kind', 'component', 'body', locator, 'support'])
  if (kind === 'face' ? source.support !== 'plane' && source.support !== 'axis' : source.support !== 'line') fail(path + '.support', 'soporte geométrico desconocido')
  const topology = record(source[locator], path + '.' + locator, ['sourceFeatureId', 'key'])
  const key = text(topology.key, path + '.' + locator + '.key', 4096)
  if (/[\x00-\x1f\x7f]/.test(key)) fail(path + '.' + locator + '.key', 'clave con caracteres de control')
  let body: BodyReference | null = null
  if (source.body !== null) {
    const raw = record(source.body, path + '.body', ['bodyId', 'sourceFeatureId'])
    body = { bodyId: identifier(raw.bodyId, path + '.body.bodyId'), sourceFeatureId: identifier(raw.sourceFeatureId, path + '.body.sourceFeatureId') }
  }
  const common = { component: componentReference(source.component, path + '.component'), body }
  const reference = { sourceFeatureId: identifier(topology.sourceFeatureId, path + '.' + locator + '.sourceFeatureId'), key }
  return kind === 'edge' ? { ...common, kind, edge: reference, support: 'line' }
    : { ...common, kind, face: reference, support: source.support as 'plane' | 'axis' }
}
/** Standalone selection boundary; syntax only, never native authority. */
export function validateAssemblyGeometryReference(value: unknown): AssemblyGeometryReference {
  checkJsonData(value)
  return geometryReference(value, 'Referencia de ensamblaje')
}
/** Syntax and exact source scope only; no current native topology authority. */
export function validateAssemblyVertexReference(value: unknown): AssemblyVertexReference {
  checkJsonData(value)
  const source = record(value, 'Referencia de vértice', ['kind', 'component', 'body', 'vertex', 'support'])
  if (source.kind !== 'vertex' || source.support !== 'point') fail('Referencia de vértice', 'propósito no válido')
  const raw = source.body === null ? null : record(source.body, 'Referencia de vértice.body', ['bodyId', 'sourceFeatureId'])
  const body = raw === null ? null : { bodyId: identifier(raw.bodyId, 'bodyId'), sourceFeatureId: identifier(raw.sourceFeatureId, 'sourceFeatureId') }
  const vertex = validateVertexReference(source.vertex)
  if (body !== null && body.sourceFeatureId !== vertex.sourceFeatureId) fail('Referencia de vértice', 'el origen del vértice y cuerpo debe coincidir')
  return { kind: 'vertex', component: componentReference(source.component, 'Referencia de vértice.component'), body, vertex, support: 'point' }
}
function planeReference(value: unknown, path: string): AssemblyPlaneReference {
  const reference = geometryReference(value, path)
  if (reference.kind === 'principal-plane') return reference
  if (reference.kind !== 'face' || reference.support !== 'plane') fail(path, 'la relación requiere un plano')
  return { ...reference, support: 'plane' }
}
export function validateAssemblyPlaneReference(value: unknown): AssemblyPlaneReference {
  checkJsonData(value)
  return planeReference(value, 'planeReference')
}
function axisReference(value: unknown, path: string): AssemblyAxisReference {
  const reference = geometryReference(value, path)
  if (reference.kind !== 'face' || reference.support !== 'axis') fail(path, 'la relación requiere un eje de cara')
  return { ...reference, support: 'axis' }
}
function cylinderSurfaceReference(value: unknown, path: string): AssemblyCylinderSurfaceReference {
  const source = record(value, path, ['kind', 'component', 'body', 'face', 'support'])
  if (source.kind !== 'face' || source.support !== 'cylinder-surface') fail(path, 'la tangencia requiere una superficie cilíndrica explícita')
  // Reuse only locator syntax. The original geometry parser never admits this
  // new purpose, so angle/direction/axis families cannot inherit it accidentally.
  const reference = axisReference({ ...source, support: 'axis' }, path)
  return { ...reference, support: 'cylinder-surface' }
}
function tangentReference(value: unknown, path: string): AssemblyTangentReference {
  return value && typeof value === 'object' && (value as Record<string, unknown>).support === 'cylinder-surface'
    ? cylinderSurfaceReference(value, path) : planeReference(value, path)
}
function sphereSurfaceReference(value: unknown, path: string): AssemblySphereSurfaceReference {
  const source = record(value, path, ['kind', 'component', 'body', 'face', 'support'])
  if (source.kind !== 'face' || source.support !== 'sphere-surface') fail(path, 'la tangencia requiere una superficie esférica explícita')
  const reference = axisReference({ ...source, support: 'axis' }, path)
  return { ...reference, support: 'sphere-surface' }
}
function sphereTangentReference(value: unknown, path: string): AssemblySphereTangentReference {
  return value && typeof value === 'object' && (value as Record<string, unknown>).support === 'sphere-surface'
    ? sphereSurfaceReference(value, path) : tangentReference(value, path)
}
export function validateAssemblySphereSurfaceReference(value: unknown): AssemblySphereSurfaceReference {
  checkJsonData(value)
  return sphereSurfaceReference(value, 'Superficie esférica del ensamblaje')
}
export function validateAssemblySphereTangentReference(value: unknown): AssemblySphereTangentReference {
  checkJsonData(value)
  return sphereTangentReference(value, 'Referencia de tangencia esférica del ensamblaje')
}
/** Syntax-only surface selection; current native surface purpose is checked by CAD. */
export function validateAssemblyCylinderSurfaceReference(value: unknown): AssemblyCylinderSurfaceReference {
  checkJsonData(value)
  return cylinderSurfaceReference(value, 'Superficie cilíndrica del ensamblaje')
}
export function validateAssemblyTangentReference(value: unknown): AssemblyTangentReference {
  checkJsonData(value)
  return tangentReference(value, 'Referencia de tangencia del ensamblaje')
}
function rackReference(value: unknown, path: string): AssemblyRackReference {
  const reference = geometryReference(value, path)
  if (reference.kind === 'edge') return reference
  if (reference.kind !== 'face' || reference.support !== 'axis') fail(path, 'la cremallera requiere una arista lineal o un eje cilíndrico')
  return { ...reference, support: 'axis' }
}
function alignment(value: unknown, path: string): 'aligned' | 'opposed' {
  if (value !== 'aligned' && value !== 'opposed') fail(path, 'alineación desconocida')
  return value
}
function mate(value: unknown, path: string): AssemblyMate {
  if (!value || typeof value !== 'object') fail(path, 'relación no válida')
  const descriptor = Object.getOwnPropertyDescriptor(value, 'type')
  if (!descriptor?.enumerable || !('value' in descriptor)) fail(path, 'tipo de relación debe ser un campo de datos')
  const type = descriptor.value
  if (type === 'hinge') {
    const hasStops = Object.hasOwn(value, 'stops')
    const source = record(value, path, ['id', 'name', 'suppressed', 'type', 'axis', 'axial', 'alignment', ...(hasStops ? ['stops'] : [])])
    const references = { axis: source.axis, axial: source.axial, alignment: source.alignment }
    const request = hasStops ? validateAssemblyLimitedHingeReferenceRequest({ ...references, stops: source.stops })
      : validateAssemblyHingeReferenceRequest(references)
    return { id: identifier(source.id, path + '.id'), name: text(source.name, path + '.name'),
      suppressed: boolean(source.suppressed, path + '.suppressed'), type, ...request }
  }
  if (type === 'circular-path') {
    const source = record(value, path, ['id', 'name', 'suppressed', 'type', 'point', 'path', 'position', 'orientation'])
    const request = validateAssemblyCircularPathReferenceRequest({ point: source.point, path: source.path, position: source.position, orientation: source.orientation })
    return { id: identifier(source.id, path + '.id'), name: text(source.name, path + '.name'), suppressed: boolean(source.suppressed, path + '.suppressed'), type, ...request }
  }
  if (type === 'line-path') {
    const source = record(value, path, ['id', 'name', 'suppressed', 'type', 'point', 'path', 'position', 'orientation'])
    const request = validateAssemblyLinePathMateRequest({ point: source.point, path: source.path, position: source.position, orientation: source.orientation })
    return { id: identifier(source.id, path + '.id'), name: text(source.name, path + '.name'), suppressed: boolean(source.suppressed, path + '.suppressed'), type, ...request }
  }
  if (type === 'profile-center') {
    const source = record(value, path, ['id', 'name', 'suppressed', 'type', 'first', 'second', 'alignment', 'offsetMm', 'orientation'])
    // Cross-module validators are function declarations with no eager reads of
    // this module; their shared syntax validation runs only after initialization.
    const references = validateAssemblyProfileCenterReferenceRequest({ first: source.first, second: source.second,
      alignment: source.alignment, offsetMm: source.offsetMm, orientation: source.orientation })
    return { id: identifier(source.id, path + '.id'), name: text(source.name, path + '.name'),
      suppressed: boolean(source.suppressed, path + '.suppressed'), type, ...references }
  }
  if (type === 'symmetry') {
    const source = record(value, path, ['id', 'name', 'suppressed', 'type', 'entityKind', 'source', 'target', 'mirror', 'alignment'])
    // Both modules export function declarations and perform no cross-module
    // initialization. Reference validation is invoked only after module loading.
    const references = validateAssemblySymmetryReferenceSet({ entityKind: source.entityKind, source: source.source,
      target: source.target, mirror: source.mirror, alignment: source.alignment })
    return { id: identifier(source.id, path + '.id'), name: text(source.name, path + '.name'),
      suppressed: boolean(source.suppressed, path + '.suppressed'), type: 'symmetry', ...references }
  }
  if (type === 'width') {
    const source = record(value, path, ['id', 'name', 'suppressed', 'type', 'mode', 'width', 'tab', 'widthBranch', 'tabBranch', 'alignment'])
    if (source.mode !== 'centered') fail(path + '.mode', 'se requiere el modo centered explícito')
    const branch = (input: unknown, at: string): PlaneBisectorBranch => {
      if (input !== 'sum' && input !== 'difference') fail(at, 'se requiere una rama sum o difference explícita')
      return input
    }
    const pair = (input: unknown, at: string): [AssemblyPlaneReference, AssemblyPlaneReference] => {
      const values = list(input, at, 2, 2)
      return [planeReference(values[0], at + '[0]'), planeReference(values[1], at + '[1]')]
    }
    return { id: identifier(source.id, path + '.id'), name: text(source.name, path + '.name'), suppressed: boolean(source.suppressed, path + '.suppressed'),
      type, mode: 'centered', width: pair(source.width, path + '.width'), tab: pair(source.tab, path + '.tab'),
      widthBranch: branch(source.widthBranch, path + '.widthBranch'), tabBranch: branch(source.tabBranch, path + '.tabBranch'),
      alignment: alignment(source.alignment, path + '.alignment') }
  }
  const extra = type === 'concentric' ? ['alignment', 'rotationLock']
    : type === 'coincident' ? ['alignment'] : type === 'distance' ? ['alignment', 'distance'] : type === 'limit-distance' ? ['alignment', 'limits']
      : type === 'limit-directed-angle' ? ['coordinate', 'guide', 'arc'] : type === 'limit-angle' ? ['coordinate', 'limits'] : type === 'angle' ? ['angle'] : type === 'parallel' || type === 'perpendicular' ? ['alignment'] : type === 'tangent' || type === 'plane-sphere-tangent' ? ['side']
        : type === 'skew-cylinder-tangent' || type === 'parallel-cylinder-tangent' || type === 'sphere-sphere-tangent' || type === 'cylinder-sphere-tangent' ? ['branch'] : type === 'lock' ? ['relativePose']
        : type === 'gear' ? ['carrier', 'ratio', 'direction', 'neutralRotations', 'angles', 'phase']
          : type === 'screw' ? ['lead', 'reverse', 'alignment', 'neutralRotation', 'angle', 'neutralTravel']
            : type === 'rack-pinion' ? ['conversion', 'reverse', 'neutralRotation', 'angle', 'neutralTravel'] : []
  const source = record(value, path, ['id', 'name', 'suppressed', 'type', 'first', 'second', ...extra])
  const common = { id: identifier(source.id, path + '.id'), name: text(source.name, path + '.name'), suppressed: boolean(source.suppressed, path + '.suppressed') }
  if (type === 'limit-directed-angle') {
    if (source.coordinate !== 'directed-about-axis') fail(path + '.coordinate', 'el tope circular requiere la coordenada directed-about-axis explícita')
    return { ...common, type, coordinate: source.coordinate, first: geometryReference(source.first, path + '.first'),
      second: geometryReference(source.second, path + '.second'), guide: geometryReference(source.guide, path + '.guide'), arc: validateAssemblyDirectedAngleArc(source.arc) }
  }
  if (type === 'limit-angle') {
    if (source.coordinate !== 'principal-direction') fail(path + '.coordinate', 'el límite requiere la coordenada principal-direction explícita')
    return { ...common, type, coordinate: source.coordinate, first: geometryReference(source.first, path + '.first'),
      second: geometryReference(source.second, path + '.second'), limits: validateAssemblyLimitAngleLimits(source.limits) }
  }
  if (type === 'sphere-sphere-tangent') return { ...common, type,
    first: sphereSurfaceReference(source.first, path + '.first'), second: sphereSurfaceReference(source.second, path + '.second'),
    branch: validateAssemblySphereTangentBranch(source.branch) }
  if (type === 'plane-sphere-tangent' || type === 'cylinder-sphere-tangent') {
    const first = sphereTangentReference(source.first, path + '.first'), second = sphereTangentReference(source.second, path + '.second')
    const sphere = (ref: AssemblySphereTangentReference): ref is AssemblySphereSurfaceReference => ref.kind === 'face' && ref.support === 'sphere-surface'
    const plane = (ref: AssemblySphereTangentReference): ref is AssemblyPlaneReference => ref.kind === 'principal-plane' || ref.support === 'plane'
    const cylinder = (ref: AssemblySphereTangentReference): ref is AssemblyCylinderSurfaceReference => ref.kind === 'face' && ref.support === 'cylinder-surface'
    if (type === 'plane-sphere-tangent') {
      assemblyTangentSideSign(source.side as AssemblyTangentSide)
      const side = source.side as AssemblyTangentSide
      if (plane(first) && sphere(second)) return { ...common, type, first, second, side }
      if (sphere(first) && plane(second)) return { ...common, type, first, second, side }
      fail(path, 'la tangencia requiere un plano y una superficie esférica')
    }
    const branch = validateAssemblySphereTangentBranch(source.branch)
    if (cylinder(first) && sphere(second)) return { ...common, type, first, second, branch }
    if (sphere(first) && cylinder(second)) return { ...common, type, first, second, branch }
    fail(path, 'la tangencia requiere una superficie cilíndrica y una esférica')
  }
  if (type === 'skew-cylinder-tangent' || type === 'parallel-cylinder-tangent') return { ...common, type,
    first: cylinderSurfaceReference(source.first, path + '.first'), second: cylinderSurfaceReference(source.second, path + '.second'),
    branch: validateAssemblyCylinderTangentBranch(source.branch) }
  if (type === 'tangent') {
    const first = tangentReference(source.first, path + '.first'), second = tangentReference(source.second, path + '.second')
    const surface = (reference: AssemblyTangentReference) => reference.kind === 'face' && reference.support === 'cylinder-surface'
    if (surface(first) === surface(second)) fail(path, 'la tangencia requiere un plano y una superficie cilíndrica')
    assemblyTangentSideSign(source.side as AssemblyTangentSide)
    return { ...common, type, first, second, side: source.side as AssemblyTangentSide }
  }
  if (type === 'parallel' || type === 'perpendicular') {
    const first = geometryReference(source.first, path + '.first'), second = geometryReference(source.second, path + '.second')
    assemblyDirectionMateAngle(type, assemblyDirectionReferenceKind(first), assemblyDirectionReferenceKind(second), source.alignment)
    return { ...common, type, first, second, alignment: source.alignment as AssemblyDirectionAlignment }
  }
  if (type === 'rack-pinion') return { ...common, type, first: axisReference(source.first, path + '.first'), second: rackReference(source.second, path + '.second'),
    ...validateAssemblyRackPinionData({ conversion: source.conversion, reverse: source.reverse,
      neutralRotation: source.neutralRotation, angle: source.angle, neutralTravel: source.neutralTravel }) }
  if (type === 'screw') return { ...common, type, first: axisReference(source.first, path + '.first'), second: axisReference(source.second, path + '.second'),
    ...validateAssemblyScrewData({ lead: source.lead, reverse: source.reverse, alignment: source.alignment,
      neutralRotation: source.neutralRotation, angle: source.angle, neutralTravel: source.neutralTravel }) }
  if (type === 'gear') return { ...common, type, first: axisReference(source.first, path + '.first'), second: axisReference(source.second, path + '.second'),
    carrier: source.carrier === null ? null : componentReference(source.carrier, path + '.carrier'),
    ...validateAssemblyGearData({ ratio: source.ratio, direction: source.direction, neutralRotations: source.neutralRotations, angles: source.angles, phase: source.phase }) }
  if (type === 'lock') return { ...common, type, first: componentReference(source.first, path + '.first'),
    second: componentReference(source.second, path + '.second'), relativePose: validateRigidPose(source.relativePose, path + '.relativePose') }
  if (type === 'concentric') {
    const concentric = (value: unknown, endpointPath: string): AssemblyConcentricReference => {
      const ref = geometryReference(value, endpointPath)
      return ref.kind === 'principal-axis' ? ref : axisReference(value, endpointPath)
    }
    const first = concentric(source.first, path + '.first'), second = concentric(source.second, path + '.second')
    return { ...common, type, first, second, alignment: alignment(source.alignment, path + '.alignment'),
      rotationLock: source.rotationLock === null ? null : validateRigidPose({ translation: [0, 0, 0], rotation: source.rotationLock }, path + '.rotationLock').rotation }
  }
  if (type === 'limit-distance') return { ...common, type, first: planeReference(source.first, path + '.first'), second: planeReference(source.second, path + '.second'),
    alignment: alignment(source.alignment, path + '.alignment'), limits: validateAssemblyLimitDistanceLimits(source.limits) }
  if (type === 'coincident' || type === 'distance') {
    const planes = { ...common, first: planeReference(source.first, path + '.first'), second: planeReference(source.second, path + '.second'),
      alignment: alignment(source.alignment, path + '.alignment') }
    return type === 'coincident' ? { ...planes, type } : { ...planes, type, distance: finite(source.distance, path + '.distance') }
  }
  if (type === 'angle') {
    const angle = finite(source.angle, path + '.angle')
    if (angle < 0 || angle > 180) fail(path + '.angle', 'el ángulo debe estar entre 0 y 180 grados')
    return { ...common, type, first: geometryReference(source.first, path + '.first'), second: geometryReference(source.second, path + '.second'), angle }
  }
  return fail(path + '.type', 'familia de relación no declarada')
}
/** Syntax-only mate copy; this does not authenticate current native supports. */
export function validateAssemblyMate(value: unknown): AssemblyMate {
  checkJsonData(value)
  return mate(value, 'Relación del ensamblaje')
}
interface Budget { occurrences: number; mates: number; features: number }
function unique<T extends { id: string }>(values: T[], path: string): T[] {
  const ids = new Set<string>()
  values.forEach((value, index) => {
    if (ids.has(value.id)) fail(path + '[' + index + '].id', 'identificador local duplicado')
    ids.add(value.id)
  })
  return values
}
function nodeContents(source: Record<string, unknown>, path: string, budget: Budget) {
  const rawOccurrences = list(source.occurrences, path + '.occurrences', MAX_ASSEMBLY_OCCURRENCES)
  const rawMates = list(source.mates, path + '.mates', MAX_ASSEMBLY_MATES)
  budget.occurrences += rawOccurrences.length; budget.mates += rawMates.length
  if (budget.occurrences > MAX_ASSEMBLY_OCCURRENCES || budget.mates > MAX_ASSEMBLY_MATES) fail(path, 'se supera el presupuesto de declaraciones del ensamblaje')
  const occurrences = unique(rawOccurrences.map((value, index): AssemblyOccurrence => {
    const location = path + '.occurrences[' + index + ']'
    const item = record(value, location, ['id', 'name', 'definition', 'pose', 'fixed', 'suppressed', 'visible'])
    return { id: identifier(item.id, location + '.id'), name: text(item.name, location + '.name'),
      definition: definitionReference(item.definition, location + '.definition'), pose: validateRigidPose(item.pose, location + '.pose'),
      fixed: boolean(item.fixed, location + '.fixed'), suppressed: boolean(item.suppressed, location + '.suppressed'),
      visible: boolean(item.visible, location + '.visible') }
  }), path + '.occurrences')
  return { occurrences, mates: unique(rawMates.map((value, index) => mate(value, path + '.mates[' + index + ']')), path + '.mates') }
}
function definition(value: unknown, path: string, budget: Budget): AssemblyDefinition {
  if (!value || typeof value !== 'object') fail(path, 'definición no válida')
  const kind = (value as Record<string, unknown>).kind
  if (kind === 'part') {
    const source = record(value, path, ['kind', 'id', 'revision', 'document', ...(Object.hasOwn(value, 'sourceLink') ? ['sourceLink'] : [])])
    const document = source.document as Record<string, unknown> | null
    if (!document || typeof document !== 'object') fail(path + '.document', 'documento de pieza obligatorio')
    budget.features += list(document.features, path + '.document.features', 2000).length
    if (budget.features > MAX_ASSEMBLY_PART_FEATURES) fail(path, 'se supera el presupuesto de operaciones de pieza')
    const parsed = validateDocument(document), id = identifier(source.id, path + '.id')
    if (parsed.id !== id) fail(path + '.id', 'la identidad debe coincidir con el documento de pieza')
    return { kind, id, revision: identifier(source.revision, path + '.revision'), document: parsed, ...(Object.hasOwn(source, 'sourceLink') ? { sourceLink: validateAssemblySourceLink(source.sourceLink) } : {}) }
  }
  if (kind !== 'assembly') fail(path + '.kind', 'tipo de definición desconocido')
  const source = record(value, path, ['kind', 'id', 'revision', 'name', 'occurrences', 'mates', 'createdAt', 'updatedAt', ...(Object.hasOwn(value, 'sourceLink') ? ['sourceLink'] : [])])
  return { kind, ...metadata(source, path), ...nodeContents(source, path, budget), ...(Object.hasOwn(source, 'sourceLink') ? { sourceLink: validateAssemblySourceLink(source.sourceLink) } : {}) }
}

function registry(document: AssemblyDocument): Map<string, AssemblyDefinition> {
  const result = new Map<string, AssemblyDefinition>(), kinds = new Map<string, string>()
  for (const definition of [document, ...document.definitions]) {
    const key = assemblyDefinitionKey(definition)
    if (result.has(key)) fail('Ensamblaje.definitions', 'revisión de definición duplicada')
    if (kinds.has(definition.id) && kinds.get(definition.id) !== definition.kind) fail('Ensamblaje.definitions', 'una identidad no puede ser pieza y ensamblaje')
    result.set(key, definition); kinds.set(definition.id, definition.kind)
  }
  return result
}
function checkDefinitionGraph(document: AssemblyDocument): void {
  const definitions = registry(document), active = new Set<string>(), memo = new Map<string, { count: number; depth: number; mates: number }>()
  function visit(key: string, stackDepth: number): { count: number; depth: number; mates: number } {
    if (stackDepth > MAX_ASSEMBLY_DEPTH + 1) fail('Ensamblaje', 'jerarquía demasiado profunda')
    if (active.has(key)) fail('Ensamblaje', 'ciclo de definiciones de ensamblaje')
    const cached = memo.get(key)
    if (cached) return cached
    const node = definitions.get(key)
    if (!node) fail('Ensamblaje', 'revisión de definición no encontrada')
    let count = 0, depth = 0, mates = node.kind === 'assembly' ? node.mates.length : 0
    active.add(key)
    if (node.kind === 'assembly') for (const occurrence of node.occurrences) {
      const child = visit(assemblyDefinitionKey(occurrence.definition), stackDepth + 1)
      count += 1 + child.count; depth = Math.max(depth, 1 + child.depth); mates += child.mates
      if (count > MAX_ASSEMBLY_OCCURRENCES || depth > MAX_ASSEMBLY_DEPTH || mates > MAX_ASSEMBLY_MATES) fail('Ensamblaje', 'se supera el presupuesto de jerarquía expandida')
    }
    active.delete(key)
    const result = { count, depth, mates }; memo.set(key, result); return result
  }
  // Validate dormant definitions too; suppression cannot hide cycles or bombs.
  for (const key of definitions.keys()) visit(key, 0)
}

/** Syntax/graph authority only. It neither builds solids nor solves mates. */
function checkedAssemblyDocument(value: unknown): AssemblyDocument {
  const source = record(value, 'Ensamblaje', ['version', 'kind', 'id', 'revision', 'name', 'units', 'definitions',
    'occurrences', 'mates', 'createdAt', 'updatedAt'])
  if (source.version !== ASSEMBLY_DOCUMENT_VERSION || source.kind !== 'assembly') fail('Ensamblaje.version', 'formato de ensamblaje no compatible')
  if (source.units !== 'mm') fail('Ensamblaje.units', 'solo se admiten milímetros')
  const budget: Budget = { occurrences: 0, mates: 0, features: 0 }
  const definitions = list(source.definitions, 'Ensamblaje.definitions', MAX_ASSEMBLY_DEFINITIONS)
    .map((value, index) => definition(value, 'Ensamblaje.definitions[' + index + ']', budget))
  const result: AssemblyDocument = { version: 2, kind: 'assembly', units: 'mm', ...metadata(source, 'Ensamblaje'),
    definitions, ...nodeContents(source, 'Ensamblaje', budget) }
  checkDefinitionGraph(result)
  return result
}
export function validateAssemblyDocument(value: unknown): AssemblyDocument {
  checkJsonData(value)
  return checkedAssemblyDocument(value)
}
export function createAssemblyDocument(name = 'Ensamblaje sin título'): AssemblyDocument {
  const now = new Date().toISOString()
  return validateAssemblyDocument({ version: 2, kind: 'assembly', units: 'mm', id: crypto.randomUUID(), revision: crypto.randomUUID(),
    name, definitions: [], occurrences: [], mates: [], createdAt: now, updatedAt: now })
}
function parseJson(json: string): unknown {
  if (typeof json !== 'string' || new TextEncoder().encode(json).byteLength > MAX_ASSEMBLY_BYTES) fail('Documento', 'el documento supera los 20 MB admitidos')
  try { return JSON.parse(json) } catch { return fail('Documento', 'el archivo no contiene JSON válido') }
}
export function parseAssemblyDocument(json: string): AssemblyDocument { return validateAssemblyDocument(parseJson(json)) }
function boundedSerialization(value: object): string {
  const json = JSON.stringify(value, null, 2)
  if (new TextEncoder().encode(json).byteLength > MAX_ASSEMBLY_BYTES) fail('Documento', 'el documento serializado supera los 20 MB admitidos')
  return json
}
export function serializeAssemblyDocument(document: AssemblyDocument): string { return boundedSerialization(validateAssemblyDocument(document)) }
export function validateCadDocument(value: unknown): CadDocument {
  // Dispatch only after rejecting executable object fields. The existing v1
  // part parser remains unchanged; the new union boundary accepts JSON data.
  checkJsonData(value)
  return value && typeof value === 'object' && (value as Record<string, unknown>).version === 2
    ? checkedAssemblyDocument(value) : validateDocument(value)
}
export function parseCadDocument(json: string): CadDocument { return validateCadDocument(parseJson(json)) }
export function serializeCadDocument(document: CadDocument): string {
  return boundedSerialization(validateCadDocument(document))
}

/** Declared placements, not solved/native/currentness evidence. */
export function expandAssemblyParts(input: AssemblyDocument, includeSuppressed = false): ExpandedPartOccurrence[] {
  const document = validateAssemblyDocument(input), definitions = registry(document), result: ExpandedPartOccurrence[] = []
  function walk(node: AssemblyNode, path: string[], worldPose: RigidPose, chain: AssemblyOccurrence[], suppressed: boolean, visible: boolean): void {
    for (const occurrence of node.occurrences) {
      const nextSuppressed = suppressed || occurrence.suppressed
      if (nextSuppressed && !includeSuppressed) continue
      const nextPath = [...path, occurrence.id], nextPose = composeRigidPoses(worldPose, occurrence.pose)
      const nextChain = [...chain, occurrence], nextVisible = visible && occurrence.visible
      const definition = definitions.get(assemblyDefinitionKey(occurrence.definition))!
      if (definition.kind === 'part') result.push({ path: nextPath, definition, occurrence, chain: nextChain,
        worldPose: nextPose, suppressed: nextSuppressed, visible: nextVisible })
      else walk(definition, nextPath, nextPose, nextChain, nextSuppressed, nextVisible)
    }
  }
  walk(document, [], identityRigidPose(), [], false, true)
  return result
}
