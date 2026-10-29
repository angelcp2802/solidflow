import type { BodyOperation, BodyPatternOperation, BodyReference, EdgeReference, EdgeSelection, ExtrudeEndCondition, FaceReference, Feature, HoleEndCondition, HoleHead, HolePosition, LinearPatternDirection, LoftSection, PatternSource, Plane, PlaneSupport, Profile, RepetitionFeature, RevolutionAxis, RevolutionExtent, SketchSupport, SweepPathSegment, Vec3 } from '../cad/kernel.types'
import { isEdgeReferenceKeyV2, isFaceReferenceKeyV2 } from '../cad/kernel.semantic-references'
import { validateEntityProfile } from '../sketch/validation'
import { featureDependencyIds, featureSketchIds } from './featureInputs'
import { validateStepSource } from './stepSource'
import { bodyReferenceCreationFeatureId, createdBodyIds, featureBodyOutputIncludes, featureBodyReferences, featureBodyReferencePaths } from './bodyReferences'
import { featureRevolutionAxisBodyReferences } from './revolutionAxisReferences'
import { captureOwnDataRecord } from './ownDataRecord'
import { mergeThinWallDraft, readThinWall } from '../cad/thinWall'
import { readSecondDirection, readSecondDirectionDraft } from '../cad/extrusionDirection'
import { bodyPatternAddresses, MAX_CREATED_BODY_IDS, validateBodyPatternDeclaration } from './bodyPatterns'
import { validateFeaturePatternDeclaration, type FeaturePatternOperation } from './featurePatterns'
import { validateNamedViews, type NamedView } from './namedViews'

export interface Document {
  version: 1
  id: string
  name: string
  units: 'mm'
  features: Feature[]
  createdAt: string
  updatedAt: string
  namedViews?: NamedView[]
}

export type SolidDocument = Document

const MAX_FEATURES = 2000
const MAX_IMPORTED_BODIES_DOCUMENT_BYTES = 20 * 1024 * 1024
const MAX_DIMENSION = 100_000
const MAX_COORDINATE = 1_000_000
const MIN_DIMENSION = 0.01
const MAX_SELECTED_EDGES = 4096
export const MAX_SELECTED_FACES = 256
export const MAX_HOLE_POSITIONS = 128
const MAX_PATTERN_INSTANCES = 256
export const MAX_BODY_OPERANDS = 256

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`)
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'se esperaba un objeto')
  }
  return value as Record<string, unknown>
}

function keys(value: Record<string, unknown>, allowed: string[], path: string, optional: string[] = []): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key) && !optional.includes(key)) fail(`${path}.${key}`, 'campo desconocido')
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'campo obligatorio')
  }
}

function string(value: unknown, path: string, maxLength = 200): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    fail(path, `se esperaba texto de entre 1 y ${maxLength} caracteres`)
  }
  return value
}

function number(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(path, `se esperaba un número finito entre ${min} y ${max}`)
  }
  return value
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'se esperaba verdadero o falso')
  return value
}

function entityIdentifier(value: unknown, path: string): string {
  const id = string(value, path, 128)
  if (/[\x00-\x1f\x7f]/.test(id)) fail(path, 'identificador con caracteres de control')
  return id
}

function boundedArray(value: unknown, path: string, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    fail(path, `se esperaba una lista de entre ${minimum} y ${maximum} elementos`)
  }
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) fail(`${path}[${index}]`, 'elemento obligatorio')
  }
  return value
}

function bodyReference(value: unknown, path: string): BodyReference {
  const source = object(value, path)
  keys(source, ['bodyId', 'sourceFeatureId'], path)
  return {
    bodyId: entityIdentifier(source.bodyId, `${path}.bodyId`),
    sourceFeatureId: entityIdentifier(source.sourceFeatureId, `${path}.sourceFeatureId`),
  }
}

function bodyReferences(value: unknown, path: string, minimum = 1, maximum = MAX_BODY_OPERANDS): BodyReference[] {
  const seen = new Set<string>()
  return boundedArray(value, path, minimum, maximum).map((value, index) => {
    const location = `${path}[${index}]`, reference = bodyReference(value, location)
    if (seen.has(reference.bodyId)) fail(`${location}.bodyId`, 'cuerpo duplicado')
    seen.add(reference.bodyId)
    return reference
  })
}

function bodyOperation(value: unknown, path: string): BodyOperation {
  const source = object(value, path)
  if (source.mode === 'new') {
    keys(source, ['mode', 'bodyId'], path)
    return { mode: 'new', bodyId: entityIdentifier(source.bodyId, `${path}.bodyId`) }
  }
  if (source.mode === 'merge') {
    keys(source, ['mode', 'target'], path)
    return { mode: 'merge', target: bodyReference(source.target, `${path}.target`) }
  }
  return fail(`${path}.mode`, 'operación de cuerpo desconocida')
}

/** Legacy merge remains explicit; contradictory body modes are never guessed. */
function bodyMergeOptions(source: Record<string, unknown>, path: string): { merge: boolean; bodyOperation?: BodyOperation } {
  const merge = boolean(source.merge, `${path}.merge`)
  if (!Object.hasOwn(source, 'bodyOperation')) return { merge }
  const operation = bodyOperation(source.bodyOperation, `${path}.bodyOperation`)
  if (merge !== (operation.mode === 'merge')) fail(`${path}.merge`, 'debe coincidir con la operación explícita de cuerpo')
  return { merge, bodyOperation: operation }
}

function bodyReferencePath(feature: Feature, index: number, path: string): string {
  if ((feature.type === 'linearPattern' || feature.type === 'circularPattern' || feature.type === 'mirror') && feature.featurePattern) {
    const count = feature.featurePattern.bindings.length
    return index < count ? `${path}.featurePattern.bindings[${index}].source` : `${path}.featurePattern.targets[${index - count}]`
  }
  if ((feature.type === 'linearPattern' || feature.type === 'circularPattern' || feature.type === 'mirror') && feature.source.mode === 'bodies') {
    return index < feature.source.bodies.length ? `${path}.source.bodies[${index}]` : `${path}.bodyPattern.target`
  }
  if (feature.type === 'combine') {
    return feature.operation === 'subtract' ? `${path}.${index === 0 ? 'target' : `tools[${index - 1}]`}`
      : `${path}.operands[${index}]`
  }
  if (feature.type === 'extrude' && feature.bodyOperation?.mode === 'new') return `${path}.${featureBodyReferencePaths(feature)[index]}`
  if (feature.type === 'extrude' || feature.type === 'revolve' || feature.type === 'sweep' || feature.type === 'loft') return `${path}.bodyOperation.target`
  return `${path}.bodyScope${feature.type === 'cut' || feature.type === 'revolvedCut' || feature.type === 'hole' ? `[${index}]` : ''}`
}

function integer(value: unknown, path: string, minimum: number, maximum: number): number {
  const result = number(value, path, minimum, maximum)
  if (!Number.isInteger(result)) fail(path, 'se esperaba un número entero')
  return result
}

function vector(value: unknown, path: string, direction = false): Vec3 {
  const coordinates = boundedArray(value, path, 3, 3)
    .map((coordinate, index) => number(coordinate, `${path}[${index}]`, -MAX_COORDINATE, MAX_COORDINATE)) as Vec3
  if (direction && Math.hypot(...coordinates) === 0) fail(path, 'la dirección no puede ser nula')
  return coordinates
}

function patternSource(value: unknown, path: string): PatternSource {
  const source = object(value, path)
  if (source.mode === 'bodies') {
    keys(source, ['mode', 'scope', 'bodies'], path)
    if (source.scope !== 'current' && source.scope !== 'historical') fail(`${path}.scope`, 'ámbito de cuerpos desconocido')
    return { mode: 'bodies', scope: source.scope, bodies: bodyReferences(source.bodies, `${path}.bodies`, 1, 32) }
  }
  if (source.mode === 'body') {
    keys(source, ['mode', 'sourceFeatureId'], path)
    return { mode: 'body', sourceFeatureId: entityIdentifier(source.sourceFeatureId, `${path}.sourceFeatureId`) }
  }
  if (source.mode === 'features') {
    keys(source, ['mode', 'geometryPattern', 'featureIds'], path)
    if (typeof source.geometryPattern !== 'boolean') fail(`${path}.geometryPattern`, 'el método de repetición debe ser explícito')
    const seen = new Set<string>()
    const featureIds = boundedArray(source.featureIds, `${path}.featureIds`, 1, 32).map((value, index) => {
      const location = `${path}.featureIds[${index}]`
      const id = entityIdentifier(value, location)
      if (seen.has(id)) fail(location, 'operación semilla duplicada')
      seen.add(id)
      return id
    })
    return { mode: 'features', geometryPattern: source.geometryPattern, featureIds }
  }
  return fail(`${path}.mode`, 'modo de repetición desconocido')
}

function checkPatternApplications(source: PatternSource, copies: number, path: string): void {
  const seedCount = source.mode === 'features' ? source.featureIds.length : source.mode === 'bodies' ? source.bodies.length : 1
  if (copies * seedCount > 512) fail(path, 'la repetición supera el límite de 512 aplicaciones de semillas')
}

function repetitionBodyOptions<T extends RepetitionFeature>(parsed: T, source: Record<string, unknown>, path: string): T {
  // Check the original declaration before a clone can erase inherited fields.
  if (parsed.source.mode === 'features' && parsed.source.geometryPattern === false && !Object.hasOwn(source, 'featurePattern')) {
    fail(path + '.source.geometryPattern', 'el recálculo requiere una declaración explícita con destinos y rutas')
  }
  try { validateFeaturePatternDeclaration(source as unknown as RepetitionFeature) }
  catch (error) { fail(`${path}.featurePattern`, error instanceof Error ? error.message : String(error)) }
  const bodyResult = Object.hasOwn(source, 'bodyPattern')
    ? { ...parsed, bodyPattern: structuredClone(source.bodyPattern) as BodyPatternOperation } : parsed
  const result = Object.hasOwn(source, 'featurePattern')
    ? { ...bodyResult, featurePattern: structuredClone(source.featurePattern) as FeaturePatternOperation } : bodyResult
  try { validateBodyPatternDeclaration(result) }
  catch (error) { fail(`${path}.bodyPattern`, error instanceof Error ? error.message : String(error)) }
  try { validateFeaturePatternDeclaration(result) }
  catch (error) { fail(`${path}.featurePattern`, error instanceof Error ? error.message : String(error)) }
  return result
}

function linearDirection(value: unknown, path: string): LinearPatternDirection {
  const source = object(value, path)
  keys(source, ['direction', 'spacing', 'count'], path)
  return {
    direction: vector(source.direction, `${path}.direction`, true),
    spacing: number(source.spacing, `${path}.spacing`, MIN_DIMENSION, MAX_DIMENSION),
    count: integer(source.count, `${path}.count`, 1, MAX_PATTERN_INSTANCES),
  }
}

function linearSkips(value: unknown, path: string, firstCount: number, secondCount: number, seedOnly: boolean): [number, number][] {
  const total = seedOnly ? firstCount + secondCount - 1 : firstCount * secondCount
  if (total < 2 || total > MAX_PATTERN_INSTANCES) {
    fail(path, `la matriz debe contener entre 2 y ${MAX_PATTERN_INSTANCES} instancias contando la semilla`)
  }
  const seen = new Set<string>()
  const skipped = boundedArray(value, path, 0, total - 1).map((value, index): [number, number] => {
    const location = `${path}[${index}]`
    const address = boundedArray(value, location, 2, 2)
    const i = integer(address[0], `${location}[0]`, 0, firstCount - 1)
    const j = integer(address[1], `${location}[1]`, 0, secondCount - 1)
    if (i === 0 && j === 0) fail(location, 'no se puede omitir la semilla')
    if (seedOnly && i !== 0 && j !== 0) fail(location, 'esta instancia no existe al repetir solo la semilla en la segunda dirección')
    const key = `${i}:${j}`
    if (seen.has(key)) fail(location, 'instancia omitida duplicada')
    seen.add(key)
    return [i, j]
  })
  if (skipped.length === total - 1) fail(path, 'no se pueden omitir todas las copias')
  return skipped
}

function circularSkips(value: unknown, path: string, count: number): number[] {
  const seen = new Set<number>()
  const skipped = boundedArray(value, path, 0, count - 1).map((value, index) => {
    const location = `${path}[${index}]`
    const instance = integer(value, location, 1, count - 1)
    if (seen.has(instance)) fail(location, 'instancia omitida duplicada')
    seen.add(instance)
    return instance
  })
  if (skipped.length === count - 1) fail(path, 'no se pueden omitir todas las copias')
  return skipped
}

function sweepPath(value: unknown, path: string): SweepPathSegment[] {
  const seen = new Set<string>()
  return boundedArray(value, path, 1, 128).map((value, index) => {
    const location = `${path}[${index}]`
    const segment = object(value, location)
    keys(segment, ['entityId', 'reversed'], location)
    const entityId = entityIdentifier(segment.entityId, `${location}.entityId`)
    if (seen.has(entityId)) fail(`${location}.entityId`, 'entidad de trayectoria duplicada')
    seen.add(entityId)
    return { entityId, reversed: boolean(segment.reversed, `${location}.reversed`) }
  })
}

function loftSections(value: unknown, path: string): LoftSection[] {
  const seen = new Set<string>()
  return boundedArray(value, path, 2, 32).map((value, index) => {
    const location = `${path}[${index}]`
    const section = object(value, location)
    keys(section, ['sketchId', 'startEntityId', 'reversed'], location)
    const sketchId = string(section.sketchId, `${location}.sketchId`, 128)
    if (seen.has(sketchId)) fail(`${location}.sketchId`, 'croquis de sección duplicado')
    seen.add(sketchId)
    return {
      sketchId,
      startEntityId: section.startEntityId === null ? null : entityIdentifier(section.startEntityId, `${location}.startEntityId`),
      reversed: boolean(section.reversed, `${location}.reversed`),
    }
  })
}

function timestamp(value: unknown, path: string): string {
  const text = string(value, path, 40)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text)) {
    fail(path, 'se esperaba una fecha ISO UTC')
  }
  const parsed = new Date(text)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== text) {
    fail(path, 'fecha no válida')
  }
  return text
}

function profile(value: unknown, path: string): Profile {
  const source = object(value, path)
  if (source.kind === 'entities') return validateEntityProfile(source, path)
  if (source.kind !== 'rectangle' && source.kind !== 'circle') {
    fail(`${path}.kind`, 'perfil desconocido')
  }
  keys(source, source.kind === 'rectangle' ? ['kind', 'center', 'width', 'height'] : ['kind', 'center', 'radius'], path)
  if (!Array.isArray(source.center) || source.center.length !== 2) {
    fail(`${path}.center`, 'se esperaban dos coordenadas')
  }
  const center: [number, number] = [
    number(source.center[0], `${path}.center[0]`, -MAX_COORDINATE, MAX_COORDINATE),
    number(source.center[1], `${path}.center[1]`, -MAX_COORDINATE, MAX_COORDINATE),
  ]
  if (source.kind === 'circle') {
    return { kind: 'circle', center, radius: number(source.radius, `${path}.radius`, MIN_DIMENSION, MAX_DIMENSION) }
  }
  return {
    kind: 'rectangle', center,
    width: number(source.width, `${path}.width`, MIN_DIMENSION, MAX_DIMENSION),
    height: number(source.height, `${path}.height`, MIN_DIMENSION, MAX_DIMENSION),
  }
}

function edgeReference(value: unknown, path: string): EdgeReference {
  const source = object(value, path)
  keys(source, ['sourceFeatureId', 'key'], path)
  const key = string(source.key, `${path}.key`, 4096)
  const semantic = isEdgeReferenceKeyV2(key)
  if ((!semantic && (!key.startsWith('edge-v1|') || key.length <= 'edge-v1|'.length)) || /[\x00-\x1f\x7f]/.test(key)) {
    fail(`${path}.key`, 'referencia de arista no compatible')
  }
  const sourceFeatureId = semantic ? entityIdentifier(source.sourceFeatureId, `${path}.sourceFeatureId`)
    : string(source.sourceFeatureId, `${path}.sourceFeatureId`, 128)
  return { sourceFeatureId, key }
}

function faceReference(value: unknown, path: string): FaceReference {
  const source = object(value, path)
  keys(source, ['sourceFeatureId', 'key'], path)
  const key = string(source.key, `${path}.key`, 4096)
  const semantic = isFaceReferenceKeyV2(key)
  if ((!semantic && (!key.startsWith('face-v1|') || key.length <= 'face-v1|'.length)) || /[\x00-\x1f\x7f]/.test(key)) {
    fail(`${path}.key`, 'referencia de cara no compatible')
  }
  const sourceFeatureId = semantic ? entityIdentifier(source.sourceFeatureId, `${path}.sourceFeatureId`)
    : string(source.sourceFeatureId, `${path}.sourceFeatureId`, 128)
  return { sourceFeatureId, key }
}

function faceSelection(value: unknown, baseFeatureId: string, path: string, allowEmpty: boolean): FaceReference[] {
  const seen = new Set<string>()
  return boundedArray(value, path, allowEmpty ? 0 : 1, MAX_SELECTED_FACES).map((value, index) => {
    const location = `${path}[${index}]`
    const face = faceReference(value, location)
    if (face.sourceFeatureId !== baseFeatureId) fail(`${location}.sourceFeatureId`, 'la cara debe pertenecer a la operación base')
    if (seen.has(face.key)) fail(`${location}.key`, 'cara duplicada')
    seen.add(face.key)
    return face
  })
}

function support(value: unknown, path: string, allowPrincipal: true): PlaneSupport
function support(value: unknown, path: string, allowPrincipal: false): SketchSupport
function support(value: unknown, path: string, allowPrincipal: boolean): PlaneSupport {
  const source = object(value, path)
  if (source.kind === 'plane') {
    keys(source, ['kind', 'planeId'], path)
    return { kind: 'plane', planeId: string(source.planeId, `${path}.planeId`, 128) }
  }
  if (source.kind === 'face') {
    keys(source, ['kind', 'face'], path)
    return { kind: 'face', face: faceReference(source.face, `${path}.face`) }
  }
  if (source.kind === 'principal' && allowPrincipal) {
    keys(source, ['kind', 'plane'], path)
    if (!['XY', 'XZ', 'YZ'].includes(source.plane as string)) fail(`${path}.plane`, 'plano desconocido')
    return { kind: 'principal', plane: source.plane as Plane }
  }
  return fail(`${path}.kind`, 'soporte desconocido')
}

function extrudeEndCondition(value: unknown, path: string): ExtrudeEndCondition {
  const source = object(value, path)
  if (source.kind === 'throughAll') {
    keys(source, ['kind', 'baseFeatureId', 'bothDirections'], path, ['baseBody'])
    return {
      kind: 'throughAll', baseFeatureId: entityIdentifier(source.baseFeatureId, `${path}.baseFeatureId`),
      bothDirections: boolean(source.bothDirections, `${path}.bothDirections`),
      ...(Object.hasOwn(source, 'baseBody') ? { baseBody: bodyReference(source.baseBody, `${path}.baseBody`) } : {}),
    }
  }
  if (source.kind === 'untilNext') {
    keys(source, ['kind', 'baseFeatureId'], path, ['baseBody'])
    return { kind: 'untilNext', baseFeatureId: entityIdentifier(source.baseFeatureId, `${path}.baseFeatureId`),
      ...(Object.hasOwn(source, 'baseBody') ? { baseBody: bodyReference(source.baseBody, `${path}.baseBody`) } : {}) }
  }
  if (source.kind === 'upToSurface') {
    keys(source, ['kind', 'target'], path)
    return { kind: 'upToSurface', target: support(source.target, `${path}.target`, true) }
  }
  return fail(`${path}.kind`, 'condición final desconocida')
}

function holePositions(value: unknown, path: string): HolePosition[] {
  const seen = new Set<string>()
  return boundedArray(value, path, 1, MAX_HOLE_POSITIONS).map((value, index) => {
    const location = `${path}[${index}]`
    const source = object(value, location)
    keys(source, ['id', 'x', 'y'], location)
    const id = entityIdentifier(source.id, `${location}.id`)
    if (seen.has(id)) fail(`${location}.id`, 'identificador de posición duplicado')
    seen.add(id)
    return {
      id,
      x: number(source.x, `${location}.x`, -MAX_COORDINATE, MAX_COORDINATE),
      y: number(source.y, `${location}.y`, -MAX_COORDINATE, MAX_COORDINATE),
    }
  })
}

function holeEndCondition(value: unknown, path: string): HoleEndCondition {
  const source = object(value, path)
  if (source.kind === 'throughAll' || source.kind === 'untilNext') {
    keys(source, ['kind'], path)
    return { kind: source.kind }
  }
  if (source.kind !== 'blind') return fail(`${path}.kind`, 'condición final de taladro desconocida')
  keys(source, ['kind', 'depth', 'depthReference', 'tip'], path)
  const depth = number(source.depth, `${path}.depth`, MIN_DIMENSION, MAX_DIMENSION)
  if (source.depthReference !== 'shoulder' && source.depthReference !== 'tip') {
    fail(`${path}.depthReference`, 'referencia de profundidad de taladro desconocida')
  }
  const tip = object(source.tip, `${path}.tip`)
  if (tip.kind === 'flat') {
    keys(tip, ['kind'], `${path}.tip`)
    return { kind: 'blind', depth, depthReference: source.depthReference, tip: { kind: 'flat' } }
  }
  if (tip.kind === 'conical') {
    keys(tip, ['kind', 'angle'], `${path}.tip`)
    return {
      kind: 'blind', depth, depthReference: source.depthReference,
      tip: { kind: 'conical', angle: number(tip.angle, `${path}.tip.angle`, 1, 179) },
    }
  }
  return fail(`${path}.tip.kind`, 'punta de taladro desconocida')
}

function holeHead(value: unknown, path: string): HoleHead {
  const source = object(value, path)
  if (source.kind === 'simple') {
    keys(source, ['kind'], path)
    return { kind: 'simple' }
  }
  if (source.kind === 'counterbore') {
    keys(source, ['kind', 'diameter', 'depth'], path)
    return {
      kind: 'counterbore', diameter: number(source.diameter, `${path}.diameter`, MIN_DIMENSION, MAX_DIMENSION),
      depth: number(source.depth, `${path}.depth`, MIN_DIMENSION, MAX_DIMENSION),
    }
  }
  if (source.kind === 'countersink') {
    keys(source, ['kind', 'diameter', 'angle'], path)
    return {
      kind: 'countersink', diameter: number(source.diameter, `${path}.diameter`, MIN_DIMENSION, MAX_DIMENSION),
      angle: number(source.angle, `${path}.angle`, 1, 179),
    }
  }
  return fail(`${path}.kind`, 'entrada de taladro desconocida')
}

/** Axial length from a radial change and the included cone angle, in millimetres. */
function coneDepth(radialChange: number, angle: number): number {
  return radialChange / Math.tan(angle * Math.PI / 360)
}

function checkHoleDimensions(diameter: number, endCondition: HoleEndCondition, head: HoleHead, path: string): void {
  if (head.kind !== 'simple' && head.diameter <= diameter) {
    fail(`${path}.head.diameter`, 'debe ser mayor que el diámetro del taladro')
  }
  if (endCondition.kind !== 'blind') return
  const cylinderDepth = endCondition.depth - (endCondition.depthReference === 'tip' && endCondition.tip.kind === 'conical'
    ? coneDepth(diameter / 2, endCondition.tip.angle) : 0)
  if (cylinderDepth <= 0) {
    fail(`${path}.endCondition.depth`, 'la profundidad hasta la punta debe dejar un tramo cilíndrico positivo')
  }
  if (head.kind === 'simple') return
  const headDepth = head.kind === 'counterbore' ? head.depth : coneDepth((head.diameter - diameter) / 2, head.angle)
  // Equal mathematical depths may differ by a few floating-point units after tan().
  const roundingTolerance = Number.EPSILON * 16 * Math.max(1, cylinderDepth, headDepth)
  if (headDepth - cylinderDepth > roundingTolerance) {
    fail(`${path}.head.${head.kind === 'counterbore' ? 'depth' : 'angle'}`, 'la entrada no puede superar la profundidad del tramo cilíndrico')
  }
}

function checkSupportReference(target: PlaneSupport, seen: Map<string, Feature>, path: string): void {
  if (target.kind === 'plane' && seen.get(target.planeId)?.type !== 'plane') {
    fail(`${path}.planeId`, 'debe referenciar un plano de referencia anterior')
  }
  if (target.kind === 'face') {
    const owner = seen.get(target.face.sourceFeatureId)
    if (!owner || owner.type === 'sketch' || owner.type === 'plane') {
      fail(`${path}.face.sourceFeatureId`, 'debe referenciar una operación sólida anterior')
    }
  }
}

function edgeSelection(value: unknown, baseFeatureId: string, path: string): EdgeSelection {
  const source = object(value, path)
  if (source.mode === 'all') {
    keys(source, ['mode'], path)
    return { mode: 'all' }
  }
  if (source.mode !== 'selected') fail(`${path}.mode`, 'modo de selección desconocido')
  keys(source, ['mode', 'edges'], path)
  if (!Array.isArray(source.edges) || source.edges.length === 0 || source.edges.length > MAX_SELECTED_EDGES) {
    fail(`${path}.edges`, `selecciona entre 1 y ${MAX_SELECTED_EDGES} aristas`)
  }
  const seen = new Set<string>()
  const edges = Array.from(source.edges).map((value, index) => {
    const parsed = edgeReference(value, `${path}.edges[${index}]`)
    if (parsed.sourceFeatureId !== baseFeatureId) {
      fail(`${path}.edges[${index}].sourceFeatureId`, 'la arista debe pertenecer a la operación base')
    }
    if (seen.has(parsed.key)) fail(`${path}.edges[${index}].key`, 'arista duplicada')
    seen.add(parsed.key)
    return parsed
  })
  return { mode: 'selected', edges }
}

/** Check the entire new import payload before hashing any individual source. */
function preflightImportedBodies(source: Record<string, unknown>, path: string): void {
  const dataRecord = (value: unknown, fields: string[], location: string): Record<string, unknown> => {
    const record = object(value, location)
    if (Object.getPrototypeOf(record) !== Object.prototype && Object.getPrototypeOf(record) !== null) fail(location, 'objeto de datos no válido')
    if (Reflect.ownKeys(record).length !== fields.length) fail(location, 'campos de datos no válidos')
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(record, field)
      if (!descriptor?.enumerable || !('value' in descriptor)) fail(location + '.' + field, 'se esperaba un campo de datos propio')
    }
    return record
  }
  dataRecord(source, ['id', 'name', 'type', 'suppressed', 'bodies'], path)
  const bodies = boundedArray(source.bodies, path + '.bodies', 1, MAX_BODY_OPERANDS)
  if (Object.getPrototypeOf(bodies) !== Array.prototype || Reflect.ownKeys(bodies).length !== bodies.length + 1) fail(path + '.bodies', 'lista de datos densa no válida')
  let encodedBytes = 0
  for (let index = 0; index < bodies.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(bodies, String(index))
    if (!descriptor?.enumerable || !('value' in descriptor)) fail(path + '.bodies', 'lista de datos densa no válida')
    const location = `${path}.bodies[${index}]`
    const body = dataRecord(descriptor.value, ['bodyId', 'source'], location)
    const step = dataRecord(body.source, ['format', 'encoding', 'data', 'sha256'], location + '.source')
    if (typeof step.data !== 'string') fail(location + '.source.data', 'se esperaba base64')
    encodedBytes += step.data.length
    if (encodedBytes > MAX_IMPORTED_BODIES_DOCUMENT_BYTES) fail(path, 'las fuentes importadas superan 20 MiB')
  }
}

/** Detached strict declaration for direct kernel callers; no native authority. */
export function validateImportedBodiesFeature(value: unknown, path = 'Cuerpos importados'): Extract<Feature, { type: 'importedBodies' }> {
  const source = object(value, path)
  preflightImportedBodies(source, path)
  if (source.type !== 'importedBodies') fail(path + '.type', 'se esperaba importedBodies')
  const parsed = feature(source, path)
  if (parsed.type !== 'importedBodies') fail(path + '.type', 'se esperaba importedBodies')
  return parsed
}

function revolutionAxis(value: unknown, path: string): RevolutionAxis {
  const source = Object.fromEntries(captureOwnDataRecord(value,
    ['kind', 'axis', 'entityId', 'sketchId', 'edge', 'body'], ['kind'], path))
  if (source.kind === 'sketch-axis') {
    keys(source, ['kind', 'axis'], path)
    if (source.axis !== 'x' && source.axis !== 'y') fail(`${path}.axis`, 'se esperaba el eje local x o y')
    return { kind: 'sketch-axis', axis: source.axis }
  }
  if (source.kind === 'sketch-line') {
    keys(source, ['kind', 'entityId'], path)
    return { kind: 'sketch-line', entityId: entityIdentifier(source.entityId, `${path}.entityId`) }
  }
  if (source.kind === 'principal-axis') {
    keys(source, ['kind', 'axis'], path)
    if (source.axis !== 'X' && source.axis !== 'Y' && source.axis !== 'Z') fail(`${path}.axis`, 'se esperaba el eje principal X, Y o Z')
    return { kind: 'principal-axis', axis: source.axis }
  }
  if (source.kind === 'external-sketch-line') {
    keys(source, ['kind', 'sketchId', 'entityId'], path)
    return { kind: 'external-sketch-line', sketchId: entityIdentifier(source.sketchId, `${path}.sketchId`),
      entityId: entityIdentifier(source.entityId, `${path}.entityId`) }
  }
  if (source.kind === 'linear-edge') {
    keys(source, ['kind', 'edge', 'body'], path)
    const edge = edgeReference(Object.fromEntries(captureOwnDataRecord(source.edge,
      ['sourceFeatureId', 'key'], undefined, `${path}.edge`)), `${path}.edge`)
    const body = source.body === null ? null : bodyReference(Object.fromEntries(captureOwnDataRecord(source.body,
      ['bodyId', 'sourceFeatureId'], undefined, `${path}.body`)), `${path}.body`)
    if (body && body.sourceFeatureId !== edge.sourceFeatureId) fail(`${path}.body.sourceFeatureId`, 'la arista y su cuerpo deben pertenecer al mismo estado')
    return { kind: 'linear-edge', edge, body }
  }
  return fail(`${path}.kind`, 'eje de revolución desconocido')
}

function revolutionExtent(value: unknown, path: string): RevolutionExtent {
  const source = object(value, path)
  if (source.kind === 'two-directions') {
    keys(source, ['kind', 'secondAngle'], path)
    return { kind: 'two-directions', secondAngle: number(source.secondAngle, `${path}.secondAngle`, 0, 360) }
  }
  if (source.kind === 'mid-plane') {
    keys(source, ['kind'], path)
    return { kind: 'mid-plane' }
  }
  return fail(`${path}.kind`, 'extensión de revolución desconocida')
}

function feature(value: unknown, path: string): Feature {
  const source = object(value, path)
  const typeDescriptor = Object.getOwnPropertyDescriptor(source, 'type')
  if (!typeDescriptor || !('value' in typeDescriptor)) fail(path + '.type', 'se esperaba un campo de datos propio')
  if (typeDescriptor?.value === 'importedBodies') preflightImportedBodies(source, path)
  const baseKeys = ['id', 'name', 'type', 'suppressed']
  const base = {
    id: string(source.id, `${path}.id`, 128),
    name: string(source.name, `${path}.name`),
    suppressed: boolean(source.suppressed, `${path}.suppressed`),
  }
  if (source.type === 'importedSolid') {
    keys(source, [...baseKeys, 'source'], path)
    return { ...base, type: 'importedSolid', source: validateStepSource(source.source, `${path}.source`) }
  }
  if (source.type === 'importedBodies') {
    keys(source, [...baseKeys, 'bodies'], path)
    const bodies = boundedArray(source.bodies, path + '.bodies', 1, MAX_BODY_OPERANDS)
    const ids = new Set<string>()
    return { ...base, type: 'importedBodies', bodies: bodies.map((value, index) => {
      const location = `${path}.bodies[${index}]`, body = object(value, location)
      const bodyId = entityIdentifier(body.bodyId, location + '.bodyId')
      if (ids.has(bodyId)) fail(location + '.bodyId', 'identificador de cuerpo duplicado')
      ids.add(bodyId)
      return { bodyId, source: validateStepSource(body.source, location + '.source') }
    }) }
  }
  if (source.type === 'sketch') {
    keys(source, [...baseKeys, 'plane', 'offset', 'profile'], path, ['support'])
    if (!['XY', 'XZ', 'YZ'].includes(source.plane as string)) {
      fail(`${path}.plane`, 'plano desconocido')
    }
    return {
      ...base, type: 'sketch', plane: source.plane as Plane,
      offset: number(source.offset, `${path}.offset`, -MAX_COORDINATE, MAX_COORDINATE),
      profile: profile(source.profile, `${path}.profile`),
      ...(source.support === undefined ? {} : { support: support(source.support, `${path}.support`, false) }),
    }
  }
  if (source.type === 'plane') {
    keys(source, [...baseKeys, 'support', 'offset', 'reversed'], path)
    return { ...base, type: 'plane', support: support(source.support, `${path}.support`, true),
      offset: number(source.offset, `${path}.offset`, -MAX_COORDINATE, MAX_COORDINATE),
      reversed: boolean(source.reversed, `${path}.reversed`) }
  }
  if (source.type === 'extrude' || source.type === 'cut') {
    keys(source, [...baseKeys, 'sketchId', 'depth', 'symmetric'], path,
      ['endCondition', 'thinWall', 'secondDirection', source.type === 'extrude' ? 'bodyOperation' : 'bodyScope'])
    const thinWall = readThinWall(source, `${path}.thinWall`)
    const secondDirection = readSecondDirection(source, `${path}.secondDirection`)
    const depth = number(source.depth, `${path}.depth`, -MAX_DIMENSION, MAX_DIMENSION)
    if (Math.abs(depth) < MIN_DIMENSION) fail(`${path}.depth`, `el valor absoluto debe ser al menos ${MIN_DIMENSION}`)
    const symmetric = boolean(source.symmetric, `${path}.symmetric`)
    const endCondition = source.endCondition === undefined ? undefined : extrudeEndCondition(source.endCondition, `${path}.endCondition`)
    const operation = source.type === 'extrude' && Object.hasOwn(source, 'bodyOperation')
      ? bodyOperation(source.bodyOperation, `${path}.bodyOperation`) : undefined
    if (symmetric && endCondition) fail(`${path}.symmetric`, 'el plano medio solo admite una profundidad definida')
    for (const [limit, locator] of [[endCondition, 'endCondition'], [secondDirection?.endCondition, 'secondDirection.endCondition']] as const) {
      if (!limit || limit.kind === 'upToSurface') continue
      if (operation?.mode === 'new') {
        if (!limit.baseBody) fail(`${path}.${locator}.baseBody`, 'el cuerpo nuevo requiere un cuerpo base explícito')
        if (limit.baseBody.sourceFeatureId !== limit.baseFeatureId) {
          fail(`${path}.${locator}.baseBody.sourceFeatureId`, 'debe coincidir con la operación base de la condición final')
        }
      } else if (limit.baseBody) {
        fail(`${path}.${locator}.baseBody`, 'solo se admite al crear un cuerpo nuevo')
      }
    }
    const definition = {
      ...base,
      sketchId: string(source.sketchId, `${path}.sketchId`, 128),
      depth,
      symmetric,
      ...(endCondition ? { endCondition } : {}),
      ...(thinWall ? { thinWall } : {}),
      ...(secondDirection ? { secondDirection } : {}),
    }
    return source.type === 'extrude' ? {
      ...definition, type: 'extrude',
      ...(operation ? { bodyOperation: operation } : {}),
    } : {
      ...definition, type: 'cut',
      ...(Object.hasOwn(source, 'bodyScope') ? { bodyScope: bodyReferences(source.bodyScope, `${path}.bodyScope`) } : {}),
    }
  }
  if (source.type === 'revolve' || source.type === 'revolvedCut') {
    keys(source, [...baseKeys, 'sketchId', 'angle'], path, [source.type === 'revolve' ? 'bodyOperation' : 'bodyScope', 'axis', 'reversed', 'extent', 'thinWall'])
    const thinWall = readThinWall(source, `${path}.thinWall`)
    const extent = Object.hasOwn(source, 'extent') ? revolutionExtent(source.extent, `${path}.extent`) : undefined
    const angle = number(source.angle, `${path}.angle`, extent?.kind === 'two-directions' ? 0 : Number.MIN_VALUE, 360)
    if (extent?.kind === 'two-directions' && (angle + extent.secondAngle <= 0 || angle + extent.secondAngle > 360)) {
      fail(`${path}.extent.secondAngle`, 'la suma de los dos ángulos debe ser mayor que 0 y no superar 360')
    }
    const parameters = { sketchId: string(source.sketchId, `${path}.sketchId`, 128), angle,
      ...(Object.hasOwn(source, 'axis') ? { axis: revolutionAxis(source.axis, `${path}.axis`) } : {}),
      ...(Object.hasOwn(source, 'reversed') ? { reversed: boolean(source.reversed, `${path}.reversed`) } : {}),
      ...(extent ? { extent } : {}),
      ...(thinWall ? { thinWall } : {}) }
    return source.type === 'revolvedCut'
      ? { ...base, type: 'revolvedCut', ...parameters, ...(Object.hasOwn(source, 'bodyScope') ? { bodyScope: bodyReferences(source.bodyScope, `${path}.bodyScope`) } : {}) }
      : { ...base, type: 'revolve', ...parameters, ...(Object.hasOwn(source, 'bodyOperation') ? { bodyOperation: bodyOperation(source.bodyOperation, `${path}.bodyOperation`) } : {}) }
  }
  if (source.type === 'combine') {
    const keepTools = boolean(source.keepTools, `${path}.keepTools`)
    if (source.operation === 'add' || source.operation === 'common') {
      keys(source, [...baseKeys, 'operation', 'operands', 'resultBodyId', 'keepTools'], path)
      return { ...base, type: 'combine', operation: source.operation,
        operands: bodyReferences(source.operands, `${path}.operands`, 2),
        resultBodyId: entityIdentifier(source.resultBodyId, `${path}.resultBodyId`), keepTools }
    }
    if (source.operation === 'subtract') {
      keys(source, [...baseKeys, 'operation', 'target', 'tools', 'keepTools'], path)
      const target = bodyReference(source.target, `${path}.target`)
      const tools = bodyReferences(source.tools, `${path}.tools`, 1, MAX_BODY_OPERANDS - 1)
      if (tools.some(tool => tool.bodyId === target.bodyId)) fail(`${path}.tools`, 'el objetivo no puede ser una herramienta')
      return { ...base, type: 'combine', operation: 'subtract', target, tools, keepTools }
    }
    return fail(`${path}.operation`, 'operación de combinación desconocida')
  }
  if (source.type === 'hole') {
    keys(source, [...baseKeys, 'baseFeatureId', 'support', 'positions', 'reversed', 'diameter', 'endCondition', 'head'], path, ['bodyScope'])
    const diameter = number(source.diameter, `${path}.diameter`, MIN_DIMENSION, MAX_DIMENSION)
    const endCondition = holeEndCondition(source.endCondition, `${path}.endCondition`)
    const head = holeHead(source.head, `${path}.head`)
    checkHoleDimensions(diameter, endCondition, head, path)
    return {
      ...base, type: 'hole', baseFeatureId: entityIdentifier(source.baseFeatureId, `${path}.baseFeatureId`),
      support: support(source.support, `${path}.support`, true), positions: holePositions(source.positions, `${path}.positions`),
      reversed: boolean(source.reversed, `${path}.reversed`), diameter, endCondition, head,
      ...(Object.hasOwn(source, 'bodyScope') ? { bodyScope: bodyReferences(source.bodyScope, `${path}.bodyScope`) } : {}),
    }
  }
  if (source.type === 'sweep') {
    keys(source, [...baseKeys, 'profileSketchId', 'pathSketchId', 'path', 'orientation', 'merge'], path, ['bodyOperation'])
    if (source.orientation !== 'followPath') fail(`${path}.orientation`, 'orientación de barrido desconocida')
    return {
      ...base, type: 'sweep',
      profileSketchId: string(source.profileSketchId, `${path}.profileSketchId`, 128),
      pathSketchId: string(source.pathSketchId, `${path}.pathSketchId`, 128),
      path: sweepPath(source.path, `${path}.path`), orientation: 'followPath',
      ...bodyMergeOptions(source, path),
    }
  }
  if (source.type === 'loft') {
    keys(source, [...baseKeys, 'sections', 'ruled', 'merge'], path, ['bodyOperation'])
    return {
      ...base, type: 'loft', sections: loftSections(source.sections, `${path}.sections`),
      ruled: boolean(source.ruled, `${path}.ruled`), ...bodyMergeOptions(source, path),
    }
  }
  if (source.type === 'linearPattern') {
    keys(source, [...baseKeys, 'baseFeatureId', 'source', 'first', 'second', 'secondSeedOnly', 'skipped'], path, ['bodyPattern', 'featurePattern'])
    const first = linearDirection(source.first, `${path}.first`)
    const second = source.second === null ? null : linearDirection(source.second, `${path}.second`)
    const secondSeedOnly = boolean(source.secondSeedOnly, `${path}.secondSeedOnly`)
    const seeds = patternSource(source.source, `${path}.source`)
    const skipped = linearSkips(source.skipped, `${path}.skipped`, first.count, second?.count ?? 1, secondSeedOnly)
    const instances = secondSeedOnly ? first.count + (second?.count ?? 1) - 1 : first.count * (second?.count ?? 1)
    checkPatternApplications(seeds, instances - skipped.length - 1, path)
    return repetitionBodyOptions({
      ...base, type: 'linearPattern', baseFeatureId: entityIdentifier(source.baseFeatureId, `${path}.baseFeatureId`),
      source: seeds, first, second, secondSeedOnly, skipped,
    }, source, path)
  }
  if (source.type === 'circularPattern') {
    keys(source, [...baseKeys, 'baseFeatureId', 'source', 'axis', 'count', 'angle', 'equalSpacing', 'reversed', 'skipped'], path, ['bodyPattern', 'featurePattern'])
    const axis = object(source.axis, `${path}.axis`)
    keys(axis, ['origin', 'direction'], `${path}.axis`)
    const count = integer(source.count, `${path}.count`, 2, MAX_PATTERN_INSTANCES)
    const seeds = patternSource(source.source, `${path}.source`)
    const skipped = circularSkips(source.skipped, `${path}.skipped`, count)
    checkPatternApplications(seeds, count - skipped.length - 1, path)
    return repetitionBodyOptions({
      ...base, type: 'circularPattern', baseFeatureId: entityIdentifier(source.baseFeatureId, `${path}.baseFeatureId`),
      source: seeds,
      axis: { origin: vector(axis.origin, `${path}.axis.origin`), direction: vector(axis.direction, `${path}.axis.direction`, true) },
      count, angle: number(source.angle, `${path}.angle`, Number.MIN_VALUE, 360),
      equalSpacing: boolean(source.equalSpacing, `${path}.equalSpacing`), reversed: boolean(source.reversed, `${path}.reversed`),
      skipped,
    }, source, path)
  }
  if (source.type === 'mirror') {
    keys(source, [...baseKeys, 'baseFeatureId', 'source', 'support', 'mergeBodies'], path, ['bodyPattern', 'featurePattern'])
    const seeds = patternSource(source.source, `${path}.source`)
    const mergeBodies = boolean(source.mergeBodies, `${path}.mergeBodies`)
    if (seeds.mode === 'features' && mergeBodies) fail(`${path}.mergeBodies`, 'la fusión de cuerpos solo se aplica al modo cuerpo')
    return repetitionBodyOptions({
      ...base, type: 'mirror', baseFeatureId: entityIdentifier(source.baseFeatureId, `${path}.baseFeatureId`),
      source: seeds,
      support: support(source.support, `${path}.support`, true), mergeBodies,
    }, source, path)
  }
  if (source.type === 'shell') {
    keys(source, [...baseKeys, 'baseFeatureId', 'thickness', 'direction', 'removedFaces'], path, ['bodyScope'])
    const baseFeatureId = entityIdentifier(source.baseFeatureId, `${path}.baseFeatureId`)
    if (source.direction !== 'inward' && source.direction !== 'outward') fail(`${path}.direction`, 'dirección de vaciado desconocida')
    return {
      ...base, type: 'shell', baseFeatureId,
      thickness: number(source.thickness, `${path}.thickness`, MIN_DIMENSION, MAX_DIMENSION),
      direction: source.direction,
      removedFaces: faceSelection(source.removedFaces, baseFeatureId, `${path}.removedFaces`, true),
      ...(Object.hasOwn(source, 'bodyScope') ? { bodyScope: bodyReference(source.bodyScope, `${path}.bodyScope`) } : {}),
    }
  }
  if (source.type === 'draft') {
    keys(source, [...baseKeys, 'baseFeatureId', 'support', 'angle', 'reversed', 'faces', 'propagation'], path, ['bodyScope'])
    const baseFeatureId = entityIdentifier(source.baseFeatureId, `${path}.baseFeatureId`)
    if (source.propagation !== 'tangent') fail(`${path}.propagation`, 'el desmoldeo requiere propagación tangente')
    return {
      ...base, type: 'draft', baseFeatureId,
      support: support(source.support, `${path}.support`, true),
      angle: number(source.angle, `${path}.angle`, 0.01, 89.9),
      reversed: boolean(source.reversed, `${path}.reversed`), propagation: 'tangent',
      faces: faceSelection(source.faces, baseFeatureId, `${path}.faces`, false),
      ...(Object.hasOwn(source, 'bodyScope') ? { bodyScope: bodyReference(source.bodyScope, `${path}.bodyScope`) } : {}),
    }
  }
  if (source.type === 'fillet' || source.type === 'chamfer') {
    keys(source, [...baseKeys, 'size', 'selection', 'baseFeatureId'], path, ['bodyScope'])
    const baseFeatureId = string(source.baseFeatureId, `${path}.baseFeatureId`, 128)
    return {
      ...base, type: source.type, baseFeatureId,
      size: number(source.size, `${path}.size`, MIN_DIMENSION, MAX_DIMENSION),
      selection: edgeSelection(source.selection, baseFeatureId, `${path}.selection`),
      ...(Object.hasOwn(source, 'bodyScope') ? { bodyScope: bodyReference(source.bodyScope, `${path}.bodyScope`) } : {}),
    }
  }
  return fail(`${path}.type`, 'operación desconocida')
}

/** Checks the entire dependency graph and returns a detached, normalized document. */
export function validateDocument(value: unknown): Document {
  const source = object(value, 'Documento')
  keys(source, ['version', 'id', 'name', 'units', 'features', 'createdAt', 'updatedAt'], 'Documento', ['namedViews'])
  if (source.version !== 1) fail('Documento.version', 'versión de archivo no compatible')
  if (source.units !== 'mm') fail('Documento.units', 'solo se admiten milímetros')
  const sourceFeatures = boundedArray(source.features, 'Documento.features', 0, MAX_FEATURES)
  const seen = new Map<string, Feature>()
  const createdBodies = new Set<string>()
  let seenSolid = false
  let seenImport = false
  const features = sourceFeatures.map((value, index) => {
    const path = `Documento.features[${index}]`
    const parsed = feature(value, path)
    if (seen.has(parsed.id)) fail(`${path}.id`, 'identificador duplicado')
    const bodyIds = createdBodyIds(parsed), bodyRefs = featureBodyReferences(parsed)
    // Body states use this operation ID as their exact source. Legacy IDs keep
    // their existing syntax when no explicit body state is created or modified.
    if (bodyIds.length || bodyRefs.length) entityIdentifier(parsed.id, `${path}.id`)
    for (const bodyId of bodyIds) {
      if (createdBodies.has(bodyId)) fail(`${path}.${parsed.type === 'importedBodies' ? 'bodies' : parsed.type === 'combine' ? 'resultBodyId' : 'bodyPattern' in parsed ? 'bodyPattern.instances' : 'bodyOperation.bodyId'}`, 'identificador de cuerpo creado duplicado')
      createdBodies.add(bodyId)
      if (createdBodies.size > MAX_CREATED_BODY_IDS) fail(path, 'el documento supera 65536 identificadores de cuerpo creados, incluidos los retirados')
    }
    bodyRefs.forEach((reference, referenceIndex) => {
      const location = bodyReferencePath(parsed, referenceIndex, path)
      const owner = seen.get(reference.sourceFeatureId)
      if (!owner) fail(`${location}.sourceFeatureId`, 'debe referenciar una operación anterior')
      if (!featureBodyOutputIncludes(owner, reference.bodyId, [...seen.values()])) {
        fail(`${location}.bodyId`, 'el cuerpo no pertenece a la salida explícita de esa operación')
      }
    })
    if ((parsed.type === 'revolve' || parsed.type === 'revolvedCut') && parsed.axis) {
      const axis = parsed.axis
      if (axis.kind === 'external-sketch-line' && seen.get(axis.sketchId)?.type !== 'sketch') {
        fail(`${path}.axis.sketchId`, 'debe referenciar un croquis anterior')
      }
      if (axis.kind === 'linear-edge') {
        const owner = seen.get(axis.edge.sourceFeatureId)
        if (!owner || owner.type === 'sketch' || owner.type === 'plane') {
          fail(`${path}.axis.edge.sourceFeatureId`, 'debe referenciar una operación sólida anterior')
        }
        for (const reference of featureRevolutionAxisBodyReferences(parsed)) {
          if (!featureBodyOutputIncludes(owner, reference.bodyId, [...seen.values()])) {
            fail(`${path}.axis.body.bodyId`, 'el cuerpo del eje no pertenece a la salida explícita de esa operación')
          }
        }
      }
    }
    if (parsed.type === 'importedSolid' || parsed.type === 'importedBodies') {
      if (seenImport) fail(`${path}.type`, 'solo se admite un sólido importado')
      if (seenSolid) fail(`${path}.type`, 'el sólido importado debe ser la primera operación sólida, incluso con operaciones suprimidas')
      seenImport = true
    }
    if (parsed.type !== 'sketch' && parsed.type !== 'plane') seenSolid = true
    for (const [inputIndex, sketchId] of featureSketchIds(parsed).entries()) {
      if (seen.get(sketchId)?.type !== 'sketch') {
        const inputPath = parsed.type === 'sweep' ? (inputIndex === 0 ? 'profileSketchId' : 'pathSketchId')
          : parsed.type === 'loft' ? `sections[${inputIndex}].sketchId` : 'sketchId'
        fail(`${path}.${inputPath}`, 'debe referenciar un croquis anterior')
      }
    }
    if ('baseFeatureId' in parsed) {
      const base = seen.get(parsed.baseFeatureId)
      if (!base || base.type === 'sketch' || base.type === 'plane') {
        fail(`${path}.baseFeatureId`, 'debe referenciar una operación sólida anterior')
      }
    }
    if (parsed.type === 'linearPattern' || parsed.type === 'circularPattern' || parsed.type === 'mirror') {
      const references = parsed.source.mode === 'features' ? parsed.source.featureIds : parsed.source.mode === 'body' ? [parsed.source.sourceFeatureId] : []
      references.forEach((id, index) => {
        const seed = seen.get(id)
        if (!seed || seed.type === 'sketch' || seed.type === 'plane') {
          const field = parsed.source.mode === 'features' ? `featureIds[${index}]` : 'sourceFeatureId'
          fail(`${path}.source.${field}`, 'debe referenciar una operación sólida anterior')
        }
      })
    }
    if ('support' in parsed && parsed.support) {
      checkSupportReference(parsed.support, seen, `${path}.support`)
    }
    if (parsed.type === 'extrude' || parsed.type === 'cut') for (const [endCondition, locator] of [
      [parsed.endCondition, 'endCondition'], [parsed.secondDirection?.endCondition, 'secondDirection.endCondition'],
    ] as const) {
      if (!endCondition) continue
      if (endCondition.kind === 'upToSurface') {
        checkSupportReference(endCondition.target, seen, `${path}.${locator}.target`)
      } else {
        const base = seen.get(endCondition.baseFeatureId)
        if (!base || base.type === 'sketch' || base.type === 'plane') {
          fail(`${path}.${locator}.baseFeatureId`, 'debe referenciar una operación sólida anterior')
        }
      }
    }
    seen.set(parsed.id, parsed)
    return parsed
  })
  const createdAt = timestamp(source.createdAt, 'Documento.createdAt')
  const updatedAt = timestamp(source.updatedAt, 'Documento.updatedAt')
  if (updatedAt < createdAt) fail('Documento.updatedAt', 'anterior a la fecha de creación')
  const result: Document = {
    version: 1, id: string(source.id, 'Documento.id', 128), name: string(source.name, 'Documento.name'),
    units: 'mm', features, createdAt, updatedAt,
  }
  if (Object.hasOwn(source, 'namedViews')) {
    const field = Object.getOwnPropertyDescriptor(source, 'namedViews')!
    if (!('value' in field) || !field.enumerable) fail('Documento.namedViews', 'se esperaba un campo de datos')
    result.namedViews = validateNamedViews(field.value)
  }
  if (features.some(feature => feature.type === 'importedBodies') && new TextEncoder().encode(JSON.stringify(result, null, 2)).byteLength > MAX_IMPORTED_BODIES_DOCUMENT_BYTES) {
    fail('Documento', 'el documento serializado supera 20 MiB')
  }
  return result
}

export function createDocument(name = 'Pieza sin título'): Document {
  const now = new Date().toISOString()
  return validateDocument({ version: 1, id: crypto.randomUUID(), name, units: 'mm', features: [], createdAt: now, updatedAt: now })
}

/** A plate whose four holes remain individually editable in the feature tree. */
export function createDemoDocument(): Document {
  const document = createDocument('Placa de montaje')
  const baseSketch = crypto.randomUUID()
  const features: Feature[] = [
    { id: baseSketch, name: 'Croquis base · 100 × 70', type: 'sketch', plane: 'XY', offset: 0, profile: { kind: 'rectangle', center: [0, 0], width: 100, height: 70 }, suppressed: false },
    { id: crypto.randomUUID(), name: 'Saliente extruido · 12 mm', type: 'extrude', sketchId: baseSketch, depth: 12, symmetric: false, suppressed: false },
  ]
  const centers: [number, number][] = [[-35, -20], [35, -20], [35, 20], [-35, 20]]
  centers.forEach((center, index) => {
    const sketchId = crypto.randomUUID()
    features.push(
      { id: sketchId, name: `Croquis taladro ${index + 1}`, type: 'sketch', plane: 'XY', offset: 0, profile: { kind: 'circle', center, radius: 5 }, suppressed: false },
      { id: crypto.randomUUID(), name: `Corte extruido ${index + 1} · Ø10`, type: 'cut', sketchId, depth: 12, symmetric: false, suppressed: false },
    )
  })
  return validateDocument({ ...document, features })
}

export function parseDocument(json: string): Document {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('El archivo no contiene JSON válido.')
  }
  return validateDocument(value)
}

export function serializeDocument(document: Document): string {
  return JSON.stringify(validateDocument(document), null, 2)
}

function withFeatures(document: Document, features: Feature[]): Document {
  const now = new Date().toISOString()
  return validateDocument({ ...document, features, updatedAt: now < document.updatedAt ? document.updatedAt : now })
}

export function addFeature(document: Document, added: Feature): Document {
  return withFeatures(document, [...document.features, added])
}

export function updateFeature(document: Document, id: string, patch: Partial<Feature>): Document {
  const original = document.features.find((item) => item.id === id)
  if (!original) throw new Error('La operación que se intenta editar no existe.')
  if (patch.id !== undefined && patch.id !== id) throw new Error('El identificador de una operación no se puede cambiar.')
  if (patch.type !== undefined && patch.type !== original.type) throw new Error('El tipo de una operación no se puede cambiar.')
  readSecondDirection(original)
  const secondDirection = readSecondDirectionDraft(patch)
  const candidate = mergeThinWallDraft(original, patch) as Feature
  if (Object.hasOwn(patch, 'secondDirection')) {
    if (secondDirection) Object.assign(candidate, { secondDirection })
    else delete (candidate as { secondDirection?: unknown }).secondDirection
  }
  const repetition = (value: Feature): value is RepetitionFeature => value.type === 'linearPattern' || value.type === 'circularPattern' || value.type === 'mirror'
  if (repetition(original) && repetition(candidate) && (original.bodyPattern || candidate.bodyPattern)) {
    const before = original.bodyPattern, after = candidate.bodyPattern
    if (!before || !after || before.mode !== after.mode) throw new Error('El modo de salida de una repetición guardada no se puede cambiar; crea una operación nueva.')
    if (before.mode === 'new' && after.mode === 'new') {
      const seeds = new Set(candidate.source.mode === 'bodies' ? candidate.source.bodies.map(reference => reference.bodyId) : [])
      const addresses = new Set(bodyPatternAddresses(candidate))
      if (after.instances.length < before.instances.length) throw new Error('El registro de identificadores de la repetición no se puede reducir.')
      before.instances.forEach((slot, index) => {
        const next = after.instances[index]
        if (!next || slot.bodyId !== next.bodyId || slot.seedBodyId !== next.seedBodyId || slot.address !== next.address
          || (slot.retired && !next.retired)) throw new Error('Los identificadores y posiciones guardadas no se pueden reasignar ni recuperar después de retirarse.')
        if (!slot.retired && seeds.has(slot.seedBodyId) && addresses.has(slot.address) && next.retired) {
          throw new Error('Una posición superviviente debe conservar su identificador activo; solo se retiran posiciones o semillas eliminadas.')
        }
      })
    }
  } else if (JSON.stringify(createdBodyIds(candidate)) !== JSON.stringify(createdBodyIds(original))) {
    throw new Error('Los identificadores de cuerpos creados no se pueden cambiar en una edición; crea una operación nueva.')
  }
  return withFeatures(document, document.features.map((item) => item.id === id ? candidate : item))
}

export function removeFeature(document: Document, id: string): Document {
  const original = document.features.find((item) => item.id === id)
  if (!original) throw new Error('La operación que se intenta eliminar no existe.')
  const removed = new Set([id])
  // A dynamic ALL modifier does not depend on each inventory member. Exact
  // consumers of its potential states still depend on that body's creator.
  // Resolve against the original structural context, including repairable,
  // suppressed or non-materialized states; never infer a native replacement.
  const creators = new Map<string, string | null>()
  const features = document.features.filter((item) => {
    const dependsOnRemoved = featureDependencyIds(item).some((dependencyId) => removed.has(dependencyId))
      || [...featureBodyReferences(item), ...featureRevolutionAxisBodyReferences(item)].some(reference => {
        const key = JSON.stringify([reference.bodyId, reference.sourceFeatureId])
        if (!creators.has(key)) creators.set(key, bodyReferenceCreationFeatureId(document.features, reference))
        const creator = creators.get(key)
        return creator !== null && creator !== undefined && removed.has(creator)
      })
    if (removed.has(item.id) || dependsOnRemoved) {
      removed.add(item.id)
      return false
    }
    return true
  })
  return withFeatures(document, features)
}

/** Snapshot history. Every boundary clones so callers cannot mutate saved states. */
export class DocumentHistory {
  private past: Document[] = []
  private present: Document
  private future: Document[] = []
  private readonly limit: number

  constructor(document: Document, limit = 100) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('El límite del historial debe ser un entero positivo.')
    this.limit = limit
    this.present = validateDocument(document)
  }

  get current(): Document { return validateDocument(this.present) }
  get canUndo(): boolean { return this.past.length > 0 }
  get canRedo(): boolean { return this.future.length > 0 }

  apply(document: Document): Document {
    const next = validateDocument(document)
    if (JSON.stringify(next) === JSON.stringify(this.present)) return this.current
    this.past.push(this.present)
    if (this.past.length > this.limit) this.past.shift()
    this.present = next
    this.future = []
    return this.current
  }

  undo(): Document {
    const previous = this.past.pop()
    if (previous) {
      this.future.push(this.present)
      this.present = previous
    }
    return this.current
  }

  redo(): Document {
    const next = this.future.pop()
    if (next) {
      this.past.push(this.present)
      this.present = next
    }
    return this.current
  }

  reset(document: Document): Document {
    const next = validateDocument(document)
    this.present = next
    this.past = []
    this.future = []
    return this.current
  }
}
