import { resolveExtrusionDirections, type SecondDirection } from '../cad/extrusionDirection'
import type { ExtrudeEndCondition, ExtrudeFeature } from '../cad/kernel.types'
import { captureOwnDataRecord } from '../model/ownDataRecord'
import { mergeThinWallEditorDraft } from './thinWallEditorDraft'

function draftField(patch: object, key: 'endCondition' | 'secondDirection'): PropertyDescriptor | undefined {
  const field = Object.getOwnPropertyDescriptor(patch, key)
  if (field && (!field.enumerable || !('value' in field))) {
    throw Error('La extensión debe editarse mediante datos propios, sin funciones de acceso.')
  }
  return field
}

/** Detach only declared own data before any object spread; incomplete IDs remain editable. */
function endConditionDraft(value: unknown): ExtrudeEndCondition {
  const fields = captureOwnDataRecord(value, ['kind', 'baseFeatureId', 'bothDirections', 'baseBody', 'target'], ['kind'], 'Condición final')
  const kind = fields.get('kind')
  const record = (input: unknown, allowed: string[]) => {
    const captured = captureOwnDataRecord(input, allowed, allowed, 'Referencia de condición final')
    for (const [key, field] of captured) {
      if (key !== 'target' && key !== 'face' && typeof field !== 'string') throw Error('La referencia de condición final requiere campos de texto.')
    }
    return Object.fromEntries(captured)
  }
  if (kind === 'upToSurface') {
    const end = record(value, ['kind', 'target'])
    const target = captureOwnDataRecord(end.target, ['kind', 'plane', 'planeId', 'face'], ['kind'], 'Superficie de destino')
    let detached: object
    if (target.get('kind') === 'principal') detached = record(end.target, ['kind', 'plane'])
    else if (target.get('kind') === 'plane') detached = record(end.target, ['kind', 'planeId'])
    else if (target.get('kind') === 'face') detached = { ...record(end.target, ['kind', 'face']), face: record(target.get('face'), ['sourceFeatureId', 'key']) }
    else throw Error('Superficie de destino desconocida.')
    return { kind, target: detached as Extract<ExtrudeEndCondition, { kind: 'upToSurface' }>['target'] }
  }
  if (kind !== 'throughAll' && kind !== 'untilNext') throw Error('Condición final desconocida.')
  const allowed = kind === 'throughAll' ? ['kind', 'baseFeatureId', 'bothDirections', 'baseBody'] : ['kind', 'baseFeatureId', 'baseBody']
  const required = allowed.filter(key => key !== 'baseBody')
  const captured = captureOwnDataRecord(value, allowed, required, 'Condición final')
  if (typeof captured.get('baseFeatureId') !== 'string' || kind === 'throughAll' && typeof captured.get('bothDirections') !== 'boolean') {
    throw Error('La condición final requiere una referencia de texto y un sentido booleano.')
  }
  const result = Object.fromEntries(captured)
  if (captured.has('baseBody')) result.baseBody = record(captured.get('baseBody'), ['bodyId', 'sourceFeatureId'])
  return result as unknown as ExtrudeEndCondition
}

/** UI drafts retain invalid numbers; strict branch admission still controls preview and Apply. */
function secondDirectionDraft(value: unknown): SecondDirection {
  const fields = captureOwnDataRecord(value, ['enabled', 'depth', 'endCondition'], ['enabled', 'depth'], 'Dirección 2')
  const enabled = fields.get('enabled'), depth = fields.get('depth')
  if (typeof enabled !== 'boolean' || typeof depth !== 'number') throw Error('Dirección 2 requiere activación booleana y profundidad numérica.')
  const end = fields.get('endCondition')
  return { enabled, depth, ...(end !== undefined ? { endCondition: endConditionDraft(end) } : {}) }
}

/** Check descriptors before spreading, and remove explicit optional clears from the draft. */
export function mergeExtrusionDraft<T extends ExtrudeFeature>(feature: T, patch: Partial<T>, original?: ExtrudeFeature): T {
  const end = draftField(patch, 'endCondition'), direction = draftField(patch, 'secondDirection')
  const capturedEnd = end && end.value !== undefined ? endConditionDraft(end.value) : undefined
  const captured = direction && direction.value !== undefined ? secondDirectionDraft(direction.value) : undefined
  const next = mergeThinWallEditorDraft(feature, patch, original)
  if (end) {
    if (capturedEnd) next.endCondition = capturedEnd
    else delete next.endCondition
  }
  if (direction) {
    if (captured) next.secondDirection = captured
    else delete next.secondDirection
  }
  return next
}

export function extrusionDirectionInputError(feature: Pick<ExtrudeFeature, 'depth' | 'symmetric' | 'endCondition' | 'secondDirection'>): string | null {
  try { resolveExtrusionDirections(feature) }
  catch (error) { return error instanceof Error ? error.message : 'La extensión de extrusión no es válida.' }
  return null
}
