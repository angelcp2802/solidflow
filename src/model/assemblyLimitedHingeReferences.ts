import { validateAssemblyPlaneReference, type AssemblyPlaneReference } from './assemblyDocument'
import { validateAssemblyHingeReferenceRequest, type AssemblyHingeReferenceRequest } from './assemblyHingeReferences'
import { validateAssemblyDirectedAngleArc, type AssemblyDirectedAngleArc } from './assemblyLimitDirectedAngle'

export type AssemblyHingeAngularFaceReference = Extract<AssemblyPlaneReference, { kind: 'face' }>
/** Explicit six-role intent shared by standalone requests and saved limited
 * hinges. Syntax validation grants no native proof. */
export interface AssemblyLimitedHingeReferenceRequest extends AssemblyHingeReferenceRequest {
  stops: {
    coordinate: 'directed-about-axis'
    angular: [AssemblyHingeAngularFaceReference, AssemblyHingeAngularFaceReference]
    arc: AssemblyDirectedAngleArc
  }
}
function data(value: unknown, names: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length !== names.length) throw Error('Limited hinge requires exact plain data.')
  const result: Record<string, unknown> = {}
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!
    if (typeof key !== 'string' || !names.includes(key) || !field.enumerable || !('value' in field)) throw Error('Limited hinge requires own data fields.')
    result[key] = field.value
  }
  return result
}
export function validateAssemblyLimitedHingeReferenceRequest(input: unknown): AssemblyLimitedHingeReferenceRequest {
  const value = data(input, ['axis', 'axial', 'alignment', 'stops'])
  const base = validateAssemblyHingeReferenceRequest({ axis: value.axis, axial: value.axial, alignment: value.alignment })
  const stops = data(value.stops, ['coordinate', 'angular', 'arc'])
  if (stops.coordinate !== 'directed-about-axis') throw Error('Limited hinge requires the explicit directed coordinate.')
  const list = stops.angular
  if (!Array.isArray(list) || Object.getPrototypeOf(list) !== Array.prototype || list.length !== 2 || Reflect.ownKeys(list).length !== 3) throw Error('Limited hinge angular faces require two dense roles.')
  const angular = [0, 1].map(i => {
    const field = Object.getOwnPropertyDescriptor(list, String(i))
    if (!field?.enumerable || !('value' in field)) throw Error('Limited hinge angular faces require own data.')
    const reference = validateAssemblyPlaneReference(field.value)
    if (reference.kind !== 'face') throw Error('Limited hinge angular roles require material planar faces, not principal planes.')
    return reference
  }) as AssemblyLimitedHingeReferenceRequest['stops']['angular']
  return { ...base, stops: { coordinate: 'directed-about-axis', angular, arc: validateAssemblyDirectedAngleArc(stops.arc) } }
}
