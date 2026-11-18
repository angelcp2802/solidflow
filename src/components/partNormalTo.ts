import type { CadResult, FaceReference, Feature, Plane } from '../cad/kernel.types'
import { principalPlaneFrame } from '../cad/kernel.frames'
import { bodySelectionDtos } from '../cad/body-selection'
import { createFaceSelectionIndex } from '../cad/selection.references'
import { featureSketchIds } from '../model/featureInputs'
import type { NormalToTarget } from './normalToView'

/** Presentation selection only; never stored in the part document. */
export type PartViewReference = { kind: 'face'; face: FaceReference }
  | { kind: 'principal'; plane: Plane } | { kind: 'feature'; id: string }

export const partViewReferenceKey = (reference: PartViewReference): string => reference.kind === 'face'
  ? JSON.stringify(['face', reference.face.sourceFeatureId, reference.face.key])
  : JSON.stringify(reference.kind === 'principal' ? ['principal', reference.plane] : ['feature', reference.id])

export function togglePartViewReference(previous: readonly PartViewReference[], reference: PartViewReference, additive: boolean): PartViewReference[] {
  if (!additive) return [structuredClone(reference)]
  const key = partViewReferenceKey(reference)
  return previous.some(value => partViewReferenceKey(value) === key)
    ? previous.filter(value => partViewReferenceKey(value) !== key).map(value => structuredClone(value))
    : [...previous.map(value => structuredClone(value)), structuredClone(reference)]
}

/** Resolve references against the current native display result, without mesh-derived axes. */
export function partNormalToTarget(references: readonly PartViewReference[], model: CadResult | null, features: readonly Feature[]): NormalToTarget | null {
  if (references.length === 0) return { kind: 'none' }
  if (references.length > 2 || new Set(references.map(partViewReferenceKey)).size !== references.length) return null
  const faces = createFaceSelectionIndex(bodySelectionDtos(model).faces)
  const resolve = (reference: PartViewReference): Exclude<NormalToTarget, { kind: 'none' | 'planes' }> | null => {
    const key = partViewReferenceKey(reference)
    if (reference.kind === 'principal') return { kind: 'plane', key, frame: principalPlaneFrame(reference.plane) }
    if (reference.kind === 'face') {
      const face = faces.findPrimary(reference.face)
      if (!face) return null
      if (face.frame) return { kind: 'plane', key, frame: structuredClone(face.frame) }
      return face.viewAxis ? { ...structuredClone(face.viewAxis), kind: 'axis', key } : null
    }
    const matches = features.filter(feature => feature.id === reference.id)
    const feature = matches.length === 1 ? matches[0] : undefined
    if (!feature || feature.suppressed || !model || model.featureErrors.some(error => error.id === feature.id)) return null
    if (feature.type === 'plane') {
      const planes = model.planes?.filter(plane => plane.id === feature.id) ?? []
      return planes.length === 1 ? { kind: 'plane', key, frame: structuredClone(planes[0].frame) } : null
    }
    const sketchIds = feature.type === 'sketch' ? [feature.id] : [...new Set(featureSketchIds(feature))]
    if (sketchIds.length !== 1 || model.featureErrors.some(error => error.id === sketchIds[0])) return null
    const inputs = features.filter(value => value.id === sketchIds[0])
    if (inputs.length !== 1 || inputs[0].type !== 'sketch' || inputs[0].suppressed) return null
    const sketches = model.sketches?.filter(sketch => sketch.id === sketchIds[0]) ?? []
    return sketches.length === 1 && sketches[0].frame ? { kind: 'plane', key, frame: structuredClone(sketches[0].frame) } : null
  }
  const first = resolve(references[0])
  if (references.length === 1) return first
  const second = resolve(references[1])
  if (first?.kind !== 'plane' || second?.kind !== 'plane') return null
  return { kind: 'planes', key: JSON.stringify([first.key, second.key]), first: first.frame, second: second.frame }
}
