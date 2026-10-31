import type { BodyReference, CadResult, EdgeReference, FaceReference, Feature, PickableBody, Plane } from '../cad/kernel.types'
import { createEdgeSelectionIndex, createFaceSelectionIndex } from '../cad/selection.references'
import type { Document } from '../model/document'

export type PartContextTarget =
  | { kind: 'face'; reference: FaceReference }
  | { kind: 'edge'; reference: EdgeReference }
  | { kind: 'body'; reference: BodyReference | null }
  | { kind: 'plane'; id: string }
  | { kind: 'principal'; plane: Plane }
  | { kind: 'feature'; id: string }
  | { kind: 'background' }

export interface PartViewportContextRequest {
  target: PartContextTarget | { kind: 'keyboard' }
  model: CadResult | null
  point: { x: number; y: number }
  origin: HTMLElement
}

type ContextModel = Pick<CadResult, 'faces' | 'edges' | 'planes' | 'vertices' | 'bodyCatalogActive'> & {
  bodies?: readonly Pick<PickableBody, 'ref' | 'name'>[]
}
export interface ResolvedPartContext {
  target: PartContextTarget
  feature?: Feature
  name: string
  canSketch: boolean
}

/** Current display nominees only. Existing commands still own native validation. */
export function resolvePartContextTarget(target: PartContextTarget, document: Pick<Document, 'features' | 'name'>,
  model: ContextModel | null, showPlanes: boolean): ResolvedPartContext | null {
  const feature = (id: string) => {
    const matches = document.features.filter(value => value.id === id && !value.suppressed)
    return matches.length === 1 ? matches[0] : undefined
  }
  if (target.kind === 'background') return { target, name: 'Vista de la pieza', canSketch: false }
  if (target.kind === 'principal') return ['XY', 'XZ', 'YZ'].includes(target.plane)
    ? { target, name: `Plano ${target.plane}`, canSketch: true } : null
  if (target.kind === 'feature') {
    const value = feature(target.id)
    return value ? { target, feature: value, name: value.name, canSketch: value.type === 'plane' } : null
  }
  if (!model) return null
  if (target.kind === 'face' || target.kind === 'edge') {
    const value = target.kind === 'face' ? createFaceSelectionIndex(model.faces ?? []).findPrimary(target.reference)
      : createEdgeSelectionIndex(model.edges).findPrimary(target.reference)
    const source = value && feature(value.ref.sourceFeatureId)
    if (!value || !source) return null
    const planar = target.kind === 'face' && 'frame' in value && !!value.frame
    return { target: { kind: target.kind, reference: { ...value.ref } }, feature: source,
      name: `${source.name} · ${target.kind === 'edge' ? 'Arista' : planar ? 'Cara plana' : 'Cara curva'}`, canSketch: planar }
  }
  if (target.kind === 'body') {
    const reference = target.reference
    if (reference === null) {
      if (model.bodyCatalogActive || !model.vertices.length) return null
      const source = [...document.features].reverse().find(value => !value.suppressed && value.type !== 'sketch' && value.type !== 'plane')
      return { target, feature: source, name: document.name, canSketch: false }
    }
    if (!model.bodyCatalogActive) return null
    const bodies = model.bodies ?? []
    if (new Set(bodies.map(body => body.ref.bodyId)).size !== bodies.length) return null
    const matches = bodies.filter(body => body.ref.bodyId === reference.bodyId
      && body.ref.sourceFeatureId === reference.sourceFeatureId)
    const source = matches.length === 1 ? feature(matches[0].ref.sourceFeatureId) : undefined
    return source ? { target: { kind: 'body', reference: { ...matches[0].ref } }, feature: source, name: matches[0].name, canSketch: false } : null
  }
  if (!showPlanes || model.planes?.filter(plane => plane.id === target.id).length !== 1) return null
  const source = feature(target.id)
  if (source && source.type !== 'plane') return null
  if (!source) return null
  return { target, feature: source, name: source.name, canSketch: true }
}
