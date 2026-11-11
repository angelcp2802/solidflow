import type { CadResult, ExtrudeEndCondition, ExtrudeFeature, Feature } from '../cad/kernel.types'
import type { Document } from '../model/document'

export type ExtrusionSide = 'first' | 'second'

export function extrusionEndForSide(feature: ExtrudeFeature, side: ExtrusionSide): ExtrudeEndCondition | undefined {
  return side === 'first' ? feature.endCondition : feature.secondDirection?.endCondition
}

/** A side patch never adopts or clears the other side's target or stored length. */
export function extrusionEndPatch(feature: ExtrudeFeature, side: ExtrusionSide, endCondition: ExtrudeEndCondition | undefined): Partial<ExtrudeFeature> {
  if (side === 'first') return { endCondition }
  return feature.secondDirection ? { secondDirection: { ...feature.secondDirection, endCondition } } : {}
}

export interface ExtrusionEndPickingRequest {
  side: ExtrusionSide
  draft: ExtrudeFeature
  document: Document
  epoch: number
  model: CadResult
  features: Feature[]
}

interface EndPickingState {
  draft: Feature | null
  document: Document
  epoch: number
  model: CadResult | null
  features: Feature[] | null
  builtFeatures: Feature[] | null
  loading: boolean
  blocked: boolean
}

export function extrusionEndPickCurrent(request: ExtrusionEndPickingRequest | null, state: EndPickingState): boolean {
  return !!request && request.draft === state.draft && request.document === state.document && request.epoch === state.epoch
    && request.model === state.model && request.features === state.features && state.builtFeatures === state.features
    && !state.loading && !state.blocked && !request.model.featureErrors.length
    && extrusionEndForSide(request.draft, request.side)?.kind === 'upToSurface'
}
