import type { BodyReference, Feature } from '../cad/kernel.types'

/** Read-only axis owners are not material targets or outputs of the operation. */
export function featureRevolutionAxisBodyReferences(feature: Feature): BodyReference[] {
  if ((feature.type === 'revolve' || feature.type === 'revolvedCut') && feature.axis?.kind === 'linear-edge' && feature.axis.body) {
    return [{ ...feature.axis.body }]
  }
  return []
}
