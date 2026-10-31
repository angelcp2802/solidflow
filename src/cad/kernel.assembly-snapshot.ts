import { resolveAssemblyLimitedHingeReferences, type AssemblyResolvedLimitedHingeReferences } from './kernel.assembly-hinge-limits'
import { resolveAssemblyHingeReferences } from './kernel.assembly-hinge'
import type { AssemblyHingeMate } from '../model/assemblyDocument'
import { isAssemblyHingeMateInspection } from '../model/assemblyReferences'
import { validateAssemblyLinePathSelection, type AssemblyLinePathSelection } from '../model/assemblyLinePathReferences'
import type { AssemblyLinePathCurve } from './kernel.assembly-line-path'
import { validateAssemblyArcPathSelection, type AssemblyArcPathSelection } from '../model/assemblyArcPathReferences'
import type { AssemblyArcPathCurve, AssemblyArcPathEvaluation } from './kernel.assembly-arc-path'
import { CadEngine, type AssemblyPresentationBody, type AssemblyPartInspection } from './kernel.engine'
import { principalPlaneFrame } from './kernel.frames'
import { isNativeCleanupFailure, NativeCleanupError, NativeOwners, withNativeOwners } from './kernel.native-ownership'
import type { AssemblyNativeSupport, AssemblyNativeCylinderSurfaceSupport, AssemblyNativeSphereSurfaceSupport, AssemblyNativePointSupport } from './kernel.assembly-supports'
import type { BodyReference, FaceReference, VertexReference } from './kernel.types'
import { assemblyDefinitionKey, assemblyOccurrencePathKey, expandAssemblyParts, validateAssemblyDocument,
  validateAssemblyGeometryReference, validateAssemblyCylinderSurfaceReference, validateAssemblySphereSurfaceReference, validateAssemblyVertexReference, type AssemblyVertexReference, type AssemblyCylinderSurfaceReference, type AssemblySphereSurfaceReference, type AssemblyComponentReference, type AssemblyDefinition,
  type AssemblyDefinitionReference, type AssemblyDocument, type AssemblyGeometryReference, type AssemblyMate, type AssemblyBinaryMate, type AssemblyWidthCenteredMate, type AssemblySymmetryMate, type AssemblyProfileCenterMate,
  type AssemblyOccurrence, type AssemblyLinePathMate, type AssemblyCircularPathMate } from '../model/assemblyDocument'
import { inspectAssemblyMateReferences, isAssemblyCircularPathMateInspection, isAssemblyLinePathMateInspection, isAssemblyWidthMateInspection, isAssemblySymmetryMateInspection, isAssemblyBinaryMateInspection, isAssemblyProfileCenterMateInspection } from '../model/assemblyReferences'
import { composeRigidPoses, identityRigidPose, transformRigidDirection, transformRigidPoint, type RigidPose } from '../model/rigidPose'
import { assemblyTangentAxisPoint } from '../model/assemblyTangentMates'
import type { AssemblyNativeProfileSupport, AssemblyNativeRectangleAxisSupport } from './kernel.assembly-profile-supports'
import type { AssemblyPathCurveObservation, AssemblyPathCurveEvaluation, AssemblyPathCurveCoordinate, AssemblyPathCurveBands } from './kernel.assembly-path-curves'
import { AssemblyPathCurvePrecisionError } from './kernel.assembly-path-curves'
import { validateAssemblyPathCurveSelection, validateAssemblyPathCoordinate, validateAssemblyPathBands, type AssemblyPathCurveSelection } from '../model/assemblyPathReferences'
import { validateAssemblyProfileFaceSelection, validateAssemblyProfileAxisSelection, type AssemblyProfileAxisSelection } from '../model/assemblyProfileReferences'

export type AssemblyReadonly<T> = T extends object ? { readonly [K in keyof T]: AssemblyReadonly<T[K]> } : T
interface EndpointBase {
  componentPath: string[]
  definition: AssemblyDefinitionReference
  /** Initial declared placement, not a mate-solver output. */
  declaredWorldPose: RigidPose
}
type EndpointData = EndpointBase & (
  | { kind: 'component'; origin: 'component' }
  | { kind: 'support'; origin: 'native-face' | 'native-edge' | 'principal-plane' | 'principal-axis'; localSupport: AssemblyNativeSupport; worldSupport: AssemblyNativeSupport }
  | { kind: 'cylinder-surface'; origin: 'native-cylinder-surface'; localSupport: AssemblyNativeCylinderSurfaceSupport; worldSupport: AssemblyNativeCylinderSurfaceSupport }
  | { kind: 'sphere-surface'; origin: 'native-sphere-surface'; localSupport: AssemblyNativeSphereSurfaceSupport; worldSupport: AssemblyNativeSphereSurfaceSupport }
)
export type AssemblyEndpointWitness = AssemblyReadonly<EndpointData>
/** Separate point-purpose authority; it cannot be consumed as an old mate axis. */
export type AssemblyPointWitness = AssemblyReadonly<EndpointBase & { kind: 'point'; origin: 'native-vertex';
  localSupport: AssemblyNativePointSupport; worldSupport: AssemblyNativePointSupport }>
/** Bounded-profile authority stays separate from all saved mate purposes. */
export type AssemblyProfileWitness = AssemblyReadonly<EndpointBase & { kind: 'profile'; origin: 'native-profile-face';
  localSupport: AssemblyNativeProfileSupport; worldSupport: AssemblyNativeProfileSupport }>
/** Material boundary direction has its own live purpose; no old LINE or face
 * witness can substitute for the joint native incidence query. */
export type AssemblyProfileAxisWitness = AssemblyReadonly<EndpointBase & { kind: 'profile-axis'; origin: 'native-profile-boundary-edge';
  localSupport: AssemblyNativeRectangleAxisSupport; worldSupport: AssemblyNativeRectangleAxisSupport }>
/** Finite current-curve purpose. It cannot substitute for old LINE/mate proofs
 * or establish a persistent parameter origin after a producer rebuild. */
export type AssemblyPathCurveWitness = AssemblyReadonly<EndpointBase & { kind: 'path-curve'; origin: 'native-bounded-edge';
  localCurve: AssemblyPathCurveObservation; worldCurve: AssemblyPathCurveObservation }>
export type AssemblyPathCurveEvaluationWitness = AssemblyPathCurveWitness & AssemblyReadonly<{
  localEvaluation: AssemblyPathCurveEvaluation; worldEvaluation: AssemblyPathCurveEvaluation }>
export type AssemblyLinePathWitness = AssemblyReadonly<EndpointBase & { kind: 'line-path'; origin: 'native-line-material-endpoint'; localCurve: AssemblyLinePathCurve; worldCurve: AssemblyLinePathCurve }>
/** Open circular trim with an authenticated material endpoint. This proof
 * cannot substitute for a LINE, generic curve or saved mate capability. */
export type AssemblyArcPathWitness = AssemblyReadonly<EndpointBase & { kind: 'arc-path'; origin: 'native-circular-material-endpoint';
  localCurve: AssemblyArcPathCurve; worldCurve: AssemblyArcPathCurve }>
export type AssemblyArcPathEvaluationWitness = AssemblyArcPathWitness & AssemblyReadonly<{
  localEvaluation: AssemblyArcPathEvaluation; worldEvaluation: AssemblyArcPathEvaluation }>
export type AssemblyMateWitness = AssemblyEndpointWitness | AssemblyPointWitness
export interface ResolvedAssemblyBinaryMate {
  readonly scopePath: readonly string[]
  readonly mate: AssemblyReadonly<AssemblyBinaryMate>
  readonly first: AssemblyEndpointWitness
  readonly second: AssemblyEndpointWitness
  /** Gear carrier is witnessed too; null declarations resolve the scope frame. */
  readonly carrier?: AssemblyEndpointWitness
  /** Directed-angle guide is an independent direction, including its owner. */
  readonly guide?: AssemblyEndpointWitness
}
export interface ResolvedAssemblyHingeMate {
  readonly limited?: AssemblyResolvedLimitedHingeReferences
  readonly scopePath: readonly string[]
  readonly mate: AssemblyReadonly<AssemblyHingeMate>
  readonly axis: readonly [AssemblyEndpointWitness, AssemblyEndpointWitness]
  readonly axial: readonly [AssemblyEndpointWitness, AssemblyEndpointWitness]
}
export function isResolvedAssemblyHingeMate(value: ResolvedAssemblyMate): value is ResolvedAssemblyHingeMate { return value.mate.type === 'hinge' }
export interface ResolvedAssemblyWidthMate {
  readonly scopePath: readonly string[]
  readonly mate: AssemblyReadonly<AssemblyWidthCenteredMate>
  readonly width: readonly [AssemblyEndpointWitness, AssemblyEndpointWitness]
  readonly tab: readonly [AssemblyEndpointWitness, AssemblyEndpointWitness]
}
export interface ResolvedAssemblySymmetryMate {
  readonly scopePath: readonly string[]
  readonly mate: AssemblyReadonly<AssemblySymmetryMate>
  readonly source: AssemblyMateWitness
  readonly target: AssemblyMateWitness
  readonly mirror: AssemblyEndpointWitness
}
export interface ResolvedAssemblyProfileCenterMate {
  readonly scopePath: readonly string[]
  readonly mate: AssemblyReadonly<AssemblyProfileCenterMate>
  readonly first: AssemblyProfileWitness | AssemblyProfileAxisWitness
  readonly second: AssemblyProfileWitness | AssemblyProfileAxisWitness
}
export interface ResolvedAssemblyLinePathMate { readonly scopePath: readonly string[]; readonly mate: AssemblyReadonly<AssemblyLinePathMate>; readonly first: AssemblyPointWitness; readonly second: AssemblyLinePathWitness; readonly up?: AssemblyEndpointWitness }
export function isResolvedAssemblyLinePathMate(value:ResolvedAssemblyMate):value is ResolvedAssemblyLinePathMate {return value.mate.type==='line-path'}
export interface ResolvedAssemblyCircularPathMate { readonly scopePath: readonly string[]; readonly mate: AssemblyReadonly<AssemblyCircularPathMate>; readonly first: AssemblyPointWitness; readonly second: AssemblyArcPathWitness; readonly up?: AssemblyEndpointWitness }
export function isResolvedAssemblyCircularPathMate(value:ResolvedAssemblyMate):value is ResolvedAssemblyCircularPathMate {return value.mate.type==='circular-path'}
export type AssemblyProfileMateWitness = AssemblyProfileWitness | AssemblyProfileAxisWitness
export type AssemblyResolvedMateWitness = AssemblyMateWitness | AssemblyProfileMateWitness | AssemblyLinePathWitness | AssemblyArcPathWitness
export type ResolvedAssemblyMate = ResolvedAssemblyHingeMate | ResolvedAssemblyCircularPathMate | ResolvedAssemblyLinePathMate | ResolvedAssemblyBinaryMate | ResolvedAssemblyWidthMate | ResolvedAssemblySymmetryMate | ResolvedAssemblyProfileCenterMate
export function isResolvedAssemblyProfileCenterMate(value: ResolvedAssemblyMate): value is ResolvedAssemblyProfileCenterMate {
  return value.mate.type === 'profile-center'
}
export function isResolvedAssemblyWidthMate(value: ResolvedAssemblyMate): value is ResolvedAssemblyWidthMate {
  return value.mate.type === 'width'
}
export function isResolvedAssemblySymmetryMate(value: ResolvedAssemblyMate): value is ResolvedAssemblySymmetryMate {
  return value.mate.type === 'symmetry'
}
export function isResolvedAssemblyBinaryMate(value: ResolvedAssemblyMate): value is ResolvedAssemblyBinaryMate {
  switch (value.mate.type) {
    case 'concentric': case 'coincident': case 'distance': case 'limit-distance': case 'limit-angle':
    case 'limit-directed-angle': case 'angle': case 'parallel': case 'perpendicular': case 'tangent':
    case 'skew-cylinder-tangent': case 'parallel-cylinder-tangent': case 'plane-sphere-tangent':
    case 'sphere-sphere-tangent': case 'cylinder-sphere-tangent': case 'lock': case 'gear': case 'screw': case 'rack-pinion': return true
    default: return false
  }
}
/** Original resolved reference incidence. Each witness still needs its owning snapshot. */
export function resolvedAssemblyMateWitnesses(value: ResolvedAssemblyMate): AssemblyResolvedMateWitness[] {
  return isResolvedAssemblyHingeMate(value) ? [...value.axis, ...value.axial, ...(value.limited ? value.limited.stops.angular : [])] : isResolvedAssemblyCircularPathMate(value) || isResolvedAssemblyLinePathMate(value) ? [value.first,value.second,...(value.up?[value.up]:[])] : isResolvedAssemblyProfileCenterMate(value) ? [value.first, value.second] : isResolvedAssemblyWidthMate(value) ? [...value.width, ...value.tab]
    : isResolvedAssemblySymmetryMate(value) ? [value.source, value.target, value.mirror]
    : [value.first, value.second, ...(value.carrier ? [value.carrier] : []), ...(value.guide ? [value.guide] : [])]
}
export interface UnavailableAssemblyGear {
  readonly scopePath: readonly string[]
  readonly scope: AssemblyReadonly<AssemblyDefinitionReference>
  readonly mate: AssemblyReadonly<Extract<AssemblyMate, { type: 'gear' }>>
}
export interface UnavailableAssemblyScrew {
  readonly scopePath: readonly string[]
  readonly scope: AssemblyReadonly<AssemblyDefinitionReference>
  readonly mate: AssemblyReadonly<Extract<AssemblyMate, { type: 'screw' }>>
}
export interface UnavailableAssemblyRackPinion {
  readonly scopePath: readonly string[]
  readonly scope: AssemblyReadonly<AssemblyDefinitionReference>
  readonly mate: AssemblyReadonly<Extract<AssemblyMate, { type: 'rack-pinion' }>>
}
export interface AssemblyFaceSelection {
  component: AssemblyComponentReference
  body: BodyReference | null
  face: FaceReference
}
export interface AssemblyVertexSelection { component: AssemblyComponentReference; body: BodyReference | null; vertex: VertexReference }
const witnesses = new WeakMap<object, { owner: AssemblyGeometrySnapshot; placementSum: number; depth: number }>()
const pointWitnesses = new WeakMap<object, { owner: AssemblyGeometrySnapshot; placementSum: number; depth: number }>()
const profileWitnesses = new WeakMap<object, { owner: AssemblyGeometrySnapshot; placementSum: number; depth: number }>()
const profileAxisWitnesses = new WeakMap<object, { owner: AssemblyGeometrySnapshot; placementSum: number; depth: number }>()
const linePathWitnesses = new WeakMap<object, { owner: AssemblyGeometrySnapshot; placementSum: number; depth: number }>()
const arcPathWitnesses = new WeakMap<object, { owner: AssemblyGeometrySnapshot; placementSum: number; depth: number }>()
export function assemblyArcPathPlacementArithmetic(value: AssemblyArcPathWitness, input: AssemblyDocument): { placementSum: number; depth: number } {
  const proof = arcPathWitnesses.get(value)
  if (!proof) throw new Error('Material arc has no native placement proof.')
  proof.owner.assertArcPathWitness(value, input)
  return { placementSum: proof.placementSum, depth: proof.depth }
}
export function assemblyLinePathPlacementArithmetic(value: AssemblyLinePathWitness, input: AssemblyDocument): {placementSum:number;depth:number} {
  const proof=linePathWitnesses.get(value); if(!proof) throw new Error('Material line has no native placement proof.'); proof.owner.assertLinePathWitness(value,input); return {placementSum:proof.placementSum,depth:proof.depth}
}
const pathCurveWitnesses = new WeakMap<object, { owner: AssemblyGeometrySnapshot; placementSum: number; depth: number }>()
export function assemblyPathCurvePlacementArithmetic(value: AssemblyPathCurveWitness, input: AssemblyDocument): { placementSum: number; depth: number } {
  const proof = pathCurveWitnesses.get(value)
  if (!proof) throw new Error('El trayecto no tiene evidencia aritmética nativa.')
  proof.owner.assertPathCurveWitness(value, input)
  return { placementSum: proof.placementSum, depth: proof.depth }
}
export function assemblyProfileAxisPlacementArithmetic(value: AssemblyProfileAxisWitness, input: AssemblyDocument): { placementSum: number; depth: number } {
  const proof = profileAxisWitnesses.get(value)
  if (!proof) throw new Error('El eje de perfil no tiene evidencia aritmética nativa.')
  proof.owner.assertProfileAxisWitness(value, input)
  return { placementSum: proof.placementSum, depth: proof.depth }
}
export function assemblyProfilePlacementArithmetic(value: AssemblyProfileWitness, input: AssemblyDocument): { placementSum: number; depth: number } {
  const proof = profileWitnesses.get(value)
  if (!proof) throw new Error('El perfil no tiene evidencia aritmética nativa.')
  proof.owner.assertProfileWitness(value, input)
  return { placementSum: proof.placementSum, depth: proof.depth }
}
/** Original placement magnitudes, not a certificate of recovered world precision. */
export function assemblyPointPlacementArithmetic(value: AssemblyPointWitness, input: AssemblyDocument): { placementSum: number; depth: number } {
  const proof = pointWitnesses.get(value)
  if (!proof) throw new Error('El punto no tiene evidencia aritmética nativa.')
  proof.owner.assertPointWitness(value, input)
  return { placementSum: proof.placementSum, depth: proof.depth }
}
/** Private proof retains original chain magnitudes even if composing poses cancelled them. */
export function assemblyEndpointPlacementArithmetic(value: AssemblyEndpointWitness, input: AssemblyDocument): { placementSum: number; depth: number } {
  const proof = witnesses.get(value)
  if (!proof) throw new Error('La referencia no tiene evidencia aritmética nativa.')
  proof.owner.assertWitness(value, input)
  return { placementSum: proof.placementSum, depth: proof.depth }
}
function freeze<T>(value: T): AssemblyReadonly<T> {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value as AssemblyReadonly<T>
}
function worldSupport(local: AssemblyNativeSupport, pose: RigidPose): AssemblyNativeSupport {
  if (local.kind === 'line') return { ...local, point: transformRigidPoint(pose, local.point), axis: transformRigidDirection(pose, local.axis) }
  const common = { point: transformRigidPoint(pose, local.point), xDirection: transformRigidDirection(pose, local.xDirection), tolerance: local.tolerance }
  return local.kind === 'plane' ? { ...common, kind: 'plane', normal: transformRigidDirection(pose, local.normal) }
    : { ...common, kind: 'cylinder', axis: transformRigidDirection(pose, local.axis), radius: local.radius }
}
interface Placement { definition: AssemblyDefinition; pose: RigidPose; suppressed: boolean }
interface PartState {
  engine: CadEngine
  warnings: string[]
  selections: Omit<AssemblyFaceSelection, 'component'>[]
  vertexSelections: Omit<AssemblyVertexSelection, 'component'>[]
  bodyEntries: number
  faceReferences: number
  edgeReferences: number
  vertexReferences: number
}
export const MAX_ASSEMBLY_NATIVE_BODY_ENTRIES = 4096
export const MAX_ASSEMBLY_NATIVE_FACE_REFERENCES = 65_536
export const MAX_ASSEMBLY_NATIVE_EDGE_REFERENCES = 65_536
export const MAX_ASSEMBLY_NATIVE_VERTEX_REFERENCES = 65_536

function emptyPartState(): PartState {
  return { engine: new CadEngine(), warnings: [], selections: [], vertexSelections: [], bodyEntries: 0,
    faceReferences: 0, edgeReferences: 0, vertexReferences: 0 }
}
function rebuildPartState(state: PartState, definition: Extract<AssemblyDefinition, { kind: 'part' }>): void {
  const result = state.engine.rebuildForAssemblyReferences(definition.document.features)
  state.warnings = [...result.warnings]
  if (result.featureErrors.length) throw new Error('No se pudo reconstruir la pieza del ensamblaje: ' + result.featureErrors.map(value => value.message).join('; '))
  // Native geometry and catalogs; display vertices confer no body authority.
  state.bodyEntries = result.kind === 'explicit' ? result.bodies.length : result.kind === 'legacy' ? 1 : 0
  state.faceReferences = result.kind === 'explicit' ? result.bodies.reduce((total, body) => total + body.faces.length, 0) : result.kind === 'legacy' ? result.faces.length : 0
  state.edgeReferences = result.kind === 'explicit' ? result.bodies.reduce((total, body) => total + body.edges.length, 0) : result.kind === 'legacy' ? result.edges.length : 0
  state.vertexReferences = result.kind === 'explicit' ? result.bodies.reduce((total, body) => total + body.vertexRefs.length, 0) : result.kind === 'legacy' ? result.vertexRefs.length : 0
  state.selections = result.kind === 'explicit'
    ? result.bodies.flatMap(body => body.faces.map(face => ({ body: { ...body.ref }, face: { ...face } })))
    : result.kind === 'legacy' ? result.faces.map(face => ({ body: null, face: { ...face } })) : []
  state.vertexSelections = result.kind === 'explicit'
    ? result.bodies.flatMap(body => body.vertexRefs.map(vertex => ({ body: { ...body.ref }, vertex: { ...vertex } })))
    : result.kind === 'legacy' ? result.vertexRefs.map(vertex => ({ body: null, vertex: { ...vertex } })) : []
}

/** Internal owner of immutable local geometry, never placed witnesses or solve results. */
/** Only display data and guarded native reads/copies, never the mutable engine. */
export interface AssemblyScenePartSource {
  bodies: AssemblyPresentationBody[]
  warnings: string[]
  inspection: AssemblyPartInspection
}
export type AssemblyScenePartProvider = (definition: Extract<AssemblyDefinition, { kind: 'part' }>) => AssemblyScenePartSource | undefined

class AssemblyGeometryReusePool {
  #admitted = new Map<string, string>()
  #parts = new Map<string, PartState>()
  #owners = new NativeOwners()
  #alive = true
  #disposed = false
  #bodyEntries = 0
  #faceReferences = 0
  #edgeReferences = 0
  #vertexReferences = 0
  constructor(source: AssemblyDocument) {
    const document = validateAssemblyDocument(source)
    for (const definition of document.definitions) if (definition.kind === 'part') {
      this.#admitted.set(assemblyDefinitionKey(definition), JSON.stringify(definition))
    }
  }
  assertAlive(): void {
    if (!this.#alive) throw new Error('La reutilización nativa de ensamblaje ya no está vigente.')
  }
  invalidate(): void { this.#alive = false }
  borrow(definition: Extract<AssemblyDefinition, { kind: 'part' }>): PartState | undefined {
    this.assertAlive()
    const key = assemblyDefinitionKey(definition)
    // Same revision labels do not establish identical feature/source content.
    // Non-admitted content uses the snapshot's ordinary private reconstruction.
    if (this.#admitted.get(key) !== JSON.stringify(definition)) return undefined
    const existing = this.#parts.get(key)
    if (existing) return existing
    const state = emptyPartState()
    try {
      this.#owners.own({ delete: () => state.engine.dispose() })
      rebuildPartState(state, definition)
      if (this.#admitted.get(key) !== JSON.stringify(definition)) throw new Error('La pieza cambió durante su reconstrucción nativa compartida.')
      const bodies = this.#bodyEntries + state.bodyEntries, faces = this.#faceReferences + state.faceReferences,
        edges = this.#edgeReferences + state.edgeReferences, vertices = this.#vertexReferences + state.vertexReferences
      // A sequence of scoped snapshots must not accumulate an unbounded inventory.
      if (bodies > MAX_ASSEMBLY_NATIVE_BODY_ENTRIES || faces > MAX_ASSEMBLY_NATIVE_FACE_REFERENCES || edges > MAX_ASSEMBLY_NATIVE_EDGE_REFERENCES) {
        throw new Error('El ensamblaje supera el presupuesto de cuerpos, caras o aristas nativos.')
      }
      if (vertices > MAX_ASSEMBLY_NATIVE_VERTEX_REFERENCES) throw new Error('El ensamblaje supera el presupuesto de vértices nativos.')
      this.#bodyEntries = bodies; this.#faceReferences = faces; this.#edgeReferences = edges; this.#vertexReferences = vertices
      this.#parts.set(key, state)
      return state
    } catch (error) { this.invalidate(); throw error }
  }
  scenePart(definition: Extract<AssemblyDefinition, { kind: 'part' }>): AssemblyScenePartSource | undefined {
    const state = this.borrow(definition)
    if (!state) return undefined
    const signature = this.#admitted.get(assemblyDefinitionKey(definition))
    const inspection = state.engine.borrowCurrentAssemblyInspection(() => {
      this.assertAlive()
      if (JSON.stringify(definition) !== signature) { this.invalidate(); throw new Error('La pieza cambió durante su presentación compartida.') }
    }, () => this.invalidate())
    return { bodies: inspection.readCurrentAssemblyPresentation(), warnings: [...state.warnings], inspection }
  }
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true; this.invalidate(); this.#parts.clear(); this.#admitted.clear()
    this.#owners.releaseExcept(new Set())
    const errors = this.#owners.cleanupErrors()
    if (errors.length) throw new NativeCleanupError(undefined, errors, 'Assembly reusable geometry release failed.')
  }
}

/** Executes each callback with a fresh document-bound native witness session. */
export interface AssemblySnapshotRunner {
  <T>(document: AssemblyDocument, operation: (snapshot: AssemblyGeometrySnapshot) => T): T
}
/** One synchronous operation only: no geometry or authority survives in a cache. */
export function withAssemblyGeometryReuse<T>(source: AssemblyDocument, operation: (snapshots: AssemblySnapshotRunner, parts: AssemblyScenePartProvider) => T): T {
  return withNativeOwners(owners => {
    const pool = new AssemblyGeometryReusePool(source)
    owners.own({ delete: () => pool.dispose() })
    const snapshots: AssemblySnapshotRunner = (document, inspect) => {
      pool.assertAlive()
      try {
        return withNativeOwners(snapshotOwners => {
          const snapshot = new AssemblyGeometrySnapshot(document, pool)
          snapshotOwners.own({ delete: () => snapshot.dispose() })
          return inspect(snapshot)
        }, undefined, 'Assembly reusable snapshot or release failed.')
      } catch (error) {
        if (isNativeCleanupFailure(error)) pool.invalidate()
        throw error
      }
    }
    return operation(snapshots, definition => pool.scenePart(definition))
  }, undefined, 'Assembly reusable geometry operation or release failed.')
}

/**
 * Immutable complete-document native reference session. Definitions rebuild once
 * per active unique revision; occurrences retain independent paths and poses.
 * The issued object identity, not any serialized label or descriptor, is proof.
 */
export class AssemblyGeometrySnapshot {
  #document: AssemblyDocument
  #signature: string
  #definitions: Map<string, AssemblyDefinition>
  #parts = new Map<string, PartState>()
  #ownedParts = new Set<PartState>()
  #pool: AssemblyGeometryReusePool | undefined
  #alive = true

  constructor(input: AssemblyDocument, pool?: AssemblyGeometryReusePool) {
    this.#pool = pool
    pool?.assertAlive()
    this.#document = validateAssemblyDocument(input)
    this.#signature = JSON.stringify(this.#document)
    this.#definitions = new Map([this.#document, ...this.#document.definitions].map(value => [assemblyDefinitionKey(value), value]))
    try {
      let prototypeBodies = 0, expandedBodies = 0, faceReferences = 0, edgeReferences = 0, vertexReferences = 0
      for (const occurrence of expandAssemblyParts(this.#document)) {
        const definition = occurrence.definition, key = assemblyDefinitionKey(definition)
        const existing = this.#parts.get(key)
        if (existing) {
          expandedBodies += existing.bodyEntries
          if (expandedBodies > MAX_ASSEMBLY_NATIVE_BODY_ENTRIES) throw new Error('El ensamblaje supera 4096 entradas de cuerpo expandidas.')
          continue
        }
        const borrowed = pool?.borrow(definition), state = borrowed ?? emptyPartState()
        this.#parts.set(key, state)
        if (!borrowed) { this.#ownedParts.add(state); rebuildPartState(state, definition) }
        prototypeBodies += state.bodyEntries; expandedBodies += state.bodyEntries
        faceReferences += state.faceReferences; edgeReferences += state.edgeReferences; vertexReferences += state.vertexReferences
        if (prototypeBodies > MAX_ASSEMBLY_NATIVE_BODY_ENTRIES || expandedBodies > MAX_ASSEMBLY_NATIVE_BODY_ENTRIES || faceReferences > MAX_ASSEMBLY_NATIVE_FACE_REFERENCES || edgeReferences > MAX_ASSEMBLY_NATIVE_EDGE_REFERENCES) {
          throw new Error('El ensamblaje supera el presupuesto de cuerpos, caras o aristas nativos.')
        }
        if (vertexReferences > MAX_ASSEMBLY_NATIVE_VERTEX_REFERENCES) throw new Error('El ensamblaje supera el presupuesto de vértices nativos.')
      }
    } catch (error) { this.#fail(error) }
  }
  #available(): void {
    if (!this.#alive) throw new Error('La sesión nativa de ensamblaje ya no está vigente.')
    this.#pool?.assertAlive()
  }
  #current(input: AssemblyDocument): void {
    this.#available()
    if (JSON.stringify(validateAssemblyDocument(input)) !== this.#signature) throw new Error('El documento cambió; reconstruye la sesión nativa del ensamblaje.')
    this.#available()
  }
  #fail(error: unknown): never {
    if (isNativeCleanupFailure(error)) this.#pool?.invalidate()
    try { this.dispose() } catch (cleanup) { throw new NativeCleanupError({ error }, [cleanup], 'Assembly native snapshot or release failed.') }
    throw error
  }
  #placement(path: readonly string[]): Placement {
    assemblyOccurrencePathKey(path)
    let definition: AssemblyDefinition = this.#document, pose = identityRigidPose(), suppressed = false
    for (const id of path) {
      if (definition.kind !== 'assembly') throw new Error('La ruta atraviesa una pieza en lugar de un ensamblaje.')
      const occurrence: AssemblyOccurrence | undefined = definition.occurrences.find(value => value.id === id)
      if (!occurrence) throw new Error('La ocurrencia seleccionada ya no existe.')
      pose = composeRigidPoses(pose, occurrence.pose); suppressed ||= occurrence.suppressed
      definition = this.#definitions.get(assemblyDefinitionKey(occurrence.definition))!
    }
    return { definition, pose, suppressed }
  }
  #component(scopePath: readonly string[], reference: AssemblyComponentReference | null): { base: EndpointBase; placement: Placement } {
    const scope = this.#placement(scopePath)
    if (scope.definition.kind !== 'assembly') throw new Error('La relación necesita un ámbito de ensamblaje.')
    const path = reference === null ? [...scopePath] : [...scopePath, ...reference.occurrencePath]
    const placement = this.#placement(path)
    if (placement.suppressed) throw new Error('La ocurrencia seleccionada está suprimida.')
    if (reference && assemblyDefinitionKey(reference.definition) !== assemblyDefinitionKey(placement.definition)) throw new Error('La referencia pertenece a otra revisión de la pieza o ensamblaje.')
    return { base: { componentPath: path, definition: { id: placement.definition.id, revision: placement.definition.revision }, declaredWorldPose: placement.pose }, placement }
  }
  #issue(data: EndpointData): AssemblyEndpointWitness {
    this.#available()
    const result = freeze(data)
    let definition: AssemblyDefinition = this.#document, placementSum = 0
    for (const id of data.componentPath) {
      if (definition.kind !== 'assembly') throw new Error('La ruta aritmética atraviesa una pieza.')
      const occurrence: AssemblyOccurrence | undefined = definition.occurrences.find(value => value.id === id)
      if (!occurrence) throw new Error('La ruta aritmética de la referencia ya no existe.')
      placementSum += Math.hypot(...occurrence.pose.translation)
      definition = this.#definitions.get(assemblyDefinitionKey(occurrence.definition))!
    }
    witnesses.set(result, { owner: this, placementSum, depth: data.componentPath.length })
    return result
  }
  #resolve(scopePath: readonly string[], reference: AssemblyGeometryReference | AssemblyCylinderSurfaceReference | AssemblySphereSurfaceReference | AssemblyComponentReference, directionOnly = false): AssemblyEndpointWitness {
    this.#available()
    const component = 'kind' in reference ? reference.component : reference
    const { base, placement } = this.#component(scopePath, component)
    if (!('kind' in reference)) return this.#issue({ ...base, kind: 'component', origin: 'component' })
    if (reference.kind === 'face' && reference.support === 'sphere-surface') {
      if (placement.definition.kind !== 'part') throw new Error('La superficie esférica seleccionada necesita una pieza.');
      const state = this.#parts.get(assemblyDefinitionKey(placement.definition));
      if (!state) throw new Error('La pieza no tiene una reconstrucción nativa activa.');
      const localSupport = state.engine.inspectCurrentSphereSurfaceSupport(reference.face, reference.body);
      const worldSphere: AssemblyNativeSphereSurfaceSupport = { ...localSupport, center: transformRigidPoint(placement.pose, localSupport.center) };
      return this.#issue({ ...base, kind: 'sphere-surface', origin: 'native-sphere-surface', localSupport, worldSupport: worldSphere });
    }
    if (reference.kind === 'face' && reference.support === 'cylinder-surface') {
      if (placement.definition.kind !== 'part') throw new Error('La superficie cilíndrica seleccionada necesita una pieza.');
      const state = this.#parts.get(assemblyDefinitionKey(placement.definition));
      if (!state) throw new Error('La pieza no tiene una reconstrucción nativa activa.');
      const localSupport = state.engine.inspectCurrentCylinderSurfaceSupport(reference.face, reference.body);
      const worldSurface: AssemblyNativeCylinderSurfaceSupport = { ...localSupport,
        point: transformRigidPoint(placement.pose, assemblyTangentAxisPoint(localSupport.point, localSupport.axis)),
        axis: transformRigidDirection(placement.pose, localSupport.axis), xDirection: transformRigidDirection(placement.pose, localSupport.xDirection) };
      return this.#issue({ ...base, kind: 'cylinder-surface', origin: 'native-cylinder-surface', localSupport, worldSupport: worldSurface });
    }
    let localSupport: AssemblyNativeSupport, origin: 'native-face' | 'native-edge' | 'principal-plane' | 'principal-axis'
    if (reference.kind === 'principal-plane') {
      const frame = principalPlaneFrame(reference.plane)
      localSupport = { kind: 'plane', point: frame.origin, normal: frame.normal, xDirection: frame.xDirection, tolerance: 0 }
      origin = 'principal-plane'
    } else if (reference.kind === 'principal-axis') {
      localSupport = { kind: 'line', point: [0, 0, 0], axis: reference.axis === 'X' ? [1, 0, 0] : reference.axis === 'Y' ? [0, 1, 0] : [0, 0, 1], tolerance: 0 }
      origin = 'principal-axis'
    } else if (reference.kind === 'edge') {
      if (placement.definition.kind !== 'part') throw new Error('La arista seleccionada necesita una definición de pieza.')
      const state = this.#parts.get(assemblyDefinitionKey(placement.definition))
      if (!state) throw new Error('La pieza no tiene una reconstrucción nativa activa.')
      localSupport = state.engine.inspectCurrentEdgeSupport(reference.edge, reference.body)
      origin = 'native-edge'
    } else {
      if (placement.definition.kind !== 'part') throw new Error('La cara seleccionada necesita una definición de pieza.')
      const state = this.#parts.get(assemblyDefinitionKey(placement.definition))
      if (!state) throw new Error('La pieza no tiene una reconstrucción nativa activa.')
      localSupport = directionOnly ? state.engine.inspectCurrentDirectionFaceSupport(reference.face, reference.body)
        : state.engine.inspectCurrentFaceSupport(reference.face, reference.body)
      if ((reference.support === 'plane' && localSupport.kind !== 'plane') || (reference.support === 'axis' && localSupport.kind !== 'cylinder')) {
        throw new Error('El soporte nativo de la cara no coincide con el plano o eje declarado.')
      }
      origin = 'native-face'
    }
    return this.#issue({ ...base, kind: 'support', origin, localSupport, worldSupport: worldSupport(localSupport, placement.pose) })
  }
  /** Root-scoped picker metadata only; callers still need a native witness. */
  listFaces(input: AssemblyDocument, componentPath: readonly string[]): AssemblyFaceSelection[] {
    this.#current(input)
    const placement = this.#placement(componentPath)
    if (placement.suppressed || placement.definition.kind !== 'part') throw new Error('Selecciona una ocurrencia de pieza activa.')
    const state = this.#parts.get(assemblyDefinitionKey(placement.definition))!
    return state.selections.map(value => ({ component: { occurrencePath: [...componentPath], definition: {
      id: placement.definition.id, revision: placement.definition.revision } }, body: value.body ? { ...value.body } : null, face: { ...value.face } }))
  }
  /** Root-scoped vertex identity metadata; copied DTOs confer no point authority. */
  listVertices(input: AssemblyDocument, componentPath: readonly string[]): AssemblyVertexSelection[] {
    this.#current(input)
    this.#available()
    const placement = this.#placement(componentPath)
    if (placement.suppressed || placement.definition.kind !== 'part') throw new Error('Selecciona una ocurrencia de pieza activa.')
    const state = this.#parts.get(assemblyDefinitionKey(placement.definition))
    if (!state) throw new Error('La pieza no tiene una reconstrucción nativa activa.')
    return state.vertexSelections.map(value => ({ component: { occurrencePath: [...componentPath], definition: {
      id: placement.definition.id, revision: placement.definition.revision } }, body: value.body ? { ...value.body } : null, vertex: { ...value.vertex } }))
  }
  resolveVertexReference(input: AssemblyDocument, reference: AssemblyVertexReference, scopePath: readonly string[] = []): AssemblyPointWitness {
    this.#current(input)
    this.#available()
    const parsed = validateAssemblyVertexReference(reference)
    this.#available()
    const { base, placement } = this.#component(scopePath, parsed.component)
    if (placement.definition.kind !== 'part') throw new Error('El vértice seleccionado necesita una definición de pieza.')
    const state = this.#parts.get(assemblyDefinitionKey(placement.definition))
    if (!state) throw new Error('La pieza no tiene una reconstrucción nativa activa.')
    try {
      const localSupport = state.engine.inspectCurrentVertexSupport(parsed.vertex, parsed.body)
      const point = transformRigidPoint(placement.pose, localSupport.point)
      if (!point.every(Number.isFinite)) throw new Error('La posición del vértice excede la precisión finita.')
      this.#available()
      const result: AssemblyPointWitness = freeze({ ...base, kind: 'point', origin: 'native-vertex',
        localSupport, worldSupport: { ...localSupport, point } })
      let definition: AssemblyDefinition = this.#document, placementSum = 0
      for (const id of base.componentPath) {
        if (definition.kind !== 'assembly') throw new Error('La ruta aritmética atraviesa una pieza.')
        const occurrence: AssemblyOccurrence | undefined = definition.occurrences.find(value => value.id === id)
        if (!occurrence) throw new Error('La ruta aritmética del vértice ya no existe.')
        placementSum += Math.hypot(...occurrence.pose.translation)
        definition = this.#definitions.get(assemblyDefinitionKey(occurrence.definition))!
      }
      pointWitnesses.set(result, { owner: this, placementSum, depth: base.componentPath.length })
      return result
    } catch (error) { return this.#fail(error) }
  }
  resolveLinePathSelection(input: AssemblyDocument, selection: AssemblyLinePathSelection, scopePath: readonly string[] = [], bands?: AssemblyPathCurveBands): AssemblyLinePathWitness {
    this.#current(input)
    const parsed=validateAssemblyLinePathSelection(selection), checkedBands=validateAssemblyPathBands(bands)
    const scope=JSON.parse(assemblyOccurrencePathKey(scopePath)) as string[]
    this.#available()
    const {base,placement}=this.#component(scope,parsed.component)
    if(placement.definition.kind!=='part') throw new Error('Material line requires an active part.')
    const state=this.#parts.get(assemblyDefinitionKey(placement.definition))
    if(!state) throw new Error('Material line native part unavailable.')
    try {
      const localCurve=state.engine.inspectCurrentLinePath(parsed.edge,parsed.startVertex,parsed.body,checkedBands)
      this.#available()
      const point=(p:readonly number[])=>transformRigidPoint(placement.pose,p as [number,number,number])
      const worldCurve:AssemblyLinePathCurve={...localCurve,startPoint:point(localCurve.startPoint),endPoint:point(localCurve.endPoint),firstPoint:point(localCurve.firstPoint),increasingDirection:transformRigidDirection(placement.pose,localCurve.increasingDirection as [number,number,number]),precision:{...localCurve.precision}}
      let definition:AssemblyDefinition=this.#document,placementSum=0
      for(const id of base.componentPath){if(definition.kind!=='assembly') throw new Error('Invalid material line arithmetic path.');const occurrence:AssemblyOccurrence|undefined=definition.occurrences.find(value=>value.id===id);if(!occurrence)throw new Error('Missing material line occurrence.');placementSum+=Math.hypot(...occurrence.pose.translation);definition=this.#definitions.get(assemblyDefinitionKey(occurrence.definition))!}
      const localMagnitude=Math.max(...[localCurve.startPoint,localCurve.endPoint,localCurve.firstPoint].map(p=>Math.hypot(...p)))
      const worldMagnitude=Math.max(...[worldCurve.startPoint,worldCurve.endPoint,worldCurve.firstPoint].map(p=>Math.hypot(...p)))
      const round=128*Number.EPSILON*(base.componentPath.length+1)
      worldCurve.precision.positionMm+=round*(placementSum+localMagnitude+worldMagnitude)
      worldCurve.precision.tangentRad+=round
      if(![placementSum,...worldCurve.startPoint,...worldCurve.endPoint,...worldCurve.firstPoint,...worldCurve.increasingDirection,...Object.values(worldCurve.precision)].every(Number.isFinite))throw new AssemblyPathCurvePrecisionError()
      if(worldCurve.precision.positionMm>(checkedBands.lengthToleranceMm??1e-6)||worldCurve.precision.lengthMm>(checkedBands.lengthToleranceMm??1e-6)||worldCurve.precision.tangentRad>(checkedBands.angleToleranceRad??1e-8))throw new AssemblyPathCurvePrecisionError()
      this.#current(input)
      const result=freeze({...base,kind:'line-path' as const,origin:'native-line-material-endpoint' as const,localCurve,worldCurve})
      linePathWitnesses.set(result,{owner:this,placementSum,depth:base.componentPath.length});return result
    }catch(error){return this.#fail(error)}
  }
  resolveArcPathSelection(input: AssemblyDocument, selection: AssemblyArcPathSelection, scopePath: readonly string[] = [],
    bands?: AssemblyPathCurveBands): AssemblyArcPathWitness {
    return this.#arcPathSelection(input, selection, scopePath, bands, null)
  }
  evaluateArcPathSelection(input: AssemblyDocument, selection: AssemblyArcPathSelection, coordinate: AssemblyPathCurveCoordinate,
    scopePath: readonly string[] = [], bands?: AssemblyPathCurveBands): AssemblyArcPathEvaluationWitness {
    const result = this.#arcPathSelection(input, selection, scopePath, bands, validateAssemblyPathCoordinate(coordinate))
    if (!('localEvaluation' in result)) throw new Error('Material arc evaluation is unavailable.')
    return result
  }
  #arcPathSelection(input: AssemblyDocument, selection: AssemblyArcPathSelection, scopePath: readonly string[],
    bands: AssemblyPathCurveBands | undefined, coordinate: AssemblyPathCurveCoordinate | null): AssemblyArcPathWitness | AssemblyArcPathEvaluationWitness {
    this.#current(input)
    const parsed = validateAssemblyArcPathSelection(selection), checkedBands = validateAssemblyPathBands(bands)
    const scope = JSON.parse(assemblyOccurrencePathKey(scopePath)) as string[]
    this.#available()
    const { base, placement } = this.#component(scope, parsed.component)
    if (placement.definition.kind !== 'part') throw new Error('Material arc requires an active part.')
    const state = this.#parts.get(assemblyDefinitionKey(placement.definition))
    if (!state) throw new Error('Material arc native part is unavailable.')
    try {
      const localEvaluation = coordinate === null ? null : state.engine.inspectCurrentArcPathEvaluation(parsed.edge, parsed.startVertex, parsed.body, coordinate, checkedBands)
      const localCurve = localEvaluation?.observation ?? state.engine.inspectCurrentArcPath(parsed.edge, parsed.startVertex, parsed.body, checkedBands)
      this.#available()
      const point = (p: readonly number[]) => transformRigidPoint(placement.pose, p as [number, number, number])
      const direction = (p: readonly number[]) => transformRigidDirection(placement.pose, p as [number, number, number])
      const worldCurve: AssemblyArcPathCurve = { ...localCurve, startPoint: point(localCurve.startPoint), endPoint: point(localCurve.endPoint),
        center: point(localCurve.center), normal: direction(localCurve.normal), xDirection: direction(localCurve.xDirection), precision: { ...localCurve.precision },
        materialFrame: { radial: direction(localCurve.materialFrame.radial), tangent: direction(localCurve.materialFrame.tangent), normal: direction(localCurve.materialFrame.normal) },
        arithmetic: { ...localCurve.arithmetic }, ...(localCurve.analyticArithmetic ? { analyticArithmetic: { ...localCurve.analyticArithmetic } } : {}) }
      let definition: AssemblyDefinition = this.#document, placementSum = 0
      for (const id of base.componentPath) {
        if (definition.kind !== 'assembly') throw new Error('Invalid material arc arithmetic path.')
        const occurrence: AssemblyOccurrence | undefined = definition.occurrences.find(value => value.id === id)
        if (!occurrence) throw new Error('Missing material arc occurrence.')
        placementSum += Math.hypot(...occurrence.pose.translation)
        definition = this.#definitions.get(assemblyDefinitionKey(occurrence.definition))!
      }
      // Retain the original placement chain before any cancellation. Rigid
      // translation affects points, never the radius or tangent direction.
      const localMagnitude = Math.max(Math.hypot(...localCurve.startPoint), Math.hypot(...localCurve.endPoint),
        Math.hypot(...localCurve.center) + localCurve.radiusMm, localEvaluation ? Math.hypot(...localEvaluation.point) : 0)
      const worldMagnitude = Math.max(Math.hypot(...worldCurve.startPoint), Math.hypot(...worldCurve.endPoint), Math.hypot(...worldCurve.center) + worldCurve.radiusMm)
      const round = 128 * Number.EPSILON * (base.componentPath.length + 1)
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
      this.#current(input)
      const common = { ...base, kind: 'arc-path' as const, origin: 'native-circular-material-endpoint' as const, localCurve, worldCurve }
      const result = freeze(localEvaluation && worldEvaluation ? { ...common, localEvaluation, worldEvaluation } : common)
      arcPathWitnesses.set(result, { owner: this, placementSum, depth: base.componentPath.length })
      return result
    } catch (error) { return this.#fail(error) }
  }
  resolvePathCurveSelection(input: AssemblyDocument, selection: AssemblyPathCurveSelection, scopePath: readonly string[] = [],
    bands?: AssemblyPathCurveBands): AssemblyPathCurveWitness {
    return this.#pathCurveSelection(input, selection, scopePath, bands, null)
  }
  evaluatePathCurveSelection(input: AssemblyDocument, selection: AssemblyPathCurveSelection, coordinate: AssemblyPathCurveCoordinate,
    scopePath: readonly string[] = [], bands?: AssemblyPathCurveBands): AssemblyPathCurveEvaluationWitness {
    const result = this.#pathCurveSelection(input, selection, scopePath, bands, validateAssemblyPathCoordinate(coordinate))
    if (!('localEvaluation' in result)) throw new Error('La consulta no produjo una evaluación acotada del trayecto.')
    return result
  }
  #pathCurveSelection(input: AssemblyDocument, selection: AssemblyPathCurveSelection, scopePath: readonly string[],
    bands: AssemblyPathCurveBands | undefined, coordinate: AssemblyPathCurveCoordinate | null): AssemblyPathCurveWitness | AssemblyPathCurveEvaluationWitness {
    this.#current(input)
    const parsed = validateAssemblyPathCurveSelection(selection), checkedBands = validateAssemblyPathBands(bands)
    const scope = JSON.parse(assemblyOccurrencePathKey(scopePath)) as string[]
    this.#available()
    const { base, placement } = this.#component(scope, parsed.component)
    if (placement.definition.kind !== 'part') throw new Error('El trayecto seleccionado necesita una pieza activa.')
    const state = this.#parts.get(assemblyDefinitionKey(placement.definition))
    if (!state) throw new Error('La pieza del trayecto no tiene una reconstrucción nativa activa.')
    try {
      const localEvaluation = coordinate === null ? null : state.engine.inspectCurrentPathEvaluation(parsed.edge, parsed.body, parsed.sense, coordinate, checkedBands)
      const localCurve = localEvaluation?.observation ?? state.engine.inspectCurrentPathCurve(parsed.edge, parsed.body, parsed.sense, checkedBands)
      this.#available()
      const point = (p: readonly number[]) => transformRigidPoint(placement.pose, p as [number, number, number])
      const direction = (p: readonly number[]) => transformRigidDirection(placement.pose, p as [number, number, number])
      const common = { ...localCurve, startPoint: point(localCurve.startPoint), endPoint: point(localCurve.endPoint), precision: { ...localCurve.precision } }
      const worldCurve: AssemblyPathCurveObservation = localCurve.kind === 'line'
        ? { ...common, kind: 'line', firstPoint: point(localCurve.firstPoint), increasingDirection: direction(localCurve.increasingDirection) }
        : { ...common, kind: 'circle', center: point(localCurve.center), normal: direction(localCurve.normal), xDirection: direction(localCurve.xDirection), radiusMm: localCurve.radiusMm }
      let definition: AssemblyDefinition = this.#document, placementSum = 0
      for (const id of base.componentPath) {
        if (definition.kind !== 'assembly') throw new Error('La ruta aritmética atraviesa una pieza.')
        const occurrence: AssemblyOccurrence | undefined = definition.occurrences.find(value => value.id === id)
        if (!occurrence) throw new Error('La ruta aritmética del trayecto ya no existe.')
        placementSum += Math.hypot(...occurrence.pose.translation)
        definition = this.#definitions.get(assemblyDefinitionKey(occurrence.definition))!
      }
      const points = (curve: AssemblyPathCurveObservation) => [curve.startPoint, curve.endPoint, curve.kind === 'line' ? curve.firstPoint : curve.center]
      const localMagnitude = Math.max(...points(localCurve).map(p => Math.hypot(...p)), localEvaluation ? Math.hypot(...localEvaluation.point) : 0,
        localCurve.kind === 'circle' ? Math.hypot(...localCurve.center) + localCurve.radiusMm : 0)
      const worldMagnitude = Math.max(...points(worldCurve).map(p => Math.hypot(...p)),
        worldCurve.kind === 'circle' ? Math.hypot(...worldCurve.center) + worldCurve.radiusMm : 0)
      const round = 128 * Number.EPSILON * (base.componentPath.length + 1)
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
      this.#current(input)
      const commonWitness = { ...base, kind: 'path-curve' as const, origin: 'native-bounded-edge' as const, localCurve, worldCurve }
      const result = freeze(localEvaluation && worldEvaluation ? { ...commonWitness, localEvaluation, worldEvaluation } : commonWitness)
      pathCurveWitnesses.set(result, { owner: this, placementSum, depth: base.componentPath.length })
      return result
    } catch (error) { return this.#fail(error) }
  }
  /** Strict current selection declaration -> privately issued bounded-profile proof. */
  resolveProfileFaceSelection(input: AssemblyDocument, selection: AssemblyFaceSelection, scopePath: readonly string[] = [],
    bands?: { lengthToleranceMm?: number; angleToleranceRad?: number }): AssemblyProfileWitness {
    this.#current(input)
    const parsed = validateAssemblyProfileFaceSelection(selection)
    let checkedBands: { lengthToleranceMm?: number; angleToleranceRad?: number } | undefined
    if (bands !== undefined) {
      if (!bands || typeof bands !== 'object' || Object.getPrototypeOf(bands) !== Object.prototype) throw new Error('Las bandas de perfil requieren datos propios.')
      checkedBands = {}
      for (const key of Reflect.ownKeys(bands)) {
        if (key !== 'lengthToleranceMm' && key !== 'angleToleranceRad') throw new Error('Banda de perfil desconocida.')
        const field = Object.getOwnPropertyDescriptor(bands, key)!
        if (!field.enumerable || !('value' in field) || typeof field.value !== 'number' || !Number.isFinite(field.value) || field.value <= 0
          || (key === 'angleToleranceRad' && field.value >= Math.PI)) throw new Error('Banda de perfil inválida.')
        checkedBands[key] = field.value
      }
    }
    this.#available()
    const { base, placement } = this.#component(scopePath, parsed.component)
    if (placement.definition.kind !== 'part') throw new Error('El perfil seleccionado necesita una definición de pieza.')
    const state = this.#parts.get(assemblyDefinitionKey(placement.definition))
    if (!state) throw new Error('La pieza no tiene una reconstrucción nativa activa.')
    this.#available()
    try {
      const localSupport = state.engine.inspectCurrentProfileSupport(parsed.face, parsed.body, checkedBands)
      this.#available()
      const point = (p: readonly number[]) => transformRigidPoint(placement.pose, p as [number, number, number])
      const direction = (p: readonly number[]) => transformRigidDirection(placement.pose, p as [number, number, number])
      const common = { ...localSupport, center: point(localSupport.center), normal: direction(localSupport.normal), uncertainty: { ...localSupport.uncertainty } }
      const worldProfile: AssemblyNativeProfileSupport = localSupport.kind === 'circle' ? { ...common, kind: 'circle', radiusMm: localSupport.radiusMm, radiusErrorMm: localSupport.radiusErrorMm }
        : { ...common, kind: 'rectangle', corners: localSupport.corners.map(point) as typeof localSupport.corners,
          boundaryAxes: localSupport.boundaryAxes.map(direction) as typeof localSupport.boundaryAxes, lengthsMm: [...localSupport.lengthsMm] }
      const coordinates = [...worldProfile.center, ...worldProfile.normal, ...(worldProfile.kind === 'rectangle' ? [...worldProfile.corners.flat(), ...worldProfile.boundaryAxes.flat()] : [])]
      if (!coordinates.every(Number.isFinite)) throw new Error('La posición del perfil excede la precisión finita.')
      let definition: AssemblyDefinition = this.#document, placementSum = 0
      for (const id of base.componentPath) {
        if (definition.kind !== 'assembly') throw new Error('La ruta aritmética atraviesa una pieza.')
        const occurrence: AssemblyOccurrence | undefined = definition.occurrences.find(value => value.id === id)
        if (!occurrence) throw new Error('La ruta aritmética del perfil ya no existe.')
        placementSum += Math.hypot(...occurrence.pose.translation)
        definition = this.#definitions.get(assemblyDefinitionKey(occurrence.definition))!
      }
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
        + 64 * Number.EPSILON * (base.componentPath.length + 1) * (placementSum + localMagnitude + worldMagnitude)
      const worldNormalError = localSupport.uncertainty.normalErrorRad + 64 * Number.EPSILON * (base.componentPath.length + 1)
      if (!Number.isFinite(worldPositionError) || !Number.isFinite(worldNormalError)) throw new Error('La incertidumbre de composición del perfil excede la precisión finita.')
      worldProfile.uncertainty = { positionErrorMm: worldPositionError, normalErrorRad: worldNormalError }
      this.#current(input)
      const result: AssemblyProfileWitness = freeze({ ...base, kind: 'profile', origin: 'native-profile-face', localSupport, worldSupport: worldProfile })
      profileWitnesses.set(result, { owner: this, placementSum, depth: base.componentPath.length })
      return result
    } catch (error) { return this.#fail(error) }
  }
  /** Explicit boundary edge+sense, authenticated together with its bounded face. */
  resolveProfileAxisSelection(input: AssemblyDocument, selection: AssemblyProfileAxisSelection, scopePath: readonly string[] = [],
    bands?: { lengthToleranceMm?: number; angleToleranceRad?: number }): AssemblyProfileAxisWitness {
    this.#current(input)
    const parsed = validateAssemblyProfileAxisSelection(selection)
    let checkedBands: { lengthToleranceMm?: number; angleToleranceRad?: number } | undefined
    if (bands !== undefined) {
      if (!bands || typeof bands !== 'object' || Object.getPrototypeOf(bands) !== Object.prototype) throw new Error('Las bandas de eje de perfil requieren datos propios.')
      checkedBands = {}
      for (const key of Reflect.ownKeys(bands)) {
        if (key !== 'lengthToleranceMm' && key !== 'angleToleranceRad') throw new Error('Banda de eje de perfil desconocida.')
        const field = Object.getOwnPropertyDescriptor(bands, key)!
        if (!field.enumerable || !('value' in field) || typeof field.value !== 'number' || !Number.isFinite(field.value) || field.value <= 0
          || (key === 'angleToleranceRad' && field.value >= Math.PI)) throw new Error('Banda de eje de perfil inválida.')
        checkedBands[key] = field.value
      }
    }
    this.#available()
    const { base, placement } = this.#component(scopePath, parsed.component)
    if (placement.definition.kind !== 'part') throw new Error('El eje de perfil necesita una definición de pieza.')
    const state = this.#parts.get(assemblyDefinitionKey(placement.definition))
    if (!state) throw new Error('La pieza no tiene una reconstrucción nativa activa.')
    this.#available()
    try {
      const localSupport = state.engine.inspectCurrentProfileAxisSupport(parsed.face, parsed.edge, parsed.body, parsed.sense, checkedBands)
      this.#available()
      const point = (p: readonly number[]) => transformRigidPoint(placement.pose, p as [number, number, number])
      const direction = (p: readonly number[]) => transformRigidDirection(placement.pose, p as [number, number, number])
      const local = localSupport.profile
      const profile: Extract<AssemblyNativeProfileSupport, { kind: 'rectangle' }> = { ...local, center: point(local.center), normal: direction(local.normal),
        corners: local.corners.map(point) as typeof local.corners, boundaryAxes: local.boundaryAxes.map(direction) as typeof local.boundaryAxes,
        lengthsMm: [...local.lengthsMm], uncertainty: { ...local.uncertainty } }
      let definition: AssemblyDefinition = this.#document, placementSum = 0
      for (const id of base.componentPath) {
        if (definition.kind !== 'assembly') throw new Error('La ruta del eje atraviesa una pieza.')
        const occurrence: AssemblyOccurrence | undefined = definition.occurrences.find(value => value.id === id)
        if (!occurrence) throw new Error('La ruta del eje de perfil ya no existe.')
        placementSum += Math.hypot(...occurrence.pose.translation)
        definition = this.#definitions.get(assemblyDefinitionKey(occurrence.definition))!
      }
      const round = 64 * Number.EPSILON * (base.componentPath.length + 1)
      const localMagnitude = Math.max(...[local.center, ...local.corners].map(p => Math.hypot(...p)))
      const worldMagnitude = Math.max(...[profile.center, ...profile.corners].map(p => Math.hypot(...p)))
      profile.uncertainty = { positionErrorMm: local.uncertainty.positionErrorMm + round * (placementSum + localMagnitude + worldMagnitude),
        normalErrorRad: local.uncertainty.normalErrorRad + round }
      const worldSupport: AssemblyNativeRectangleAxisSupport = { ...localSupport, profile, xDirection: direction(localSupport.xDirection),
        xDirectionErrorRad: localSupport.xDirectionErrorRad + round }
      const scalars = [...profile.center, ...profile.normal, ...profile.corners.flat(), ...profile.boundaryAxes.flat(),
        ...worldSupport.xDirection, profile.uncertainty.positionErrorMm, profile.uncertainty.normalErrorRad, worldSupport.xDirectionErrorRad]
      if (!scalars.every(Number.isFinite)) throw new Error('La composición del eje de perfil excede la precisión finita.')
      this.#current(input)
      const result: AssemblyProfileAxisWitness = freeze({ ...base, kind: 'profile-axis', origin: 'native-profile-boundary-edge', localSupport, worldSupport })
      profileAxisWitnesses.set(result, { owner: this, placementSum, depth: base.componentPath.length })
      return result
    } catch (error) { return this.#fail(error) }
  }
  resolveReference(input: AssemblyDocument, reference: AssemblyGeometryReference, scopePath: readonly string[] = []): AssemblyEndpointWitness {
    this.#current(input)
    const parsed = validateAssemblyGeometryReference(reference)
    try { return this.#resolve(scopePath, parsed) }
    catch (error) { if (isNativeCleanupFailure(error)) this.#fail(error); throw error }
  }
  /** Actual directional support without irrelevant plane origin/cylinder radius admission. */
  resolveDirectionReference(input: AssemblyDocument, reference: AssemblyGeometryReference, scopePath: readonly string[] = []): AssemblyEndpointWitness {
    this.#current(input)
    const parsed = validateAssemblyGeometryReference(reference)
    try { return this.#resolve(scopePath, parsed, true) }
    catch (error) { if (isNativeCleanupFailure(error)) this.#fail(error); throw error }
  }
  resolveCylinderSurfaceReference(input: AssemblyDocument, reference: AssemblyCylinderSurfaceReference, scopePath: readonly string[] = []): AssemblyEndpointWitness {
    this.#current(input)
    const parsed = validateAssemblyCylinderSurfaceReference(reference)
    try { return this.#resolve(scopePath, parsed) }
    catch (error) { if (isNativeCleanupFailure(error)) this.#fail(error); throw error }
  }
  resolveSphereSurfaceReference(input: AssemblyDocument, reference: AssemblySphereSurfaceReference, scopePath: readonly string[] = []): AssemblyEndpointWitness {
    this.#current(input)
    const parsed = validateAssemblySphereSurfaceReference(reference)
    try { return this.#resolve(scopePath, parsed) }
    catch (error) { if (isNativeCleanupFailure(error)) this.#fail(error); throw error }
  }
  resolveActiveMates(input: AssemblyDocument): ResolvedAssemblyMate[] {
    this.#current(input)
    const result: ResolvedAssemblyMate[] = []
    try {
      for (const inspection of inspectAssemblyMateReferences(this.#document)) {
        if (inspection.suppressed) continue
        if (isAssemblyHingeMateInspection(inspection)) {
          if ([...inspection.axis, ...inspection.axial, ...(inspection.angular ?? [])].some(role => role.diagnostics.length)) throw Error('Repair every hinge reference before solving.')
          const request = { axis: inspection.mate.axis, axial: inspection.mate.axial, alignment: inspection.mate.alignment }
          const limited = inspection.mate.stops ? resolveAssemblyLimitedHingeReferences(this, this.#document, { ...request, stops: inspection.mate.stops }, inspection.scopePath) : undefined
          const current = limited ?? resolveAssemblyHingeReferences(this, this.#document, request, inspection.scopePath)
          result.push(freeze({ scopePath: inspection.scopePath, mate: inspection.mate, axis: current.axis, axial: current.axial, ...(limited ? { limited } : {}) }))
          continue
        }
        if (isAssemblyCircularPathMateInspection(inspection)) {
          if(inspection.point.diagnostics.length||inspection.path.diagnostics.length||inspection.up?.diagnostics.length)throw new Error('Repair the current circular path material roles before solving.')
          const first=this.resolveVertexReference(this.#document,inspection.mate.point,inspection.scopePath)
          const second=this.resolveArcPathSelection(this.#document,inspection.mate.path,inspection.scopePath)
          const up=typeof inspection.mate.orientation.roll==='object'?this.resolveDirectionReference(this.#document,inspection.mate.orientation.roll.guide,inspection.scopePath):undefined
          if(up&&(up.kind!=='support'||up.origin!=='native-face'||up.localSupport.kind!=='plane'))throw new Error('Circular UP requires a current native planar face.')
          this.assertPointWitness(first,this.#document);this.assertArcPathWitness(second,this.#document)
          if(up)this.assertMateWitness(up,this.#document)
          result.push(freeze({scopePath:inspection.scopePath,mate:inspection.mate,first,second,...(up?{up}:{})}));continue
        }
        if (isAssemblyLinePathMateInspection(inspection)) {
          if(inspection.point.diagnostics.length||inspection.path.diagnostics.length||inspection.up?.diagnostics.length)throw new Error('Repair both material line path roles before solving.')
          const first=this.resolveVertexReference(this.#document,inspection.mate.point,inspection.scopePath)
          const second=this.resolveLinePathSelection(this.#document,inspection.mate.path,inspection.scopePath)
          const up=typeof inspection.mate.orientation.roll==='object'?this.resolveDirectionReference(this.#document,inspection.mate.orientation.roll.guide,inspection.scopePath):undefined
          if(up&&(up.kind!=='support'||up.origin!=='native-face'||up.localSupport.kind!=='plane'))throw new Error('UP requires a current native planar face.')
          if(up)this.assertMateWitness(up,this.#document)
          this.assertPointWitness(first,this.#document);this.assertLinePathWitness(second,this.#document)
          result.push(freeze({scopePath:inspection.scopePath,mate:inspection.mate,first,second,...(up?{up}:{})}));continue
        }
        if (isAssemblyProfileCenterMateInspection(inspection)) {
          if (inspection.first.diagnostics.length || inspection.second.diagnostics.length) throw new Error('Repara ambas referencias compuestas del centro de perfil «' + inspection.mate.name + '».')
          const resolve = (selection: AssemblyProfileCenterMate['first']): AssemblyProfileWitness | AssemblyProfileAxisWitness => selection.axis === null
            ? this.resolveProfileFaceSelection(this.#document, selection.face, inspection.scopePath)
            : this.resolveProfileAxisSelection(this.#document, { ...selection.face, ...selection.axis }, inspection.scopePath)
          const first = resolve(inspection.mate.first), second = resolve(inspection.mate.second)
          if (inspection.mate.orientation.mode === 'free') {
            if (first.kind !== 'profile' || second.kind !== 'profile' || first.localSupport.kind !== 'circle' || second.localSupport.kind !== 'circle') throw new Error('El centro de perfil guardado libre requiere dos discos circulares completos.')
          } else if (first.kind !== 'profile-axis' || second.kind !== 'profile-axis') throw new Error('El centro de perfil rectangular requiere dos aristas materiales del contorno verificadas.')
          this.assertMateWitness(first, this.#document); this.assertMateWitness(second, this.#document)
          result.push(freeze({ scopePath: inspection.scopePath, mate: inspection.mate, first, second }))
          continue
        }
        if (isAssemblySymmetryMateInspection(inspection)) {
          if ([inspection.source, inspection.target, inspection.mirror].some(value => value.diagnostics.length)) throw new Error('Repara las tres referencias de simetría de «' + inspection.mate.name + '».')
          const resolve = (reference: AssemblySymmetryMate['source']): AssemblyMateWitness => reference.kind === 'vertex'
            ? this.resolveVertexReference(this.#document, reference, inspection.scopePath) : this.#resolve(inspection.scopePath, reference)
          const source = resolve(inspection.mate.source), target = resolve(inspection.mate.target), mirror = this.#resolve(inspection.scopePath, inspection.mate.mirror)
          if (mirror.kind !== 'support' || mirror.localSupport.kind !== 'plane') throw new Error('La tercera referencia de simetría necesita un plano nativo actual.')
          for (const witness of [source, target, mirror]) this.assertMateWitness(witness, this.#document)
          result.push(freeze({ scopePath: inspection.scopePath, mate: inspection.mate, source, target, mirror }))
          continue
        }
        if (isAssemblyWidthMateInspection(inspection)) {
          if ([...inspection.width, ...inspection.tab].some(value => value.diagnostics.length)) throw new Error('Repara las cuatro referencias de la relación «' + inspection.mate.name + '» antes de resolver el ensamblaje.')
          const pair = (references: AssemblyWidthCenteredMate['width']): [AssemblyEndpointWitness, AssemblyEndpointWitness] => {
            const first = this.#resolve(inspection.scopePath, references[0]), second = this.#resolve(inspection.scopePath, references[1])
            if ([first, second].some(value => value.kind !== 'support' || value.localSupport.kind !== 'plane')) throw new Error('La anchura centrada necesita cuatro planos nativos actuales.')
            return [first, second]
          }
          result.push(freeze({ scopePath: inspection.scopePath, mate: inspection.mate,
            width: pair(inspection.mate.width), tab: pair(inspection.mate.tab) }))
          continue
        }
        if (inspection.first.diagnostics.length || inspection.second.diagnostics.length || inspection.carrier?.diagnostics.length || inspection.guide?.diagnostics.length) throw new Error('Repara las referencias de la relación «' + inspection.mate.name + '» antes de resolver el ensamblaje.')
        result.push(freeze({ scopePath: inspection.scopePath, mate: inspection.mate,
          first: this.#resolve(inspection.scopePath, inspection.mate.first, inspection.mate.type === 'limit-angle' || inspection.mate.type === 'limit-directed-angle'),
          second: this.#resolve(inspection.scopePath, inspection.mate.second, inspection.mate.type === 'limit-angle' || inspection.mate.type === 'limit-directed-angle'),
          ...(inspection.mate.type === 'limit-directed-angle' ? { guide: this.#resolve(inspection.scopePath, inspection.mate.guide, true) } : {}),
          ...(inspection.mate.type === 'gear' ? { carrier: this.#resolve(inspection.scopePath,
            inspection.mate.carrier ?? { kind: 'principal-plane', component: null, plane: 'XY' }) } : {}) }))
      }
      return result
    } catch (error) { if (isNativeCleanupFailure(error)) this.#fail(error); throw error }
  }
  /** Suppressed equations still track angular state in active namespaces. */
  resolvePassiveGears(input: AssemblyDocument): ResolvedAssemblyBinaryMate[] {
    return this.inspectGearState(input, true).resolved
  }
  resolvePassiveScrews(input: AssemblyDocument): ResolvedAssemblyBinaryMate[] {
    return this.inspectScrewState(input, true).resolved
  }
  resolvePassiveRackPinions(input: AssemblyDocument): ResolvedAssemblyBinaryMate[] {
    return this.inspectRackPinionState(input, true).resolved
  }
  inspectRackPinionState(input: AssemblyDocument, suppressedOnly = false): { resolved: ResolvedAssemblyBinaryMate[]; unavailable: UnavailableAssemblyRackPinion[] } {
    this.#current(input)
    const resolved: ResolvedAssemblyBinaryMate[] = [], unavailable: UnavailableAssemblyRackPinion[] = []
    try {
      for (const inspection of inspectAssemblyMateReferences(this.#document)) {
        if (!isAssemblyBinaryMateInspection(inspection) || inspection.mate.type !== 'rack-pinion' || suppressedOnly && !inspection.mate.suppressed || this.#placement(inspection.scopePath).suppressed) continue
        const mate = inspection.mate, scope = this.#placement(inspection.scopePath).definition
        const missing = () => unavailable.push(freeze({ scopePath: [...inspection.scopePath], scope: { id: scope.id, revision: scope.revision }, mate }))
        if (inspection.first.diagnostics.length || inspection.second.diagnostics.length) { missing(); continue }
        try { resolved.push(freeze({ scopePath: inspection.scopePath, mate,
          first: this.#resolve(inspection.scopePath, mate.first), second: this.#resolve(inspection.scopePath, mate.second) })) }
        catch (error) { if (isNativeCleanupFailure(error)) throw error; missing() }
      }
      return { resolved, unavailable }
    } catch (error) { if (isNativeCleanupFailure(error)) this.#fail(error); throw error }
  }
  inspectScrewState(input: AssemblyDocument, suppressedOnly = false): { resolved: ResolvedAssemblyBinaryMate[]; unavailable: UnavailableAssemblyScrew[] } {
    this.#current(input)
    const resolved: ResolvedAssemblyBinaryMate[] = [], unavailable: UnavailableAssemblyScrew[] = []
    try {
      for (const inspection of inspectAssemblyMateReferences(this.#document)) {
        if (!isAssemblyBinaryMateInspection(inspection) || inspection.mate.type !== 'screw' || suppressedOnly && !inspection.mate.suppressed || this.#placement(inspection.scopePath).suppressed) continue
        const mate = inspection.mate, scope = this.#placement(inspection.scopePath).definition
        const missing = () => unavailable.push(freeze({ scopePath: [...inspection.scopePath], scope: { id: scope.id, revision: scope.revision }, mate }))
        if (inspection.first.diagnostics.length || inspection.second.diagnostics.length) { missing(); continue }
        try {
          resolved.push(freeze({ scopePath: inspection.scopePath, mate,
            first: this.#resolve(inspection.scopePath, mate.first), second: this.#resolve(inspection.scopePath, mate.second) }))
        } catch (error) {
          if (isNativeCleanupFailure(error)) throw error
          missing()
        }
      }
      return { resolved, unavailable }
    } catch (error) { if (isNativeCleanupFailure(error)) this.#fail(error); throw error }
  }
  /** Missing references are declarations, while native cleanup errors stay fatal. */
  inspectGearState(input: AssemblyDocument, suppressedOnly = false): { resolved: ResolvedAssemblyBinaryMate[]; unavailable: UnavailableAssemblyGear[] } {
    this.#current(input)
    const resolved: ResolvedAssemblyBinaryMate[] = [], unavailable: UnavailableAssemblyGear[] = []
    try {
      for (const inspection of inspectAssemblyMateReferences(this.#document)) {
        if (!isAssemblyBinaryMateInspection(inspection) || inspection.mate.type !== 'gear' || suppressedOnly && !inspection.mate.suppressed || this.#placement(inspection.scopePath).suppressed) continue
        const mate = inspection.mate, scope = this.#placement(inspection.scopePath).definition
        const missing = () => unavailable.push(freeze({ scopePath: [...inspection.scopePath], scope: { id: scope.id, revision: scope.revision }, mate }))
        if (inspection.first.diagnostics.length || inspection.second.diagnostics.length || inspection.carrier?.diagnostics.length) { missing(); continue }
        try {
          resolved.push(freeze({ scopePath: inspection.scopePath, mate,
            first: this.#resolve(inspection.scopePath, mate.first), second: this.#resolve(inspection.scopePath, mate.second),
            carrier: this.#resolve(inspection.scopePath, mate.carrier ?? { kind: 'principal-plane', component: null, plane: 'XY' }) }))
        } catch (error) {
          if (isNativeCleanupFailure(error)) throw error
          missing()
        }
      }
      return { resolved, unavailable }
    } catch (error) { if (isNativeCleanupFailure(error)) this.#fail(error); throw error }
  }
  assertWitness(value: AssemblyEndpointWitness, input: AssemblyDocument): AssemblyEndpointWitness {
    this.#current(input)
    if (!value || witnesses.get(value)?.owner !== this) throw new Error('La referencia no fue verificada por esta sesión nativa.')
    return value
  }
  assertMateWitness(value: AssemblyResolvedMateWitness, input: AssemblyDocument): AssemblyResolvedMateWitness {
    if (value.kind === 'arc-path') return this.assertArcPathWitness(value,input)
    if (value.kind === 'line-path') return this.assertLinePathWitness(value,input)
    if (value.kind === 'profile') return this.assertProfileWitness(value, input)
    if (value.kind === 'profile-axis') return this.assertProfileAxisWitness(value, input)
    return value.kind === 'point' ? this.assertPointWitness(value, input) : this.assertWitness(value, input)
  }
  assertPointWitness(value: AssemblyPointWitness, input: AssemblyDocument): AssemblyPointWitness {
    this.#current(input)
    this.#available()
    if (!value || pointWitnesses.get(value)?.owner !== this) throw new Error('El punto no fue verificado por esta sesión nativa.')
    return value
  }
  assertLinePathWitness(value:AssemblyLinePathWitness,input:AssemblyDocument):AssemblyLinePathWitness {
    this.#current(input);this.#available();if(!value||linePathWitnesses.get(value)?.owner!==this)throw new Error('Material line was not issued by this live native snapshot.');return value
  }
  assertArcPathWitness(value: AssemblyArcPathWitness, input: AssemblyDocument): AssemblyArcPathWitness {
    this.#current(input)
    this.#available()
    if (!value || arcPathWitnesses.get(value)?.owner !== this) throw new Error('Material arc was not issued by this live native snapshot.')
    return value
  }
  assertPathCurveWitness(value: AssemblyPathCurveWitness, input: AssemblyDocument): AssemblyPathCurveWitness {
    this.#current(input)
    this.#available()
    if (!value || pathCurveWitnesses.get(value)?.owner !== this) throw new Error('El trayecto no fue verificado por esta sesión nativa.')
    return value
  }
  assertProfileWitness(value: AssemblyProfileWitness, input: AssemblyDocument): AssemblyProfileWitness {
    this.#current(input)
    this.#available()
    if (!value || profileWitnesses.get(value)?.owner !== this) throw new Error('El perfil no fue verificado por esta sesión nativa.')
    return value
  }
  assertProfileAxisWitness(value: AssemblyProfileAxisWitness, input: AssemblyDocument): AssemblyProfileAxisWitness {
    this.#current(input)
    this.#available()
    if (!value || profileAxisWitnesses.get(value)?.owner !== this) throw new Error('El eje de perfil no fue verificado por esta sesión nativa.')
    return value
  }
  dispose(): void {
    if (!this.#alive) return
    this.#alive = false
    const states = [...this.#ownedParts]; this.#ownedParts.clear(); this.#parts.clear()
    const errors: unknown[] = []
    for (const state of states.reverse()) { try { state.engine.dispose() } catch (error) { errors.push(error) } }
    if (errors.length) { this.#pool?.invalidate(); throw new AggregateError(errors, 'Assembly native snapshot release failed.') }
  }
}
