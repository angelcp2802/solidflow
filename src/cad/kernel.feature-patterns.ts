import { getOC, type Shape3D } from 'replicad';
import type { BodyReference, RepetitionFeature } from './kernel.types';
import type { GeometryDelta, PatternPlan } from './kernel.patterns';
import { bodyBoolean, copyBodyShape, type NativeBodyCatalog, type NativeBodyReplacement } from './kernel.bodies';
import { bodyPatternCopy } from './kernel.body-patterns';

/** A contribution belongs to one exact output state, never to the model aggregate. */
export interface OwnedFeatureGeometry {
  ref: BodyReference;
  order: number;
  lineage: string;
  delta?: GeometryDelta;
  error?: string;
}

export const featureContributionKey = (ref: BodyReference): string => JSON.stringify([ref.bodyId, ref.sourceFeatureId]);
const tolerance = (volume: number): number => Math.max(1e-8, Math.abs(volume) * 1e-10);
export class FeatureContributionReleaseError extends AggregateError {}

/** Release once even when deletion itself fails, preserving the original failure. */
class ShapeOwners {
  private readonly values = new Set<Shape3D>();
  own<T extends Shape3D>(shape: T): T { this.values.add(shape); return shape; }
  transfer(shape: Shape3D): void { this.values.delete(shape); }
  release(shape: Shape3D): void {
    if (!this.values.delete(shape)) return;
    try { shape.delete(); }
    catch (error) { throw new FeatureContributionReleaseError([error], 'Feature contribution shape release failed.'); }
  }
  dispose(keep: ReadonlySet<Shape3D> = new Set()): unknown[] {
    const failures: unknown[] = [];
    for (const shape of [...this.values].reverse()) {
      if (keep.has(shape)) continue;
      try { this.release(shape); } catch (error) { failures.push(error); }
    }
    return failures;
  }
}

function failure(primary: unknown, releases: readonly unknown[]): never {
  if (!releases.length) {
    // The body helpers aggregate native release failures. Do not downgrade
    // those to an unavailable source record or a recoverable feature error.
    if (primary instanceof AggregateError && !(primary instanceof FeatureContributionReleaseError)) {
      throw new FeatureContributionReleaseError([primary], 'Feature contribution native release failed.');
    }
    throw primary;
  }
  throw new FeatureContributionReleaseError([primary, ...releases], 'Feature contribution operation and release failed.');
}

/** Borrowed states, independently owned signed material. Consumption is not an input here. */
export function ownedGeometryDelta(before: Shape3D | null, after: Shape3D,
  validate: (shape: Shape3D) => number, volume: (shape: Shape3D) => number): GeometryDelta {
  const owners = new ShapeOwners();
  try {
    const useful = (shape: Shape3D): Shape3D | null => {
      if (Math.abs(volume(shape)) <= 1e-8) { owners.release(shape); return null; }
      validate(shape);
      // Boolean outputs may share unchanged faces with their operands.
      const detached = owners.own(copyBodyShape(shape));
      owners.release(shape);
      return detached;
    };
    const added = before ? useful(owners.own(bodyBoolean('subtract', after, before))) : owners.own(copyBodyShape(after));
    if (!before && added) validate(added);
    const removed = before ? useful(owners.own(bodyBoolean('subtract', before, after))) : null;
    const difference = (added ? volume(added) : 0) - (removed ? volume(removed) : 0);
    if (Math.abs(volume(after) - (before ? volume(before) : 0) - difference) > Math.max(1e-6, Math.abs(volume(after)) * 1e-7)) {
      throw new Error('No se puede separar la aportación material del estado exacto del cuerpo.');
    }
    // Every temporary was released above. Transfer only the two retained tools.
    const retained = new Set<Shape3D>([...(added ? [added] : []), ...(removed ? [removed] : [])]);
    const errors = owners.dispose(retained);
    if (errors.length) throw new FeatureContributionReleaseError(errors, 'Feature contribution release failed.');
    retained.forEach(shape => owners.transfer(shape));
    let active = true;
    return { added, removed, dispose() {
      if (!active) return;
      active = false;
      const failures: unknown[] = [];
      for (const shape of [this.added, this.removed]) {
        try { shape?.delete(); } catch (error) { failures.push(error); }
      }
      this.added = this.removed = null;
      if (failures.length) throw new FeatureContributionReleaseError(failures, 'Retained feature contribution release failed.');
    } };
  } catch (error) { return failure(error, owners.dispose()); }
}

/** Symmetric material difference also detects equal-volume changes in different places. */
function materialChanged(before: Shape3D, after: Shape3D, volume: (shape: Shape3D) => number, owners: ShapeOwners): boolean {
  const beforeVolume = volume(before);
  if (Math.abs(volume(after) - beforeVolume) > tolerance(beforeVolume)) return true;
  const added = owners.own(bodyBoolean('subtract', after, before));
  const removed = owners.own(bodyBoolean('subtract', before, after));
  const changed = Math.abs(volume(added)) + Math.abs(volume(removed)) > tolerance(beforeVolume);
  owners.release(added); owners.release(removed);
  return changed;
}

/** A successful Boolean may return an empty compound, never an unvalidated sheet or null shape. */
export function validateFeatureReplayIntermediate(shape: Shape3D, validate: (shape: Shape3D) => number,
  volume: (shape: Shape3D) => number): number {
  const value = volume(shape);
  if (!Number.isFinite(value) || value < -1e-10 || shape.isNull) throw new Error('La aportación produjo un estado intermedio no válido.');
  if (value > 1e-10) { validate(shape); return value; }
  const oc = getOC();
  if (shape.wrapped.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_COMPOUND) {
    throw new Error('Sólo un compuesto sin topología puede representar un estado intermedio vacío.');
  }
  // Empty nested compounds are harmless; every other topology kind is not an
  // empty solid state, even if its volume is numerically zero.
  for (const kind of ['COMPSOLID', 'SOLID', 'SHELL', 'FACE', 'WIRE', 'EDGE', 'VERTEX'] as const) {
    const explorer = new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum[`TopAbs_${kind}`], oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    let containsTopology = false, inspectionFailed = false, inspectionError: unknown;
    try { containsTopology = explorer.More(); }
    catch (error) { inspectionFailed = true; inspectionError = error; throw error; }
    finally {
      try { explorer.delete(); }
      catch (error) { throw new FeatureContributionReleaseError(inspectionFailed ? [inspectionError, error] : [error], 'Empty replay topology inspection release failed.'); }
    }
    if (containsTopology) throw new Error('La geometría intermedia sin volumen contiene topología y no es un vacío válido.');
  }
  return value;
}

/**
 * Returned replacements are owned by the caller. Every route is evaluated on
 * detached candidates; the current catalog and historical tools stay borrowed.
 */
export function featurePatternReplacements(feature: RepetitionFeature, plan: PatternPlan, catalog: NativeBodyCatalog,
  records: ReadonlyMap<string, OwnedFeatureGeometry>, validate: (shape: Shape3D) => number,
  volume: (shape: Shape3D) => number): NativeBodyReplacement[] {
  const operation = feature.featurePattern;
  if (!operation || operation.mode !== 'geometry' || feature.source.mode !== 'features' || feature.source.geometryPattern !== true) throw new Error('La copia de aportaciones requiere el método de geometría explícito.');
  const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
  const targets = operation.targets.map(ref => catalog.resolve(ref)).sort((a, b) => compare(a.ref.bodyId, b.ref.bodyId));
  const seeds = operation.bindings.map(binding => {
    const record = records.get(featureContributionKey(binding.source));
    if (!record || record.error || !record.delta || (!record.delta.added && !record.delta.removed)) {
      throw new Error('No está disponible la aportación material histórica exacta de una semilla.' + (record?.error ? ` ${record.error}` : ''));
    }
    return { binding, record };
  }).sort((a, b) => a.record.order - b.record.order || compare(featureContributionKey(a.record.ref), featureContributionKey(b.record.ref)));
  const events = new Map<string, typeof seeds>();
  for (const seed of seeds) {
    const id = seed.record.ref.sourceFeatureId;
    const event = events.get(id) ?? [];
    event.push(seed); events.set(id, event);
  }
  const owners = new ShapeOwners();
  try {
    const current = new Map(targets.map(target => [target.ref.bodyId, owners.own(copyBodyShape(target.shape))]));
    for (const transform of plan.transforms) {
      const instanceBefore = new Map<string, Shape3D>();
      // One atomic historical event can have several owner outputs. Replay all
      // its removals before its additions; UI binding order has no semantics.
      for (const event of events.values()) for (const effect of ['removed', 'added'] as const) {
        for (const { binding, record } of event) {
          const geometry = record.delta![effect];
          if (!geometry) continue;
          const tool = owners.own(bodyPatternCopy(geometry, transform));
          validate(tool);
          for (const bodyId of [...binding.targetBodyIds].sort(compare)) {
            const previous = current.get(bodyId)!;
            const candidate = owners.own(bodyBoolean(effect === 'removed' ? 'subtract' : 'add', previous, tool));
            const beforeVolume = volume(previous), afterVolume = validateFeatureReplayIntermediate(candidate, validate, volume);
            const change = effect === 'removed' ? beforeVolume - afterVolume : afterVolume - beforeVolume;
            if (change < -tolerance(beforeVolume)) throw new Error('La aportación material produjo un cambio de signo no válido.');
            if (change > tolerance(beforeVolume)) {
              if (!instanceBefore.has(bodyId)) instanceBefore.set(bodyId, owners.own(previous.clone()));
              owners.release(previous); current.set(bodyId, candidate);
            } else owners.release(candidate);
          }
          owners.release(tool);
        }
      }
      const instanceChanged = [...instanceBefore].some(([bodyId, before]) => materialChanged(before, current.get(bodyId)!, volume, owners));
      for (const before of instanceBefore.values()) owners.release(before);
      if (!instanceChanged) throw new Error(`La instancia ${transform.key} no modifica material en ningún destino seleccionado.`);
    }
    const replacements: NativeBodyReplacement[] = [];
    for (const target of targets) {
      const shape = current.get(target.ref.bodyId)!;
      if (materialChanged(target.shape, shape, volume, owners)) replacements.push({ ref: { ...target.ref }, shape });
      else owners.release(shape);
    }
    if (!replacements.length) throw new Error('La repetición no cambia el material final de ningún cuerpo seleccionado.');
    // Intermediate islands are allowed; stageReplaceMany validates all final
    // one-solid owners before any state is committed (including later bridges).
    const retained = new Set(replacements.map(item => item.shape));
    const releases = owners.dispose(retained);
    if (releases.length) throw new FeatureContributionReleaseError(releases, 'Feature replay release failed.');
    retained.forEach(shape => owners.transfer(shape));
    return replacements;
  } catch (error) { return failure(error, owners.dispose()); }
}
