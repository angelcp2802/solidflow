import { measureShapeSurfaceProperties, measureShapeVolumeProperties } from 'replicad'
import { assemblyDefinitionKey, expandAssemblyParts, validateAssemblyDocument, type AssemblyDocument,
  type AssemblyComponentReference, type ExpandedPartOccurrence } from '../model/assemblyDocument'
import { validateDocument } from '../model/document'
import { rigidRotationMatrix, transformRigidDirection, transformRigidPoint, validateRigidPose, type RigidPose } from '../model/rigidPose'
import { CadEngine, type AssemblyPresentationBody, type AssemblyPartInspection } from './kernel.engine'
import type { AssemblyScenePartProvider } from './kernel.assembly-snapshot'
import { placeAssemblyShape, validateAssemblyShape } from './kernel.assembly-placements'
import { UnsupportedAssemblySurfaceError, UnsupportedAssemblySphereSurfaceError, UnsupportedAssemblyCurveError, type AssemblyNativeFaceSupport, type AssemblyNativeLineSupport } from './kernel.assembly-supports'
import { withNativeOwners } from './kernel.native-ownership'
import type { AssemblyScene, AssemblySceneBody, AssemblySceneFace, AssemblySceneEdge, AssemblySceneVertex } from './kernel.assembly-types'
import type { BodyReference, CadResult, PickableFace, PickableEdge, VertexReference, Vec3 } from './kernel.types'

export const MAX_ASSEMBLY_SCENE_BODY_ENTRIES = 4096
export const MAX_ASSEMBLY_SCENE_FACE_REFERENCES = 65_536
export const MAX_ASSEMBLY_SCENE_EDGE_REFERENCES = 65_536
/** Optional topology DTOs have independent prototype and expansion budgets.
 * Omit a whole body's point catalog with a warning when it cannot fit; never
 * reject otherwise valid body/mesh geometry merely for this optional budget. */
export const MAX_ASSEMBLY_SCENE_VERTEX_POINTS = 65_536
/** Admission after native meshing, not a bound on kernel peak memory/time. */
export const MAX_ASSEMBLY_SCENE_NUMBERS = 4_000_000
// Match prototype face tessellation; the picker still handles numerical/native
// triangulation differences within one scoped body without widening occlusion.
const MESH = { tolerance: .05, angularTolerance: .12 }
interface PrototypeBody {
  body: BodyReference | null
  name: string
  vertexPoints: { vertex: VertexReference; point: Vec3; tolerance: number }[]
  faces: { face: PickableFace; support: AssemblyNativeFaceSupport | null; sphereSurface?: NonNullable<AssemblySceneFace['sphereSurface']> }[]
  edges: { edge: PickableEdge; support: AssemblyNativeLineSupport | null; circularPathOrigins: VertexReference[] }[]
}
interface Prototype { inspection: AssemblyPartInspection; bodies: PrototypeBody[] }
function worldSupport(support: AssemblyNativeFaceSupport, pose: RigidPose): AssemblyNativeFaceSupport {
  const common = { point: transformRigidPoint(pose, support.point), xDirection: transformRigidDirection(pose, support.xDirection), tolerance: support.tolerance }
  return support.kind === 'plane' ? { ...common, kind: 'plane', normal: transformRigidDirection(pose, support.normal) }
    : { ...common, kind: 'cylinder', axis: transformRigidDirection(pose, support.axis), radius: support.radius }
}
function triples(values: readonly number[], pose: RigidPose): number[] {
  const matrix = rigidRotationMatrix(pose.rotation), result: number[] = []
  if (values.length % 3) throw new Error('La malla de cara no tiene coordenadas completas.')
  for (let i = 0; i < values.length; i += 3) {
    const x = values[i], y = values[i + 1], z = values[i + 2]
    result.push(matrix[0] * x + matrix[1] * y + matrix[2] * z + pose.translation[0],
      matrix[3] * x + matrix[4] * y + matrix[5] * z + pose.translation[1],
      matrix[6] * x + matrix[7] * y + matrix[8] * z + pose.translation[2])
  }
  return result
}
function bounds(value: readonly (readonly number[])[]): AssemblySceneBody['bounds'] {
  if (value.length !== 2 || value.some(side => side.length !== 3 || !side.every(Number.isFinite)) || value[0].some((coordinate, i) => coordinate > value[1][i])) {
    throw new Error('El cuerpo colocado no tiene límites finitos y ordenados.')
  }
  return { min: [...value[0]] as Vec3, max: [...value[1]] as Vec3 }
}
function union(values: AssemblySceneBody['bounds'][]): AssemblyScene['bounds'] {
  return values.length ? { min: [0, 1, 2].map(i => Math.min(...values.map(value => value.min[i]))) as Vec3,
    max: [0, 1, 2].map(i => Math.max(...values.map(value => value.max[i]))) as Vec3 } : null
}
function sceneBodySources(result: CadResult, engine: AssemblyPartInspection, admitVertices: (count: number) => boolean): PrototypeBody[] {
  if (result.featureErrors.length) throw new Error('No se pudo reconstruir la pieza: ' + result.featureErrors.map(value => value.message).join('; '))
  if (result.bodyCatalogActive && !result.bodies) throw new Error('La pieza no publicó sus cuerpos explícitos.')
  const bodies = result.bodyCatalogActive ? result.bodies!.map(body => ({ body: { ...body.ref }, name: body.name, faces: body.faces, edges: body.edges, vertexPoints: body.vertexPoints ?? [] }))
    : result.vertices.length ? [{ body: null, name: 'Agregado de pieza', faces: result.faces ?? [], edges: result.edges, vertexPoints: result.vertexPoints ?? [] }] : []
  return inspectBodySources(bodies, engine, admitVertices)
}
function inspectBodySources(bodies: AssemblyPresentationBody[], engine: AssemblyPartInspection, admitVertices: (count: number) => boolean): PrototypeBody[] {
  return bodies.map(body => ({ ...body, vertexPoints: admitVertices(body.vertexPoints.length) ? body.vertexPoints.map(value => {
    const support = engine.inspectCurrentVertexSupport(value.ref, body.body)
    return { vertex: { ...value.ref }, point: [...support.point] as Vec3, tolerance: support.tolerance }
  }) : [], faces: body.faces.map(face => {
    let support: AssemblyNativeFaceSupport | null
    try { support = engine.inspectCurrentFaceSupport(face.ref, body.body) }
    catch (error) { if (!(error instanceof UnsupportedAssemblySurfaceError)) throw error; support = null }
    let sphereSurface: AssemblySceneFace['sphereSurface']
    if (support === null) {
      try {
        const native = engine.inspectCurrentSphereSurfaceSupport(face.ref, body.body)
        sphereSurface = { kind: 'sphere-surface', center: [...native.center], radius: native.radius, tolerance: native.tolerance }
      } catch (error) { if (!(error instanceof UnsupportedAssemblySphereSurfaceError)) throw error }
    }
    return { face, support, ...(sphereSurface ? { sphereSurface } : {}) }
  }), edges: body.edges.map(edge => {
    let support: AssemblyNativeLineSupport | null
    try { support = engine.inspectCurrentEdgeSupport(edge.ref, body.body) }
    catch (error) { if (!(error instanceof UnsupportedAssemblyCurveError)) throw error; support = null }
    const circularPathOrigins = body.vertexPoints.length && !support ? engine.inspectCurrentArcPathOrigins(edge.ref,body.body) : []
    return { edge, support, circularPathOrigins }
  }) }))
}

/**
 * Build actual independently placed BReps and display meshes without Fuse.
 * Picking retains local prototype face keys with complete occurrence scope;
 * rigidly transformed face meshes are display metadata, never native proof.
 * Local engines/copies are released before returning. A shared provider's
 * owner must close before the caller publishes the returned DTO or a token.
 */
export function buildAssemblyScene(input: AssemblyDocument, parts?: AssemblyScenePartProvider): AssemblyScene {
  const document = validateAssemblyDocument(input), occurrences = expandAssemblyParts(document)
  return buildAssemblySceneFromOccurrences(occurrences, parts)
}

type ReadonlyData<T> = T extends object ? { readonly [K in keyof T]: ReadonlyData<T[K]> } : T
/** @internal Native display construction shared by the two validated expansion
 * boundaries. An inventory or its display metadata grants no reference/Apply
 * authority. Callers must own and validate the full declaration context. */
export function buildAssemblySceneFromOccurrences(occurrences: readonly ReadonlyData<ExpandedPartOccurrence>[], parts?: AssemblyScenePartProvider): AssemblyScene {
  return withNativeOwners<AssemblyScene>(owners => {
    const prototypes = new Map<string, Prototype>(), bodies: AssemblySceneBody[] = [], warnings: string[] = []
    let prototypeEntries = 0, expandedEntries = 0, faceReferences = 0, edgeReferences = 0, numbers = 0, prototypeVertexPoints = 0, expandedVertexPoints = 0
    const numeric = (value: readonly number[], stride: number): number[] => {
      numbers += value.length
      if (numbers > MAX_ASSEMBLY_SCENE_NUMBERS) throw new Error('El ensamblaje supera el presupuesto de números de la escena.')
      if (value.length % stride || !value.every(Number.isFinite)) throw new Error('La escena contiene una malla no finita o incompleta.')
      return [...value]
    }
    const indices = (value: readonly number[], vertexCount: number): number[] => {
      const result = numeric(value, 3)
      if (result.some(index => !Number.isInteger(index) || index < 0 || index >= vertexCount)) throw new Error('La escena contiene índices de triángulo no válidos.')
      return result
    }
    for (const occurrence of occurrences) {
      const definition = occurrence.definition, identity = assemblyDefinitionKey(definition)
      let prototype = prototypes.get(identity)
      if (!prototype) {
        const admitVertices = (count: number): boolean => {
          if (count > MAX_ASSEMBLY_SCENE_VERTEX_POINTS - prototypeVertexPoints) {
            warnings.push('Se omitió un catálogo opcional de vértices del prototipo por presupuesto.'); return false
          }
          prototypeVertexPoints += count; return true
        }
        const shared = parts?.({ ...definition, document: validateDocument(definition.document) })
        let partWarnings: string[]
        if (shared) {
          prototype = { inspection: shared.inspection, bodies: inspectBodySources(shared.bodies, shared.inspection, admitVertices) }
          partWarnings = shared.warnings
        } else {
          const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
          const result = engine.build(validateDocument(definition.document).features)
          prototype = { inspection: engine, bodies: sceneBodySources(result, engine, admitVertices) }
          partWarnings = result.warnings
        }
        prototypes.set(identity, prototype)
        prototypeEntries += prototype.bodies.length
        faceReferences += prototype.bodies.reduce((total, body) => total + body.faces.length, 0)
        edgeReferences += prototype.bodies.reduce((total, body) => total + body.edges.length, 0)
        if (prototypeEntries > MAX_ASSEMBLY_SCENE_BODY_ENTRIES || faceReferences > MAX_ASSEMBLY_SCENE_FACE_REFERENCES || edgeReferences > MAX_ASSEMBLY_SCENE_EDGE_REFERENCES) throw new Error('La escena supera el presupuesto de cuerpos, caras o aristas de prototipo.')
        warnings.push(...partWarnings.map(message => definition.document.name + ': ' + message))
        if (!prototype.bodies.length) warnings.push('La pieza «' + definition.document.name + '» no contiene cuerpos para mostrar.')
      }
      expandedEntries += prototype.bodies.length
      if (expandedEntries > MAX_ASSEMBLY_SCENE_BODY_ENTRIES) throw new Error('El ensamblaje supera 4096 entradas de cuerpo expandidas.')
      const pose = validateRigidPose(occurrence.worldPose), component: AssemblyComponentReference = {
        occurrencePath: [...occurrence.path], definition: { id: definition.id, revision: definition.revision } }
      for (const source of prototype.bodies) {
        const data = withNativeOwners(placedOwners => {
          const copy = placedOwners.own(prototype!.inspection.copyCurrentBodyShape(source.body))
          const shape = placedOwners.own(placeAssemblyShape(copy, pose)), solidCount = validateAssemblyShape(shape)
          const mesh = shape.mesh(MESH), edges = shape.meshEdges(MESH), box = placedOwners.own(shape.boundingBox)
          const vertices = numeric(mesh.vertices, 3), normals = numeric(mesh.normals, 3), triangles = indices(mesh.triangles, vertices.length / 3)
          if (normals.length !== vertices.length) throw new Error('La escena no tiene una normal por vértice.')
          const volume = placedOwners.own(measureShapeVolumeProperties(shape)).volume,
            area = placedOwners.own(measureShapeSurfaceProperties(shape)).area
          if (!Number.isFinite(volume) || volume <= 0 || !Number.isFinite(area) || area <= 0) throw new Error('El cuerpo colocado no tiene propiedades físicas finitas.')
          return { vertices, normals, triangles, edgeLines: numeric(edges.lines, 6), volume, area, solidCount, bounds: bounds(box.bounds) }
        }, undefined, 'Assembly scene placement, mesh or release failed.')
        const faces: AssemblySceneFace[] = source.faces.map(({ face, support, sphereSurface }) => {
          const vertices = numeric(triples(face.vertices, pose), 3)
          return { selection: { component: structuredClone(component), body: source.body ? { ...source.body } : null, face: { ...face.ref } },
            support: support ? structuredClone(support) : null, worldSupport: support ? worldSupport(support, pose) : null,
             ...(face.viewAxis ? { viewAxis: structuredClone(face.viewAxis), worldViewAxis: {
               kind: 'axis' as const, point: transformRigidPoint(pose, face.viewAxis.point),
               direction: transformRigidDirection(pose, face.viewAxis.direction),
               ...(face.viewAxis.xDirection ? { xDirection: transformRigidDirection(pose, face.viewAxis.xDirection) } : {}),
             } } : {}),
            ...(sphereSurface ? { sphereSurface: structuredClone(sphereSurface),
              worldSphereSurface: { ...sphereSurface, center: transformRigidPoint(pose, sphereSurface.center) } } : {}),
            vertices, triangles: indices(face.triangles, vertices.length / 3) }
        })
        const edges: AssemblySceneEdge[] = source.edges.map(({ edge, support, circularPathOrigins }) => ({
          selection: { component: structuredClone(component), body: source.body ? { ...source.body } : null, edge: { ...edge.ref } },
          support: support ? structuredClone(support) : null,
          worldSupport: support ? { ...support, point: transformRigidPoint(pose, support.point), axis: transformRigidDirection(pose, support.axis) } : null,
          ...(circularPathOrigins.length ? {circularPathOrigins:structuredClone(circularPathOrigins)} : {}),
          lines: numeric(triples(edge.lines, pose), 6),
        }))
        let vertexPoints: AssemblySceneVertex[] = []
        if (source.vertexPoints.length > MAX_ASSEMBLY_SCENE_VERTEX_POINTS - expandedVertexPoints) {
          warnings.push('Se omitió un catálogo opcional de vértices de la ocurrencia por presupuesto.')
        } else {
          expandedVertexPoints += source.vertexPoints.length
          vertexPoints = source.vertexPoints.map(value => {
            const point: Vec3 = [...value.point], worldPoint = transformRigidPoint(pose, point)
            if (![...point, ...worldPoint, value.tolerance].every(Number.isFinite) || value.tolerance < 0) throw new Error('El catálogo de vértices contiene una medida no finita.')
            return { selection: { component: structuredClone(component), body: source.body ? { ...source.body } : null, vertex: { ...value.vertex } }, point, worldPoint, tolerance: value.tolerance }
          })
        }
        bodies.push({ component: structuredClone(component), body: source.body ? { ...source.body } : null,
          name: occurrence.chain.map(item => item.name).join(' / ') + ' · ' + source.name, visible: occurrence.visible, worldPose: pose, ...data, faces, edges, vertexPoints })
      }
    }
    const volume = bodies.reduce((total, body) => total + body.volume, 0), area = bodies.reduce((total, body) => total + body.area, 0)
    if (!Number.isFinite(volume) || !Number.isFinite(area)) throw new Error('Las propiedades sumadas del ensamblaje exceden la precisión finita.')
    return { kind: 'assembly-scene', sceneId: crypto.randomUUID(), bodies, volume, area,
      solidCount: bodies.reduce((total, body) => total + body.solidCount, 0), prototypeCount: prototypes.size,
      bounds: union(bodies.map(body => body.bounds)), visibleBounds: union(bodies.filter(body => body.visible).map(body => body.bounds)), warnings }
  }, undefined, 'Assembly scene construction or release failed.')
}
