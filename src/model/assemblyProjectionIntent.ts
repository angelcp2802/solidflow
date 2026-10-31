import type { AssemblyWorldComponentMove } from './assemblyDrag'
import { validateAssemblyMoveIntent } from './assemblyMovement'

export interface AssemblyComponentDrag extends AssemblyWorldComponentMove {
  /** Position or orientation is the primary pointer objective, never a mate. */
  mode: 'translate' | 'rotate'
}
/** Detached intent only. Native references and constrained projection remain external. */
export function validateAssemblyComponentDrag(value: unknown): AssemblyComponentDrag {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Arrastre: se esperaba un objeto de datos.')
  const fields: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if (typeof key !== 'string' || !['component', 'pose', 'mode'].includes(key) || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error('Arrastre: sólo se admiten component, pose y mode como datos enumerables.')
    }
    fields[key] = descriptor.value
  }
  if (!['component', 'pose', 'mode'].every(key => Object.hasOwn(fields, key)) || fields.mode !== 'translate' && fields.mode !== 'rotate') {
    throw new Error('Arrastre: selecciona un objetivo de posición o giro completo.')
  }
  return { ...validateAssemblyMoveIntent({ component: fields.component, pose: fields.pose }), mode: fields.mode }
}
