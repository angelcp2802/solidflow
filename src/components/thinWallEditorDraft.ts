import type { CadResult, ExtrudeFeature, Feature, RevolutionFeature, ThinWallDefinition } from '../cad/kernel.types'

export type ThinWallOperation = ExtrudeFeature | RevolutionFeature
export const DEFAULT_WALL_THICKNESS = 10

export function defaultThinWallDefinition(): ThinWallDefinition {
  return { kind: 'one-side', thickness: DEFAULT_WALL_THICKNESS, reversed: false }
}

export function isThinWallOperation(feature: Feature): feature is ThinWallOperation {
  return feature.type === 'extrude' || feature.type === 'cut' || feature.type === 'revolve' || feature.type === 'revolvedCut'
}

/** Only a current solved sketch witness can require an automatic wall. */
export function thinWallRequiredByProfile(sketchId: string, model: Pick<CadResult, 'sketches' | 'featureErrors'> | null, current: boolean): boolean {
  if (!current || !model || model.featureErrors.length) return false
  const matches = model.sketches?.filter(sketch => sketch.id === sketchId) ?? []
  return matches.length === 1 && matches[0].profileTopology === 'open'
}

/** Mixed/closed, missing, duplicate or stale solved witnesses do not offer corner rounding. */
export function thinAutoCornersAvailableByProfile(sketchId: string, model: Pick<CadResult, 'sketches' | 'featureErrors'> | null, current: boolean): boolean {
  if (!current || !model || model.featureErrors.length) return false
  const matches = model.sketches?.filter(sketch => sketch.id === sketchId) ?? []
  return matches.length === 1 && matches[0].profileTopology === 'open' && matches[0].profileOpenOnly === true
}

export function withRequiredThinWall<T extends ThinWallOperation>(feature: T, original: Feature | undefined, required: boolean): T {
  if (!required || original || Object.hasOwn(feature, 'thinWall')) return feature
  return { ...feature, thinWall: defaultThinWallDefinition() }
}

/** UI draft merging only: invalid typed dimensions remain editable until native validation. */
export function mergeThinWallEditorDraft<T extends Feature>(feature: T, patch: Partial<T>, original?: Feature): T {
  const next = { ...feature, ...patch }
  if (Object.hasOwn(patch, 'thinWall')) {
    if (!isThinWallOperation(feature)) throw Error('Esta operación no admite pared delgada.')
    if ((patch as { thinWall?: unknown }).thinWall === undefined) delete (next as { thinWall?: ThinWallDefinition }).thinWall
  }
  if (original && isThinWallOperation(original) && isThinWallOperation(next)) {
    if (original.id !== feature.id || original.type !== feature.type) throw Error('La operación guardada ha cambiado. Vuelve a abrir su edición.')
    if (Object.hasOwn(original, 'thinWall') !== Object.hasOwn(next, 'thinWall')) {
      throw Error('El tipo regular o lámina se conserva al editar. Crea otra operación para cambiarlo.')
    }
  }
  return next
}
