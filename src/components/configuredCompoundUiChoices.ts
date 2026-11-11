import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { validateAssemblyConfiguredDocument, type AssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { validateAssemblyGeometryReference, validateAssemblyPlaneReference, validateAssemblyVertexReference, type AssemblyEdgeReference } from '../model/assemblyDocument'
import { validateAssemblyProfileFaceSelection, type AssemblyProfileFaceSelection } from '../model/assemblyProfileReferences'
import { validateAssemblyPathCurveSelection } from '../model/assemblyPathReferences'
import { assemblyCircularPathCatalogChoices } from '../cad/kernel.assembly-document-update-types'
import type { ConfiguredAssemblyScene } from '../cad/kernel.assembly-configuration-scene'
import type { AssemblyScene, AssemblySceneBody } from '../cad/kernel.assembly-types'
import type { ProfileFaceChoice, ProfileEdgeChoice } from './AssemblyProfileCenterMatePanel'
import type { LinePathPointChoice, LinePathEdgeChoice, LinePathGuideChoice } from './AssemblyLinePathMatePanel'
import type { CircularPathChoice } from './AssemblyCircularPathMatePanel'

export interface ConfiguredCompoundUiChoices {
  profileFaces: ProfileFaceChoice[]
  profileEdges: ProfileEdgeChoice[]
  points: LinePathPointChoice[]
  lineEdges: LinePathEdgeChoice[]
  circularPaths: CircularPathChoice[]
  guides: LinePathGuideChoice[]
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
  const x = Object.getOwnPropertyDescriptors(a), y = Object.getOwnPropertyDescriptors(b)
  const keys = Reflect.ownKeys(x), other = Reflect.ownKeys(y)
  return keys.length === other.length && keys.every(key => typeof key === 'string' && Object.hasOwn(y, key)
    && 'value' in x[key] && 'value' in y[key] && same(x[key].value, y[key].value))
}
type Mutable<T> = T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T
const own = <T>(value: T): Mutable<T> => structuredClone(value) as Mutable<T>
const empty = (): ConfiguredCompoundUiChoices => ({ profileFaces: [], profileEdges: [], points: [], lineEdges: [], circularPaths: [], guides: [] })
const vector = (v: readonly number[]) => '(' + v.map(x => Number(x.toPrecision(7))).join(', ') + ')'
const finite = (v: readonly number[]) => v.length === 3 && v.every(Number.isFinite)
function add<T extends { key: string }>(rows: T[], value: T) {
  if (rows.some(row => row.key === value.key)) throw Error('El catálogo compuesto contiene una identidad ambigua.')
  if (rows.length >= 4096) throw Error('El catálogo compuesto excede 4096 candidatos.')
  rows.push(value)
}
/** Display nominees only. Neither metadata, keys nor context signatures grant
 * incidence, profile classification, current native proof or Apply authority. */
export function configuredCompoundUiChoices(document: AssemblyConfiguredDocument, wrapper: ConfiguredAssemblyScene | null,
  generation: number, scopePath: readonly string[]): ConfiguredCompoundUiChoices {
  const result = empty(), checked = validateAssemblyConfiguredDocument(document)
  if (!Number.isSafeInteger(generation) || generation < 0 || !Array.isArray(scopePath)
    || scopePath.some(id => typeof id !== 'string') || !wrapper) return result
  const context = wrapper.context
  if (wrapper.kind !== 'configured-assembly-scene' || wrapper.scene.kind !== 'assembly-scene'
    || context.generation !== generation || context.root.id !== checked.source.id || context.root.revision !== checked.source.revision
    || context.rootConfiguration !== checked.rootConfiguration || context.sourceSignature !== JSON.stringify(checked.source)
    || context.catalogSignature !== JSON.stringify(checked.catalog)) return result
  const evaluation = evaluateAssemblyConfiguration(checked.source, checked.catalog, checked.rootConfiguration)
  const scope = evaluation.scopes.find(row => same(row.path, scopePath))
  if (!scope || scope.suppressed) return result
  const parts = new Map(evaluation.parts.map(part => [JSON.stringify(part.path), part]))
  const bodies: AssemblySceneBody[] = []
  let inspected = 0
  for (const raw of wrapper.scene.bodies) {
    if (++inspected > 16384) throw Error('El catálogo compuesto excede 16384 inspecciones.')
    const path = raw.component.occurrencePath, part = parts.get(JSON.stringify(path))
    if (!raw.visible || !part || part.suppressed || !part.visible || path.length <= scopePath.length
      || !scopePath.every((id, i) => path[i] === id) || !same(raw.component.definition, { id: part.definition.id, revision: part.definition.revision })
      || !same(raw.configurationAncestry, part.configurationAncestry)) continue
    // Own a display copy; never change the configured scene or its full paths.
    const body = own(raw)
    // The legacy atomic circular catalog compares normalized locator JSON.
    // Normalize the owning body too, not only its child selections.
    body.body = raw.body === null ? null : { bodyId: raw.body.bodyId, sourceFeatureId: raw.body.sourceFeatureId }
    body.faces = []; body.edges = []; body.vertexPoints = []
    const relative = { ...raw.component, occurrencePath: path.slice(scopePath.length) }
    const prefix = relative.occurrencePath.join(' / ') + ' · ' + raw.name
    const members = (selection: { component: unknown; body: unknown }) => same(selection.component, raw.component) && same(selection.body, raw.body)
    for (const vertex of raw.vertexPoints ?? []) {
      if (++inspected > 16384) throw Error('El catálogo compuesto excede 16384 inspecciones.')
      if (!members(vertex.selection) || !finite(vertex.point)) continue
      try {
        const reference = validateAssemblyVertexReference({ kind: 'vertex', ...vertex.selection, component: relative, support: 'point' })
        if (reference.body && reference.body.sourceFeatureId !== reference.vertex.sourceFeatureId) continue
        add(result.points, { key: JSON.stringify(reference), label: 'Vértice local ' + vector(vertex.point) + ' mm · ' + prefix, reference })
        body.vertexPoints.push({ ...own(vertex), selection: { component: own(raw.component), body: reference.body, vertex: reference.vertex } })
      } catch (error) { if (error instanceof Error && /catálogo/.test(error.message)) throw error }
    }
    for (const face of raw.faces) {
      if (++inspected > 16384) throw Error('El catálogo compuesto excede 16384 inspecciones.')
      if (!members(face.selection) || face.support?.kind !== 'plane' || !finite(face.support.point) || !finite(face.support.normal)) continue
      try {
        const reference = validateAssemblyProfileFaceSelection({ ...face.selection, component: relative })
        const label = 'Cara plana · p local ' + vector(face.support.point) + ' mm · n local ' + vector(face.support.normal) + ' · ' + prefix
        add(result.profileFaces, { key: JSON.stringify(reference), label, reference })
        const guide = validateAssemblyPlaneReference({ kind: 'face', ...reference, support: 'plane' })
        if (guide.kind === 'face') add(result.guides, { key: JSON.stringify(guide), label, reference: { ...guide, support: 'plane' } })
      } catch (error) { if (error instanceof Error && /catálogo/.test(error.message)) throw error }
    }
    for (const edge of raw.edges ?? []) {
      if (++inspected > 16384) throw Error('El catálogo compuesto excede 16384 inspecciones.')
      if (!members(edge.selection)) continue
      try {
        const selection = validateAssemblyPathCurveSelection({ ...edge.selection, component: relative, sense: 1 })
        if (edge.support?.kind === 'line' && finite(edge.support.point) && finite(edge.support.axis)) {
          const reference = validateAssemblyGeometryReference({ kind: 'edge', component: relative, body: selection.body, edge: selection.edge, support: 'line' })
          if (reference.kind !== 'edge') continue
          const label = 'LINE · p local ' + vector(edge.support.point) + ' mm · dirección local ' + vector(edge.support.axis) + ' · ' + prefix
          add(result.lineEdges, { key: JSON.stringify(reference), label, reference })
          const owner = result.profileFaces.find(face => same(face.reference.component, relative) && same(face.reference.body, selection.body) && face.reference.face.sourceFeatureId === selection.edge.sourceFeatureId)
          if (owner) add(result.profileEdges, { key: JSON.stringify(reference), label, faceOwner: structuredClone(owner.reference), edge: selection.edge })
        } else if (!edge.support && edge.circularPathOrigins?.length === 2) {
          inspected += 2
          if (inspected > 16384) throw Error('El catálogo compuesto excede 16384 inspecciones.')
          body.edges.push({ ...own(edge), selection: { component: own(raw.component), body: selection.body, edge: selection.edge } })
        }
      } catch (error) { if (error instanceof Error && /catálogo/.test(error.message)) throw error }
    }
    bodies.push(body)
  }
  // Reuse the native catalog's atomic edge + actual endpoint metadata policy.
  const scene: AssemblyScene = { ...own(wrapper.scene), bodies }
  for (const choice of assemblyCircularPathCatalogChoices(scene)) {
    const reference = { ...choice.reference, component: { ...choice.reference.component, occurrencePath: choice.reference.component.occurrencePath.slice(scopePath.length) } }
    add(result.circularPaths, { ...choice, key: JSON.stringify(reference), reference })
  }
  return result
}
/** Body/producer nominees, NOT a claim of edge membership in this face. */
export function configuredCompoundProfileEdgesForFace(edges: readonly ProfileEdgeChoice[], face: AssemblyProfileFaceSelection | null): ProfileEdgeChoice[] {
  if (!face) return []
  const parsed = validateAssemblyProfileFaceSelection(face)
  return edges.filter(row => same(row.faceOwner.component, parsed.component) && same(row.faceOwner.body, parsed.body) && row.edge.sourceFeatureId === parsed.face.sourceFeatureId)
}
/** Same-body/producer vertices remain candidates; native endpoint incidence is
 * checked only by the joint LINE query after preview submission. */
export function configuredCompoundLineOrigins(points: readonly LinePathPointChoice[], edge: AssemblyEdgeReference | null): LinePathPointChoice[] {
  if (!edge) return []
  const parsed = validateAssemblyGeometryReference(edge)
  if (parsed.kind !== 'edge' || parsed.support !== 'line') return []
  return points.filter(row => same(row.reference.component, parsed.component) && same(row.reference.body, parsed.body) && row.reference.vertex.sourceFeatureId === parsed.edge.sourceFeatureId)
}
