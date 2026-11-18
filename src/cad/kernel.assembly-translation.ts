import { getOC, type Shape3D } from 'replicad'
import { assemblyDefinitionKey, expandAssemblyParts } from '../model/assemblyDocument'
import { assemblyAnalysisBodyKey, MAX_ASSEMBLY_ANALYSIS_BODIES, MAX_ASSEMBLY_ANALYSIS_PAIRS,
  type AssemblyAnalysisBody } from '../model/assemblyInterference'
import { prepareAssemblyTranslationPath, validateAssemblyTranslationStopOptions,
  type AssemblyTranslationPath, type AssemblyTranslationStopOptions } from '../model/assemblyTranslation'
import type { RigidPose } from '../model/rigidPose'
import { CadEngine } from './kernel.engine'
import { createConservativeBodyBounds, maximumNativeShapeTolerance } from './kernel.bodies'
import { placeAssemblyShape } from './kernel.assembly-placements'
import { withNativeOwners } from './kernel.native-ownership'
import type { BodyReference, Vec3 } from './kernel.types'

export interface AssemblyTranslationBlockingPair {
  first: AssemblyAnalysisBody
  second: AssemblyAnalysisBody
  minimumDistance: number
  /** Requested distance deflection; never silently enlarged by coordinates. */
  lengthTolerance: number
  /** Clearance + both actual BRep tolerances + deflection + two-endpoint Float64 margin. */
  band: number
  closestPoints: { first: Vec3; second: Vec3 }
}
export interface AssemblyTranslationTrace {
  fraction: number
  status: 'complete' | 'stopped'
  bodyCount: number
  /** Different leaf paths whose constant world velocities differ exactly. */
  pairCount: number
  invariantPairCount: number
  queryCount: number
  blockingPair?: AssemblyTranslationBlockingPair
}
interface Prototype { engine: CadEngine; bodies: { body: BodyReference | null; name: string; shape: Shape3D }[] }
interface Body { identity: AssemblyAnalysisBody; shape: Shape3D; start: RigidPose; delta: Vec3; tolerance: number; magnitude: number }
interface Pair { first: number; second: number; speed: number; band: number }
const samePath = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i])
function finite(value: number, message: string): number { if (!Number.isFinite(value)) throw new Error(message); return value }

function checkedPath(input: AssemblyTranslationPath): AssemblyTranslationPath {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error('La trayectoria de traslación debe ser un plan de datos.')
  const base = Object.getOwnPropertyDescriptor(input, 'base'), target = Object.getOwnPropertyDescriptor(input, 'target')
  if (!base || !target || !('value' in base) || !('value' in target) || !base.enumerable || !target.enumerable) {
    throw new Error('La trayectoria necesita documentos de origen y destino propios, sin accesores.')
  }
  // Recompute all leaf identities, velocities and interpolation. A supplied
  // callback/leaf DTO cannot change the geometry or run inside native tracing.
  return prepareAssemblyTranslationPath(base.value, target.value)
}
function magnitude(shape: Shape3D, delta: Vec3): number {
  return withNativeOwners(owners => {
    const box = owners.own(createConservativeBodyBounds(shape)), low = owners.own(box.CornerMin()), high = owners.own(box.CornerMax())
    const a: Vec3 = [low.X(), low.Y(), low.Z()], b: Vec3 = [high.X(), high.Y(), high.Z()]
    if (![...a, ...b].every(Number.isFinite) || a.some((value, axis) => value > b[axis])) throw new Error('La trayectoria no tiene límites nativos finitos y ordenados.')
    let result = 1
    for (let axis = 0; axis < 3; axis++) for (const value of [a[axis], b[axis]]) {
      result = Math.max(result, Math.abs(value), Math.abs(finite(value + delta[axis], 'El extremo de la trayectoria excede las coordenadas finitas.')))
    }
    return result
  }, undefined, 'Assembly translation bounds query or release failed.')
}
function nativeDistance(a: Shape3D, b: Shape3D, tolerance: number): Pick<AssemblyTranslationBlockingPair, 'minimumDistance' | 'closestPoints'> {
  return withNativeOwners(owners => {
    const query = owners.own(new (getOC().BRepExtrema_DistShapeShape)())
    query.SetDeflection(tolerance); query.LoadS1(a.wrapped); query.LoadS2(b.wrapped); query.Perform()
    if (!query.IsDone()) throw new Error('La distancia BRep de la trayectoria no terminó.')
    const count = query.NbSolution(), minimumDistance = query.Value()
    if (!Number.isInteger(count) || count < 1 || !Number.isFinite(minimumDistance) || minimumDistance < 0) {
      throw new Error('La distancia BRep de la trayectoria no produjo una solución finita completa.')
    }
    if (query.InnerSolution() && minimumDistance > tolerance) throw new Error('La distancia BRep contradice su solución interior.')
    const first = owners.own(query.PointOnShape1(1)), second = owners.own(query.PointOnShape2(1))
    const p: Vec3 = [first.X(), first.Y(), first.Z()], q: Vec3 = [second.X(), second.Y(), second.Z()]
    if (![...p, ...q].every(Number.isFinite)) throw new Error('Los puntos BRep de la trayectoria no son finitos.')
    if (128 * Number.EPSILON * Math.max(1, ...p.map(Math.abs), ...q.map(Math.abs)) >= tolerance) {
      throw new Error('Los puntos BRep de la trayectoria exceden la precisión solicitada.')
    }
    const separation = finite(Math.hypot(...p.map((value, axis) => value - q[axis])), 'La separación BRep excede la precisión finita.')
    if (Math.abs(separation - minimumDistance) > tolerance) throw new Error('La distancia BRep y sus puntos no concuerdan dentro de la tolerancia solicitada.')
    return { minimumDistance, closestPoints: { first: p, second: q } }
  }, undefined, 'Assembly translation distance query or release failed.')
}

/**
 * Numerical conservative advancement for constant-rotation, straight world
 * translations. Native minimum-distance queries use OC's deflection policy;
 * neither a certified SDK error interval nor an exact first-contact time is
 * claimed. Each step is bounded by 0.8*(distance-band)/relativeSpeed, rather
 * than by a fixed pose sampling interval. Fractions with moving pairs were
 * actually queried; a path with only invariant pairs needs no distance query.
 * Initial moving-pair contact, exhausted budgets, failed queries and cleanup
 * errors reject the whole trace. Equal-velocity pairs are invariant, not a
 * claim that the initial assembly is globally interference-free. This numeric
 * result grants no Apply authority and does not validate intermediate mates.
 */
export function traceAssemblyTranslation(input: AssemblyTranslationPath,
  supplied?: Partial<AssemblyTranslationStopOptions>): AssemblyTranslationTrace {
  const path = checkedPath(input), options = validateAssemblyTranslationStopOptions(supplied)
  return withNativeOwners<AssemblyTranslationTrace>(owners => {
    const prototypes = new Map<string, Prototype>(), records: Omit<Body, 'tolerance' | 'magnitude'>[] = []
    const occurrences = new Map(expandAssemblyParts(path.base).map(value => [JSON.stringify(value.path), value]))
    for (const leaf of path.leaves) {
      const occurrence = occurrences.get(JSON.stringify(leaf.component.occurrencePath))
      if (!occurrence || assemblyDefinitionKey(occurrence.definition) !== assemblyDefinitionKey(leaf.component.definition)) {
        throw new Error('La trayectoria perdió la identidad exacta de una pieza activa.')
      }
      const definition = occurrence.definition, key = assemblyDefinitionKey(definition)
      let prototype = prototypes.get(key)
      if (!prototype) {
        const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
        const result = engine.build(definition.document.features)
        if (result.featureErrors.length) throw new Error('No se pudo reconstruir la pieza de la trayectoria: ' + result.featureErrors.map(value => value.message).join('; '))
        if (result.bodyCatalogActive && !result.bodies) throw new Error('La pieza no publicó su catálogo actual de cuerpos.')
        const sources = result.bodyCatalogActive ? result.bodies!.map(body => ({ body: { ...body.ref }, name: body.name }))
          : result.vertices.length ? [{ body: null, name: 'Agregado de pieza' }] : []
        prototype = { engine, bodies: sources.map(source => ({ ...source, shape: owners.own(engine.copyCurrentBodyShape(source.body)) })) }
        prototypes.set(key, prototype)
      }
      if (records.length + prototype.bodies.length > MAX_ASSEMBLY_ANALYSIS_BODIES) throw new Error('La trayectoria supera el presupuesto de cuerpos de ensamblaje.')
      for (const source of prototype.bodies) {
        records.push({ identity: { component: structuredClone(leaf.component), body: source.body ? { ...source.body } : null,
          componentName: occurrence.chain.map(value => value.name).join(' / '), bodyName: source.name }, shape: source.shape,
        start: structuredClone(leaf.start), delta: [...leaf.delta] })
      }
    }
    const bodies: Body[] = records.map(record => withNativeOwners(local => {
      // Include pre-cancellation declaration arithmetic and local prototype
      // geometry, not just the small final WORLD box. Otherwise a large parent
      // and opposite child/prototype coordinate can quantize an unsafe pose.
      const arithmeticMagnitude = finite(path.arithmeticMagnitude + magnitude(record.shape, [0, 0, 0]),
        'La aritmética de la trayectoria excede la precisión finita.')
      if (128 * Number.EPSILON * arithmeticMagnitude >= options.lengthTolerance) {
        throw new Error('La aritmética local y mundial de la trayectoria excede la precisión solicitada.')
      }
      const shape = local.own(placeAssemblyShape(record.shape, record.start))
      return { ...record, tolerance: maximumNativeShapeTolerance(shape), magnitude: Math.max(arithmeticMagnitude, magnitude(shape, record.delta)) }
    }, undefined, 'Assembly translation initial placement or release failed.'))
    bodies.sort((a, b) => { const x = assemblyAnalysisBodyKey(a.identity), y = assemblyAnalysisBodyKey(b.identity); return x < y ? -1 : x > y ? 1 : 0 })
    const pairs: Pair[] = []; let invariantPairCount = 0
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j]
      if (samePath(a.identity.component.occurrencePath, b.identity.component.occurrencePath)) continue
      const velocity = a.delta.map((value, axis) => finite(value - b.delta[axis], 'La velocidad relativa excede la precisión finita.'))
      const speed = finite(Math.hypot(...velocity), 'La velocidad relativa excede la precisión finita.')
      if (speed === 0) { invariantPairCount++; continue }
      if (pairs.length + invariantPairCount >= MAX_ASSEMBLY_ANALYSIS_PAIRS) throw new Error('La trayectoria supera el presupuesto de pares de cuerpos.')
      const coordinateMagnitude = finite(a.magnitude + b.magnitude, 'La aritmética del par excede la precisión finita.')
      if (128 * Number.EPSILON * coordinateMagnitude >= options.lengthTolerance) throw new Error('Las coordenadas de la trayectoria exceden la precisión solicitada.')
      const nativeTolerance = finite(a.tolerance + b.tolerance, 'Las tolerancias BRep exceden la precisión finita.')
      // d(actual,t) and the next actual pose can each differ from their ideal
      // affine placements. Cover BOTH relative endpoint arithmetic errors.
      const margin = finite(2 * 128 * Number.EPSILON * Math.max(coordinateMagnitude, options.clearance, nativeTolerance, options.lengthTolerance, speed), 'El margen de la trayectoria excede la precisión finita.')
      const band = finite(options.clearance + nativeTolerance + options.lengthTolerance + margin, 'La holgura y las tolerancias exceden la precisión finita.')
      pairs.push({ first: i, second: j, speed, band })
    }
    if (!pairs.length) return { fraction: 1, status: 'complete', bodyCount: bodies.length, pairCount: 0, invariantPairCount, queryCount: 0 }
    let fraction = 0, queryCount = 0
    for (;;) {
      if (options.maxQueries - queryCount < pairs.length) throw new Error('La trayectoria agotó el presupuesto de consultas; no se puede publicar una parada verificada.')
      const round = withNativeOwners(local => {
        // Query the very declaration interpolation that the caller will apply,
        // including its actual Float64 parent/child composition. The affine
        // ideal supplies the Lipschitz velocity; it cannot replace this pose.
        const actualLeaves = new Map(expandAssemblyParts(path.at(fraction)).map(leaf => [JSON.stringify(leaf.path), leaf]))
        const placed = bodies.map(body => {
          const actual = actualLeaves.get(JSON.stringify(body.identity.component.occurrencePath))
          if (!actual || assemblyDefinitionKey(actual.definition) !== assemblyDefinitionKey(body.identity.component.definition)) {
            throw new Error('La interpolación perdió la identidad actual de una pieza de la trayectoria.')
          }
          const affine = body.start.translation.map((value, axis) => finite(value + fraction * body.delta[axis], 'La colocación de la trayectoria excede las coordenadas finitas.'))
          const discrepancy = finite(Math.hypot(...affine.map((value, axis) => actual.worldPose.translation[axis] - value)),
            'La diferencia entre interpolaciones excede la precisión finita.')
          if (discrepancy > 128 * Number.EPSILON * body.magnitude) throw new Error('La interpolación local y la trayectoria mundial no concuerdan dentro del margen numérico.')
          const shape = local.own(placeAssemblyShape(body.shape, actual.worldPose))
          if (maximumNativeShapeTolerance(shape) > body.tolerance) throw new Error('La colocación cambió las tolerancias BRep de la trayectoria; vuelve a preparar el movimiento.')
          return shape
        })
        let step = 1 - fraction, nearest: AssemblyTranslationBlockingPair | undefined
        for (const pair of pairs) {
          queryCount++
          const result = nativeDistance(placed[pair.first], placed[pair.second], options.lengthTolerance)
          const observed: AssemblyTranslationBlockingPair = { first: structuredClone(bodies[pair.first].identity), second: structuredClone(bodies[pair.second].identity),
            ...result, lengthTolerance: options.lengthTolerance, band: pair.band }
          const free = finite(result.minimumDistance - pair.band, 'La separación de seguridad excede la precisión finita.')
          if (free <= 0) {
            if (fraction === 0) throw new Error('La trayectoria empieza con contacto, interferencia o una separación insuficiente entre cuerpos con movimiento relativo.')
            throw new Error('La distancia BRep no conservó el margen numérico de la trayectoria; no se puede publicar la parada.')
          }
          // Compare before dividing, so an extremely small nonzero speed does
          // not overflow an otherwise harmless, endpoint-clamped advance.
          const advance = .8 * free >= pair.speed * (1 - fraction) ? 1 - fraction
            : finite(.8 * free / pair.speed, 'El avance de la trayectoria excede la precisión finita.')
          if (!nearest || free < nearest.minimumDistance - nearest.band) nearest = observed
          step = Math.min(step, advance)
        }
        return { step, nearest: nearest! }
      }, undefined, 'Assembly translation round placement or release failed.')
      if (fraction === 1) return { fraction, status: 'complete', bodyCount: bodies.length, pairCount: pairs.length, invariantPairCount, queryCount }
      if (round.nearest.minimumDistance - round.nearest.band <= options.lengthTolerance) {
        return { fraction, status: 'stopped', bodyCount: bodies.length, pairCount: pairs.length, invariantPairCount, queryCount, blockingPair: round.nearest }
      }
      const next = fraction + round.step
      if (!Number.isFinite(next) || next <= fraction || next > 1) throw new Error('La trayectoria no puede avanzar dentro de la precisión solicitada.')
      fraction = next
    }
  }, undefined, 'Assembly translation trace or release failed.')
}
