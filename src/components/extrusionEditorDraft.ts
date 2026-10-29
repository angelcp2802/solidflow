import { resolveExtrusionSpan, type SecondDirection } from '../cad/extrusionDirection'
import type { ExtrudeFeature } from '../cad/kernel.types'
import { captureOwnDataRecord } from '../model/ownDataRecord'
import { mergeThinWallEditorDraft } from './thinWallEditorDraft'

function draftField(patch: object, key: 'endCondition' | 'secondDirection'): PropertyDescriptor | undefined {
  const field = Object.getOwnPropertyDescriptor(patch, key)
  if (field && (!field.enumerable || !('value' in field))) {
    throw Error('La extensión debe editarse mediante datos propios, sin funciones de acceso.')
  }
  return field
}

/** UI drafts retain invalid numbers; strict span admission still controls preview and Apply. */
function secondDirectionDraft(value: unknown): SecondDirection {
  const fields = captureOwnDataRecord(value, ['enabled', 'depth'], ['enabled', 'depth'], 'Dirección 2')
  const enabled = fields.get('enabled'), depth = fields.get('depth')
  if (typeof enabled !== 'boolean' || typeof depth !== 'number') throw Error('Dirección 2 requiere activación booleana y profundidad numérica.')
  return { enabled, depth }
}

/** Check descriptors before spreading, and remove explicit optional clears from the draft. */
export function mergeExtrusionDraft<T extends ExtrudeFeature>(feature: T, patch: Partial<T>, original?: ExtrudeFeature): T {
  const end = draftField(patch, 'endCondition'), direction = draftField(patch, 'secondDirection')
  const captured = direction && direction.value !== undefined ? secondDirectionDraft(direction.value) : undefined
  const next = mergeThinWallEditorDraft(feature, patch, original)
  if (end && end.value === undefined) delete next.endCondition
  if (direction) {
    if (captured) next.secondDirection = captured
    else delete next.secondDirection
  }
  return next
}

export function extrusionDirectionInputError(feature: Pick<ExtrudeFeature, 'depth' | 'symmetric' | 'endCondition' | 'secondDirection'>): string | null {
  try { resolveExtrusionSpan(feature) }
  catch (error) { return error instanceof Error ? error.message : 'La extensión de extrusión no es válida.' }
  return null
}
