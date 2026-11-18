import { cast, getOC, type Shape3D } from 'replicad'
import { assemblyDefinitionKey, expandAssemblyParts, validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import { assemblyAnalysisBodyKey, validateAssemblyInterferenceOptions, resolveAssemblyInterferenceScope, MAX_ASSEMBLY_ANALYSIS_BODIES,
  MAX_ASSEMBLY_ANALYSIS_PAIRS, MAX_ASSEMBLY_ANALYSIS_MESH_NUMBERS, type AssemblyAnalysisBody,
  type AssemblyInterferenceOptions, type AssemblyInterferencePair, type AssemblyInterferenceReport } from '../model/assemblyInterference'
import { CadEngine } from './kernel.engine'
import { createConservativeBodyBounds, maximumNativeShapeTolerance } from './kernel.bodies'
import { placeAssemblyShape } from './kernel.assembly-placements'
import { validatePositiveClosedTool } from './kernel.closed-tools'
import { withNativeOwners, type NativeOwners } from './kernel.native-ownership'
import type { BodyReference, Vec3 } from './kernel.types'

type RawShape = Parameters<typeof cast>[0]
type Mesh = NonNullable<AssemblyInterferencePair['intersectionMesh']>
interface Prototype { engine: CadEngine; bodies: { body: BodyReference | null; bodyName: string }[] }
interface Placed { identity: AssemblyAnalysisBody; key: string; shape: Shape3D; bounds: [Vec3, Vec3]; tolerance: number; selected: boolean }
const MESH = { tolerance: .05, angularTolerance: .12 }
const samePath = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i])
function finite(value: number, message: string): number { if (!Number.isFinite(value)) throw new Error(message); return value }
function bounds(shape: Shape3D): [Vec3, Vec3] {
  return withNativeOwners(owners => {
    const box = owners.own(createConservativeBodyBounds(shape)), low = owners.own(box.CornerMin()), high = owners.own(box.CornerMax())
    const a: Vec3 = [low.X(), low.Y(), low.Z()], b: Vec3 = [high.X(), high.Y(), high.Z()]
    if (![...a, ...b].every(Number.isFinite) || a.some((value, i) => value > b[i])) throw new Error('Los límites nativos del análisis no son finitos y ordenados.')
    return [a, b]
  }, undefined, 'Assembly analysis bounds query or release failed.')
}
function separated(a: Placed, b: Placed, clearance: number, tolerance: number): boolean {
  const coordinateMagnitude = Math.max(1, ...a.bounds.flat().map(Math.abs), ...b.bounds.flat().map(Math.abs))
  // Explicit Float64 admission policy, not a certified SDK error interval.
  // A native distance cannot quietly inherit a tolerance enlarged by ULPs.
  if (128 * Number.EPSILON * coordinateMagnitude >= tolerance) throw new Error('Las coordenadas exceden la precisión solicitada del análisis de distancia.')
  const magnitude = Math.max(coordinateMagnitude, clearance, tolerance)
  const allowance = finite(128 * Number.EPSILON * magnitude, 'La precisión de los límites excede el análisis finito.')
  const threshold = finite(clearance + tolerance + allowance, 'La holgura y las tolerancias exceden el análisis finito.')
  let excluded = false
  for (let axis = 0; axis < 3; axis++) {
    const forward = finite(b.bounds[0][axis] - a.bounds[1][axis], 'La separación de límites excede las coordenadas finitas.'),
      backward = finite(a.bounds[0][axis] - b.bounds[1][axis], 'La separación de límites excede las coordenadas finitas.')
    if (Math.max(forward, backward) > threshold) excluded = true
  }
  return excluded
}
function common(a: Shape3D, b: Shape3D, owners: NativeOwners): RawShape {
  const oc = getOC(), argumentsList = owners.own(new oc.NCollection_List_TopoDS_Shape()),
    tools = owners.own(new oc.NCollection_List_TopoDS_Shape()), builder = owners.own(new oc.BRepAlgoAPI_Common())
  owners.own(argumentsList.Append(a.wrapped)); owners.own(tools.Append(b.wrapped))
  builder.SetArguments(argumentsList); builder.SetTools(tools); builder.SetNonDestructive(true)
  if (!builder.NonDestructive()) throw new Error('El análisis requiere una intersección nativa no destructiva.')
  builder.Build(); if (!builder.IsDone()) throw new Error('La intersección nativa del ensamblaje no terminó.')
  const raw = owners.own(builder.Shape())
  if (raw.IsNull()) throw new Error('Un resultado nativo nulo no demuestra ausencia de interferencia.')
  return raw
}
function intersection(raw: RawShape, admit: (mesh: Mesh) => void): { intersectionVolume: number; solidCount: number; intersectionMesh: Mesh | null } {
  return withNativeOwners(owners => {
    const oc = getOC(), explorer = owners.own(new oc.TopExp_Explorer(raw, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE))
    const analyzer = owners.own(new oc.BRepCheck_Analyzer(raw, true, false, false))
    if (!analyzer.IsValid()) throw new Error('La intersección del ensamblaje no es un BRep válido.')
    let intersectionVolume = 0, solidCount = 0
    const mesh: Mesh = { vertices: [], normals: [], triangles: [] }, seen: RawShape[] = []
    while (explorer.More()) {
      const current = owners.own(explorer.Current())
      if (seen.some(previous => previous.IsSame(current))) throw new Error('La intersección repite una misma ocurrencia nativa de sólido.')
      seen.push(current)
      withNativeOwners(solidOwners => {
        const solid = solidOwners.own(cast(current)).asShape3D()
        // This validator checks closed shells and strictly positive signed
        // volume, without the source-body validator's 1e-10 admission floor.
        const summary = validatePositiveClosedTool(solid)
        if (summary.solidCount !== 1) throw new Error('La intersección contiene una ocurrencia de sólido no única.')
        intersectionVolume = finite(intersectionVolume + summary.volumeMm3, 'El volumen de intersección excede la precisión finita.')
        const result = solid.mesh(MESH), offset = mesh.vertices.length / 3
        const copy: Mesh = { vertices: [...result.vertices], normals: [...result.normals], triangles: [...result.triangles] }
        admit(copy)
        if (!copy.vertices.length || !copy.triangles.length || copy.vertices.length % 3 || copy.normals.length !== copy.vertices.length || copy.triangles.length % 3
          || ![...copy.vertices, ...copy.normals].every(Number.isFinite)
          || copy.triangles.some(index => !Number.isInteger(index) || index < 0 || index >= copy.vertices.length / 3)) {
          throw new Error('La malla de intersección contiene coordenadas o índices no válidos.')
        }
        // No spread into push: an admitted mesh can exceed the JS argument cap.
        for (const value of copy.vertices) mesh.vertices.push(value)
        for (const value of copy.normals) mesh.normals.push(value)
        for (const index of copy.triangles) mesh.triangles.push(index + offset)
        solidCount++
      }, undefined, 'Assembly intersection solid inspection or release failed.')
      explorer.Next()
    }
    return { intersectionVolume, solidCount, intersectionMesh: solidCount ? mesh : null }
  }, undefined, 'Assembly intersection inspection or release failed.')
}
function distance(a: Shape3D, b: Shape3D, tolerance: number): { minimumDistance: number; closestPoints: { first: Vec3; second: Vec3 } } {
  return withNativeOwners(owners => {
    const query = owners.own(new (getOC().BRepExtrema_DistShapeShape)())
    query.SetDeflection(tolerance)
    query.LoadS1(a.wrapped); query.LoadS2(b.wrapped); query.Perform()
    if (!query.IsDone()) throw new Error('La distancia BRep no produjo un resultado nativo completo.')
    const count = query.NbSolution()
    if (!Number.isInteger(count) || count < 1) throw new Error('La distancia BRep no produjo soluciones nativas completas.')
    const minimumDistance = query.Value()
    if (!Number.isFinite(minimumDistance) || minimumDistance < 0) throw new Error('La distancia BRep no es finita y no negativa.')
    const first = owners.own(query.PointOnShape1(1)), second = owners.own(query.PointOnShape2(1))
    const aPoint: Vec3 = [first.X(), first.Y(), first.Z()], bPoint: Vec3 = [second.X(), second.Y(), second.Z()]
    if (![...aPoint, ...bPoint].every(Number.isFinite)) throw new Error('Los puntos más cercanos del BRep no son finitos.')
    const magnitude = Math.max(1, ...aPoint.map(Math.abs), ...bPoint.map(Math.abs))
    if (128 * Number.EPSILON * magnitude >= tolerance) throw new Error('Los puntos BRep exceden la precisión solicitada del análisis.')
    const pointDistance = finite(Math.hypot(...aPoint.map((value, i) => value - bPoint[i])), 'La distancia entre puntos BRep excede la precisión finita.')
    if (Math.abs(pointDistance - minimumDistance) > tolerance) throw new Error('La distancia BRep y sus puntos más cercanos no concuerdan dentro de la tolerancia declarada.')
    return { minimumDistance, closestPoints: { first: aPoint, second: bPoint } }
  }, undefined, 'Assembly distance query or release failed.')
}

/**
 * Actual owned placed BReps, not display meshes, supply every candidate query.
 * Bounds only exclude sufficiently distant pairs; excluded pairs have no exact
 * distance claim. Volumes belong to pairs and must not be summed as a union.
 * Admission caps are not native peak-memory/time bounds. Native errors and
 * cleanup failures withhold the entire numeric report, which grants no Apply.
 */
export function analyzeAssemblyInterference(current: AssemblyDocument, input?: Partial<AssemblyInterferenceOptions>): AssemblyInterferenceReport {
  const document = validateAssemblyDocument(current), options = validateAssemblyInterferenceOptions(input)
  // Resolve every explicit path/revision against the complete graph before
  // native allocation, even when hidden or suppressed branches will not build.
  const scope = resolveAssemblyInterferenceScope(document, options), selectedPaths = new Set(scope.selectedLeafPaths.map(path => JSON.stringify(path))),
    eligiblePaths = new Set(scope.eligibleLeafPaths.map(path => JSON.stringify(path)))
  const eligiblePair = (first: { identity: AssemblyAnalysisBody; selected: boolean }, second: { identity: AssemblyAnalysisBody; selected: boolean }) =>
    (!samePath(first.identity.component.occurrencePath, second.identity.component.occurrencePath)
      || (options.includeWithinComponent === true && assemblyAnalysisBodyKey(first.identity) !== assemblyAnalysisBodyKey(second.identity)))
      && (!options.treatSubassembliesAsComponents || first.identity.component.occurrencePath[0] !== second.identity.component.occurrencePath[0])
      && (scope.mode !== 'selected-against-rest' || first.selected !== second.selected)
  return withNativeOwners<AssemblyInterferenceReport>(owners => {
    const prototypes = new Map<string, Prototype>(), records: { identity: AssemblyAnalysisBody; prototype: Prototype; body: BodyReference | null;
      pose: ReturnType<typeof expandAssemblyParts>[number]['worldPose']; selected: boolean }[] = []
    const warnings: string[] = []
    for (const occurrence of expandAssemblyParts(document)) {
      const pathKey = JSON.stringify(occurrence.path)
      if (!eligiblePaths.has(pathKey)) continue
      const definition = occurrence.definition, key = assemblyDefinitionKey(definition)
      let prototype = prototypes.get(key)
      if (!prototype) {
        const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
        const result = engine.build(definition.document.features)
        if (result.featureErrors.length) throw new Error('No se pudo reconstruir la pieza del análisis: ' + result.featureErrors.map(value => value.message).join('; '))
        if (result.bodyCatalogActive && !result.bodies) throw new Error('La pieza no publicó su catálogo nativo de cuerpos.')
        prototype = { engine, bodies: result.bodyCatalogActive ? result.bodies!.map(body => ({ body: { ...body.ref }, bodyName: body.name }))
          : result.vertices.length ? [{ body: null, bodyName: 'Agregado de pieza' }] : [] }
        prototypes.set(key, prototype)
        warnings.push(...result.warnings.map(message => definition.document.name + ': ' + message))
        if (!prototype.bodies.length) warnings.push('La pieza «' + definition.document.name + '» no contiene cuerpos para analizar.')
      }
      for (const body of prototype.bodies) records.push({ identity: {
        component: { occurrencePath: [...occurrence.path], definition: { id: definition.id, revision: definition.revision } },
        body: body.body ? { ...body.body } : null, componentName: occurrence.chain.map(value => value.name).join(' / '), bodyName: body.bodyName },
        prototype, body: body.body, pose: occurrence.worldPose, selected: selectedPaths.has(pathKey) })
      if (records.length > MAX_ASSEMBLY_ANALYSIS_BODIES) throw new Error('El análisis supera el presupuesto de cuerpos de ensamblaje.')
    }
    records.sort((a, b) => { const x = assemblyAnalysisBodyKey(a.identity), y = assemblyAnalysisBodyKey(b.identity); return x < y ? -1 : x > y ? 1 : 0 })
    let potentialPairCount = 0
    for (let i = 0; i < records.length; i++) for (let j = i + 1; j < records.length; j++) {
      if (eligiblePair(records[i], records[j])) potentialPairCount++
    }
    if (potentialPairCount > MAX_ASSEMBLY_ANALYSIS_PAIRS) throw new Error('El análisis supera el presupuesto de pares de cuerpos.')
    const placed: Placed[] = records.map(record => {
      const copy = owners.own(record.prototype.engine.copyCurrentBodyShape(record.body)), shape = owners.own(placeAssemblyShape(copy, record.pose))
      const tolerance = maximumNativeShapeTolerance(shape)
      return { identity: record.identity, key: assemblyAnalysisBodyKey(record.identity), shape, tolerance, bounds: bounds(shape), selected: record.selected }
    })
    const pairs: AssemblyInterferencePair[] = []
    let testedPairCount = 0, broadPhaseExcludedCount = 0, meshNumbers = 0
    const admit = (mesh: Mesh) => {
      meshNumbers += mesh.vertices.length + mesh.normals.length + mesh.triangles.length
      if (meshNumbers > MAX_ASSEMBLY_ANALYSIS_MESH_NUMBERS) throw new Error('El análisis supera el presupuesto de malla de intersección.')
    }
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const first = placed[i], second = placed[j]
      if (!eligiblePair(first, second)) continue
      const lengthTolerance = Math.max(options.lengthTolerance, finite(first.tolerance + second.tolerance, 'Las tolerancias nativas exceden la precisión finita.'))
      const limit = finite(options.clearance + lengthTolerance, 'La holgura y las tolerancias nativas exceden la precisión finita.')
      if (separated(first, second, options.clearance, lengthTolerance)) { broadPhaseExcludedCount++; continue }
      testedPairCount++
      const pair = withNativeOwners(local => {
        const material = intersection(common(first.shape, second.shape, local), admit), separation = distance(first.shape, second.shape, lengthTolerance)
        const status: AssemblyInterferencePair['status'] | null = material.intersectionVolume > options.volumeTolerance ? 'overlap'
          : material.intersectionVolume > 0 ? 'small-overlap' : separation.minimumDistance <= lengthTolerance ? 'contact'
            : separation.minimumDistance <= limit ? 'clearance' : null
        return status ? { id: JSON.stringify([first.key, second.key]), first: structuredClone(first.identity), second: structuredClone(second.identity),
          status, ...material, ...separation, lengthTolerance, volumeTolerance: options.volumeTolerance } : null
      }, undefined, 'Assembly pair analysis or release failed.')
      if (pair) pairs.push(pair)
    }
    return { kind: 'assembly-interference-report', analysisId: crypto.randomUUID(), options,
      scopeSummary: { mode: scope.mode, selectedLeafCount: scope.selectedLeafPaths.length, excludedLeafCount: scope.excludedLeafPaths.length,
        eligibleLeafCount: scope.eligibleLeafPaths.length, eligiblePairCount: potentialPairCount }, bodyCount: placed.length,
      componentCount: new Set(placed.map(value => JSON.stringify(value.identity.component.occurrencePath))).size,
      potentialPairCount, testedPairCount, broadPhaseExcludedCount, pairs, warnings }
  }, undefined, 'Assembly interference analysis or release failed.')
}
