import type { Vec3 } from '../cad/kernel.types'
import { assemblyDefinitionKey, validateAssemblyDocument, type AssemblyComponentReference,
  type AssemblyDocument, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import { validateAssemblyMoveIntent } from './assemblyMovement'
import { composeRigidPoses, identityRigidPose, inverseRigidPose, transformRigidDirection,
  type RigidPose } from './rigidPose'

/** Query admission bound; not a limit on native time or peak memory. */
export const MAX_ASSEMBLY_TRANSLATION_QUERIES = 8192
export interface AssemblyTranslationRequest {
  /** Complete root-relative selection and exact definition tuple. */
  component: AssemblyComponentReference
  /** Absolute WORLD destination of the selection, in millimeters; not a delta. */
  translation: Vec3
}
export interface AssemblyTranslationStopOptions {
  /** Millimeters; zero requests a stop before the numerical contact band. */
  clearance: number
  /** Millimeters; native tracing reports its additional safety terms. */
  lengthTolerance: number
  maxQueries: number
}
export interface AssemblyTranslationLeaf {
  component: AssemblyComponentReference
  /** Declared starting WORLD placement, not a native geometry witness. */
  start: RigidPose
  /** Constant WORLD translation in ideal arithmetic; see arithmeticMagnitude. */
  delta: Vec3
}
export interface AssemblyTranslationPath {
  base: AssemblyDocument
  /** Accepted small rotation differences have been replaced by the original q. */
  target: AssemblyDocument
  /** All active part leaves, including hidden leaves and zero-motion leaves. */
  leaves: AssemblyTranslationLeaf[]
  /**
   * Conditioning scale including local-chain terms before WORLD cancellation.
   * Native callers must compare its roundoff policy with their length tolerance;
   * this is a numeric admission scale, not a certified arithmetic error bound.
   */
  arithmeticMagnitude: number
  /** Fresh detached declaration interpolation; grants no geometry/Apply authority. */
  at(fraction: number): AssemblyDocument
}
type Scope = AssemblyDocument | EmbeddedAssemblyDefinition
function fail(message: string): never { throw new Error('Trayectoria de traslación: ' + message) }
function record(value: unknown, allowed: readonly string[], required: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('se esperaba un objeto de datos simple.')
  const result: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!
    if (typeof key !== 'string' || !allowed.includes(key) || !field.enumerable || !('value' in field)) {
      fail('solo se admiten los campos de datos enumerables declarados, sin accesores.')
    }
    result[key] = field.value
  }
  if (required.some(key => !Object.hasOwn(result, key))) fail('faltan campos obligatorios.')
  return result
}
function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(name + ' debe ser finito.')
  return value
}
function vector(value: number[], name: string): Vec3 {
  if (!value.every(Number.isFinite) || !Number.isFinite(Math.hypot(...value))) fail(name + ' excede la aritmética finita.')
  return value as Vec3
}
function exact(a: readonly number[], b: readonly number[]): boolean { return a.every((value, axis) => Object.is(value, b[axis])) }
function scopes(document: AssemblyDocument): Scope[] {
  return [document, ...document.definitions.filter((value): value is EmbeddedAssemblyDefinition => value.kind === 'assembly')]
}
function declaration(scope: Scope, id: string): string { return JSON.stringify([scope.id, scope.revision, id]) }
function shapeWithoutPoses(document: AssemblyDocument): string {
  // Full document validation bounds and detaches this data before serialization.
  const masked = validateAssemblyDocument(document)
  for (const scope of scopes(masked)) for (const occurrence of scope.occurrences) occurrence.pose = identityRigidPose()
  return JSON.stringify(masked)
}
/** Strict detached syntax only. Selection resolution belongs to the native caller. */
export function validateAssemblyTranslationRequest(value: unknown): AssemblyTranslationRequest {
  const source = record(value, ['component', 'translation'], ['component', 'translation'])
  const move = validateAssemblyMoveIntent({ component: source.component,
    pose: { translation: source.translation, rotation: [0, 0, 0, 1] } })
  return { component: move.component, translation: move.pose.translation }
}
export function validateAssemblyTranslationStopOptions(input?: Partial<AssemblyTranslationStopOptions>): AssemblyTranslationStopOptions {
  const source = input === undefined ? Object.create(null) as Record<string, unknown>
    : record(input, ['clearance', 'lengthTolerance', 'maxQueries'])
  const clearance = finite(Object.hasOwn(source, 'clearance') ? source.clearance : 0, 'La holgura')
  const lengthTolerance = finite(Object.hasOwn(source, 'lengthTolerance') ? source.lengthTolerance : 1e-6, 'La tolerancia')
  const maxQueries = finite(Object.hasOwn(source, 'maxQueries') ? source.maxQueries : 1024, 'El presupuesto de consultas')
  if (clearance < 0 || lengthTolerance <= 0 || !Number.isFinite(clearance + lengthTolerance)) {
    fail('la holgura debe ser no negativa, la tolerancia positiva y su suma finita.')
  }
  if (!Number.isInteger(maxQueries) || maxQueries < 1 || maxQueries > MAX_ASSEMBLY_TRANSLATION_QUERIES) {
    fail('el presupuesto de consultas debe ser entero entre 1 y 8192.')
  }
  return { clearance, lengthTolerance, maxQueries }
}

/**
 * Declaration-only, constant-rotation interpolation. An active declaration is
 * reachable through at least one unsuppressed expansion; shared uses edit the
 * same declaration. Own-suppressed and dormant-only declarations cannot drift.
 * Fixed is local: a fixed child may follow its translated parent unchanged.
 * No mate, BRep, clearance, intermediate native validity or Apply is certified.
 */
export function prepareAssemblyTranslationPath(input: AssemblyDocument, destination: AssemblyDocument,
  angleTolerance = 1e-8): AssemblyTranslationPath {
  finite(angleTolerance, 'La tolerancia angular')
  if (angleTolerance < 0 || angleTolerance >= Math.PI) fail('la tolerancia angular debe estar entre cero y pi radianes, sin incluir pi.')
  const base = validateAssemblyDocument(input), target = validateAssemblyDocument(destination)
  if (shapeWithoutPoses(base) !== shapeWithoutPoses(target)) fail('solo pueden cambiar las poses de declaraciones activas; el grafo y sus datos deben conservarse.')
  const originalScopes = scopes(base), targetScopes = scopes(target)
  const registry = new Map(base.definitions.map(value => [assemblyDefinitionKey(value), value]))
  const active = new Set<string>(), visited = new Set<string>()
  function activate(scope: Scope): void {
    const key = assemblyDefinitionKey(scope)
    if (visited.has(key)) return
    visited.add(key)
    for (const occurrence of scope.occurrences) {
      if (occurrence.suppressed) continue
      active.add(declaration(scope, occurrence.id))
      const definition = registry.get(assemblyDefinitionKey(occurrence.definition))!
      if (definition.kind === 'assembly') activate(definition)
    }
  }
  activate(base)
  const changes: { scope: number; occurrence: number; start: Vec3; delta: Vec3 }[] = []
  for (let scopeIndex = 0; scopeIndex < originalScopes.length; scopeIndex++) {
    const scope = originalScopes[scopeIndex], nextScope = targetScopes[scopeIndex]
    for (let index = 0; index < scope.occurrences.length; index++) {
      const original = scope.occurrences[index], next = nextScope.occurrences[index]
      if (!active.has(declaration(scope, original.id))) {
        if (!exact(original.pose.translation, next.pose.translation) || !exact(original.pose.rotation, next.pose.rotation)) {
          fail('una declaración suprimida o no utilizada cambió de pose.')
        }
        continue
      }
      if (original.fixed && !exact(original.pose.translation, next.pose.translation)) fail('una declaración fijada cambió su traslación local.')
      const relative = composeRigidPoses(inverseRigidPose({ translation: [0, 0, 0], rotation: original.pose.rotation }),
        { translation: [0, 0, 0], rotation: next.pose.rotation }).rotation
      const angle = 2 * Math.atan2(Math.hypot(relative[0], relative[1], relative[2]), Math.abs(relative[3]))
      if (angle > angleTolerance) fail('la trayectoria contiene una rotación que supera la tolerancia angular.')
      next.pose.rotation = [...original.pose.rotation]
      const delta = vector(next.pose.translation.map((value, axis) => value - original.pose.translation[axis]), 'El desplazamiento local')
      changes.push({ scope: scopeIndex, occurrence: index, start: [...original.pose.translation], delta })
    }
  }
  const targetRegistry = new Map(target.definitions.map(value => [assemblyDefinitionKey(value), value]))
  const leaves: AssemblyTranslationLeaf[] = []
  let arithmeticMagnitude = 1
  function walk(scope: Scope, nextScope: Scope, path: string[], startParent: RigidPose,
    endParent: RigidPose, parentDelta: Vec3, deltaMagnitude: number, chainMagnitude: number): void {
    for (let index = 0; index < scope.occurrences.length; index++) {
      const occurrence = scope.occurrences[index], next = nextScope.occurrences[index]
      if (occurrence.suppressed) continue
      const start = composeRigidPoses(startParent, occurrence.pose), end = composeRigidPoses(endParent, next.pose)
      const localDelta = vector(next.pose.translation.map((value, axis) => value - occurrence.pose.translation[axis]), 'El desplazamiento local')
      const shifted = transformRigidDirection(startParent, localDelta)
      const delta = vector(parentDelta.map((value, axis) => value + shifted[axis]), 'El desplazamiento mundial')
      const magnitude = finite(deltaMagnitude + Math.hypot(...localDelta), 'La escala de desplazamiento')
      const localMagnitude = finite(chainMagnitude + Math.hypot(...occurrence.pose.translation)
        + Math.hypot(...next.pose.translation), 'La escala de coordenadas locales')
      const uncombinedDelta = finite(Math.hypot(...parentDelta) + Math.hypot(...shifted), 'La escala de desplazamiento antes de cancelación')
      arithmeticMagnitude = Math.max(arithmeticMagnitude, localMagnitude, magnitude, uncombinedDelta,
        finite(Math.hypot(...start.translation), 'La escala mundial inicial'), finite(Math.hypot(...end.translation), 'La escala mundial final'))
      // Reject a representable requested motion swallowed completely in one
      // WORLD endpoint coordinate. Ignore only rotation-arithmetic noise in the
      // delta itself; this is not a native distance error bound or tolerance.
      const arithmeticNoise = 128 * Number.EPSILON * magnitude
      for (let axis = 0; axis < 3; axis++) {
        if (Math.abs(delta[axis]) > arithmeticNoise && end.translation[axis] === start.translation[axis]) {
          fail('la magnitud mundial pierde un desplazamiento representable; no se puede afirmar esta trayectoria.')
        }
      }
      const nextPath = [...path, occurrence.id], definition = registry.get(assemblyDefinitionKey(occurrence.definition))!
      if (definition.kind === 'part') leaves.push({ component: { occurrencePath: nextPath,
        definition: { id: definition.id, revision: definition.revision } }, start, delta })
      else {
        const nextDefinition = targetRegistry.get(assemblyDefinitionKey(definition))!
        if (nextDefinition.kind !== 'assembly') fail('la definición del destino dejó de ser un ensamblaje.')
        walk(definition, nextDefinition, nextPath, start, end, delta, magnitude, localMagnitude)
      }
    }
  }
  walk(base, target, [], identityRigidPose(), identityRigidPose(), [0, 0, 0], 0, 0)
  // Public DTOs and every at() result have no aliases into these private copies.
  const privateBase = validateAssemblyDocument(base), privateTarget = validateAssemblyDocument(target)
  return { base: validateAssemblyDocument(base), target: validateAssemblyDocument(target), arithmeticMagnitude,
    leaves: leaves.map(leaf => ({ component: { occurrencePath: [...leaf.component.occurrencePath], definition: { ...leaf.component.definition } },
      start: { translation: [...leaf.start.translation], rotation: [...leaf.start.rotation] }, delta: [...leaf.delta] })),
    at(fraction: number): AssemblyDocument {
      finite(fraction, 'La fracción')
      if (fraction < 0 || fraction > 1) fail('la fracción debe estar entre cero y uno.')
      if (fraction === 0) return validateAssemblyDocument(privateBase)
      if (fraction === 1) return validateAssemblyDocument(privateTarget)
      const result = validateAssemblyDocument(privateBase), resultScopes = scopes(result)
      for (const change of changes) resultScopes[change.scope].occurrences[change.occurrence].pose.translation = vector(
        change.start.map((value, axis) => value + fraction * change.delta[axis]), 'La interpolación local')
      return result
    } }
}
