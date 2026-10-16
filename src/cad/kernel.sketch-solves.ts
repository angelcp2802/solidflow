import type { Feature, PlaneFrame, PlaneSupport, SketchFeature, SketchVisual } from './kernel.types';
import type { SketchSolveResult } from '../sketch/types';
import { solveEntityProfileResult } from './kernel.profiles';
import { clonePlaneFrame, offsetPlaneFrame, principalPlaneFrame } from './kernel.frames';
import { advanceLineage } from './kernel.naming';
import { resolveFaceReference } from './kernel.faces';
import { resolveSemanticFaceReference, type SemanticFaceDescriptor } from './kernel.semantic-catalogs';
import { sketchVisual } from './kernel.sketch-visual';

/** Build-local descriptors from the real support resolver, not JSON authority. */
export interface SourceSketchSupportContext {
  readonly planeFeatureIds: ReadonlySet<string>;
  readonly solidFeatureIds: ReadonlySet<string>;
  readonly unavailableFeatureIds: ReadonlySet<string>;
  readonly planes: ReadonlyMap<string, { frame: PlaneFrame; lineage: string }>;
  readonly historicalFaces: ReadonlyMap<string, {
    entries: SemanticFaceDescriptor[]; lineage: string; semantic: boolean;
  }>;
}

/** The existing engine resolver is shared; historical faces stay historical. */
export function resolveSourceSketchSupport(context: SourceSketchSupportContext,
  support: PlaneSupport): { frame: PlaneFrame; lineage: string } | null {
  if (support.kind === 'principal') return { frame: principalPlaneFrame(support.plane),
    lineage: advanceLineage('', ['principal', support.plane]) };
  if (support.kind === 'plane') {
    if (!context.planeFeatureIds.has(support.planeId)) throw new Error('No se encuentra un plano de referencia anterior para este soporte.');
    if (context.unavailableFeatureIds.has(support.planeId)) return null;
    const plane = context.planes.get(support.planeId);
    if (!plane) throw new Error('El plano de soporte no está disponible o no es anterior a esta operación.');
    return { frame: clonePlaneFrame(plane.frame), lineage: plane.lineage };
  }
  if (!context.solidFeatureIds.has(support.face.sourceFeatureId)) {
    throw new Error('La cara de soporte debe pertenecer a una operación sólida anterior. Recupera la selección de la cara.');
  }
  if (context.unavailableFeatureIds.has(support.face.sourceFeatureId)) return null;
  const source = context.historicalFaces.get(support.face.sourceFeatureId);
  if (!source) throw new Error('No se encuentra la geometría de la operación que contiene la cara de soporte. Recupera la selección de la cara.');
  return { frame: source.semantic ? resolveSemanticFaceReference(source, support.face, support.face.sourceFeatureId)
    : resolveFaceReference(source, support.face, support.face.sourceFeatureId),
    lineage: advanceLineage(source.lineage, ['face', support.face.sourceFeatureId, support.face.key]) };
}

export const SOURCE_SKETCH_SOLVE_REVISION = 'source-sketch-solve-v1';
declare const handleBrand: unique symbol;
declare const checkpointBrand: unique symbol;
export interface SourceSketchSolveHandle { readonly [handleBrand]: true }
export interface SourceSketchSolveCheckpoint { readonly [checkpointBrand]: true }
export interface SourceSketchSolveView {
  readonly revision: typeof SOURCE_SKETCH_SOLVE_REVISION;
  readonly sourceIndex: number;
  readonly input: SketchFeature;
  readonly resolved: SketchFeature;
  readonly result: SketchSolveResult;
  readonly frame: PlaneFrame;
  readonly supportLineage: string | null;
}
// Reader methods are not caller authority: evaluation checks the actual reader
// object here before invoking the closures backed by this module's private maps.
const readers = new WeakMap<object, {
  checkpoint(current: readonly Feature[], sourceIds: readonly string[]): SourceSketchSolveCheckpoint;
  assertCheckpoint(proof: SourceSketchSolveCheckpoint, current: readonly Feature[]): void;
  readCheckpointSource(proof: SourceSketchSolveCheckpoint, current: readonly Feature[], sourceId: string): SourceSketchSolveView;
}>();

export function checkpointSourceSketchSolves(registry: SourceSketchSolveRegistry,
  current: readonly Feature[], sourceIds: readonly string[]): SourceSketchSolveCheckpoint {
  const issued = readers.get(registry);
  if (!issued) throw new Error('Source sketch solve reader was not issued by the real-solve registry.');
  return issued.checkpoint(current, sourceIds);
}
export function assertSourceSketchSolvesCurrent(registry: SourceSketchSolveRegistry,
  checkpoint: SourceSketchSolveCheckpoint, current: readonly Feature[]): void {
  const issued = readers.get(registry);
  if (!issued) throw new Error('Source sketch solve reader was not issued by the real-solve registry.');
  issued.assertCheckpoint(checkpoint, current);
}

/** Read only a handle actually covered by this current build-issued checkpoint. */
export function readCheckpointSourceSketchSolve(registry: SourceSketchSolveRegistry,
  checkpoint: SourceSketchSolveCheckpoint, current: readonly Feature[], sourceId: string): SourceSketchSolveView {
  const issued = readers.get(registry);
  if (!issued) throw new Error('Source sketch solve reader was not issued by the real-solve registry.');
  return issued.readCheckpointSource(checkpoint, current, sourceId);
}

// Canonical strings, not a hash alone, are the authority for definition equality.
// Successful solve results retain every field, including measured driven values.
function canonical(value: unknown): string {
  if (typeof value === 'number' && !Number.isFinite(value)) return `number:${String(value)}`;
  if (typeof value === 'number' && Object.is(value, -0)) return 'number:-0';
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
interface RecordProof {
  readonly epoch: object;
  readonly view: SourceSketchSolveView;
  readonly fullSolveKey: string;
  readonly supportOwner: object | null;
}
export type SourceSketchStageResult =
  | { readonly kind: 'support-unavailable' }
  | { readonly kind: 'staged'; readonly handle: SourceSketchSolveHandle | null };

/** No accessor is invoked. Unrepresentable raw input disables certification only. */
function snapshotDefinition(feature: Feature): Feature | null {
  const active = new WeakSet<object>();
  const visit = (value: unknown, depth: number): unknown => {
    if (depth > 64) throw new Error('Definition exceeds the snapshot depth envelope.');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object') throw new Error('Not a JSON definition value.');
    if (active.has(value)) throw new Error('Cyclic definition.');
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== (Array.isArray(value) ? Array.prototype : Object.prototype) && prototype !== null) {
      throw new Error('Not a plain definition.');
    }
    active.add(value);
    try {
      if (Object.getOwnPropertySymbols(value).length) throw new Error('Symbol definition keys.');
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Array.isArray(value)) {
        const length = descriptors.length?.value;
        if (!Number.isSafeInteger(length) || length < 0 || Object.keys(descriptors).length !== length + 1) {
          throw new Error('Sparse or extended definition array.');
        }
        const output: unknown[] = [];
        for (let index = 0; index < length; index++) {
          const item = descriptors[String(index)];
          if (!item || !('value' in item) || !item.enumerable) throw new Error('Definition array accessor.');
          output.push(visit(item.value, depth + 1));
        }
        return output;
      }
      const output: Record<string, unknown> = Object.create(null);
      for (const [key, item] of Object.entries(descriptors)) {
        if (!('value' in item) || !item.enumerable) throw new Error('Definition accessor or hidden field.');
        Object.defineProperty(output, key, { value: visit(item.value, depth + 1), enumerable: true, writable: true, configurable: true });
      }
      return output;
    } finally { active.delete(value); }
  };
  try { return visit(feature, 0) as Feature; }
  catch { return null; }
}

/**
 * Internal build issuer. It accepts definitions and real history, never a caller
 * SolveResult, status, frame, or success token. The native context is supplied
 * only by the engine's reconstruction closure; it is not serialized authority.
 */
export function createSourceSketchSolveRegistry(features: readonly Feature[], context: SourceSketchSupportContext) {
  const epoch = Object.freeze({});
  // Nothing enumerates features here. Admission occurs inside the engine's
  // original per-feature guard, so a later malformed raw object stays local.
  const definitions = new Map<number, { snapshot: Feature; key: string } | null>();
  let unattestableFrom = Infinity;
  const records = new WeakMap<SourceSketchSolveHandle, RecordProof>();
  const checkpoints = new WeakMap<SourceSketchSolveCheckpoint, readonly SourceSketchSolveHandle[]>();
  let published = new Map<string, SourceSketchSolveHandle>();
  let active = true;
  const requireActive = () => { if (!active) throw new Error('Source sketch solve registry has been revoked.'); };
  const supportOwner = (feature: SketchFeature): object | null => feature.support?.kind === 'plane'
    ? context.planes.get(feature.support.planeId) ?? null : feature.support?.kind === 'face'
      ? context.historicalFaces.get(feature.support.face.sourceFeatureId) ?? null : null;
  const frameFor = (feature: SketchFeature) => {
    const support = feature.support ? resolveSourceSketchSupport(context, feature.support) : null;
    if (feature.support && !support) return null;
    return { frame: support ? offsetPlaneFrame(support.frame, feature.offset) : principalPlaneFrame(feature.plane, feature.offset),
      supportLineage: support?.lineage ?? null };
  };
  const prefixState = (current: readonly Feature[], index: number): 'valid' | 'unattestable' | 'stale' => {
    if (current.length <= index) return 'stale';
    if (unattestableFrom <= index) return 'unattestable';
    for (let i = 0; i <= index; i++) {
      const admitted = definitions.get(i);
      if (!admitted) return 'unattestable';
      const snapshot = snapshotDefinition(current[i]);
      if (!snapshot || canonical(snapshot) !== admitted.key) return 'stale';
    }
    return 'valid';
  };
  const requirePrefix = (current: readonly Feature[], index: number) => {
    if (prefixState(current, index) !== 'valid') throw new Error('Source sketch historical definitions have changed or cannot be attested.');
  };
  const requireRecord = (handle: SourceSketchSolveHandle, current: readonly Feature[], prefixChecked = false): RecordProof => {
    requireActive();
    const record = records.get(handle);
    if (!record || record.epoch !== epoch || published.get(record.view.input.id) !== handle) {
      throw new Error('Source sketch solve handle is not published by this build.');
    }
    if (!prefixChecked) requirePrefix(current, record.view.sourceIndex);
    const admitted = definitions.get(record.view.sourceIndex);
    if (!admitted || canonical(record.view.input) !== admitted.key) {
      throw new Error('Source sketch historical admission changed after its solve.');
    }
    const actual = frameFor(record.view.input);
    if (!actual || context.unavailableFeatureIds.has(record.view.input.id)
      || supportOwner(record.view.input) !== record.supportOwner
      || canonical(actual.frame) !== canonical(record.view.frame)
      || actual.supportLineage !== record.view.supportLineage
      || canonical(record.view.result) !== record.fullSolveKey) {
      throw new Error('Source sketch solve support or result is no longer current in its historical prefix.');
    }
    return record;
  };
  const controller = Object.freeze({
    /** Metadata-only admission, after the engine's existing declaration guards. */
    observeFeature(feature: Feature, index: number): void {
      requireActive();
      try {
        if (definitions.has(index)) {
          unattestableFrom = Math.min(unattestableFrom, index);
          return;
        }
        const snapshot = snapshotDefinition(feature);
        definitions.set(index, snapshot ? { snapshot, key: canonical(snapshot) } : null);
        if (!snapshot) unattestableFrom = Math.min(unattestableFrom, index);
      } catch {
        // Snapshot/registration failure cannot turn an otherwise ordinary
        // feature into a global failure or manufacture a success certificate.
        unattestableFrom = Math.min(unattestableFrom, index);
      }
    },
    /** Stage the actual visual/maps first; failure cannot publish a solve handle. */
    solveAndStage(feature: SketchFeature, sourceIndex: number,
      stage: (resolved: SketchFeature, frame: PlaneFrame, supportLineage: string | null, visual: SketchVisual) => void): SourceSketchStageResult {
      requireActive();
      if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || features[sourceIndex] !== feature) {
        throw new Error('Source sketch must be the exact definition at its historical index.');
      }
      if (feature.profile.kind !== 'entities' || feature.suppressed || published.has(feature.id)) {
        throw new Error('Only one active entity sketch solve can be published per build.');
      }
      const placement = frameFor(feature);
      if (!placement) return { kind: 'support-unavailable' };
      if (!['XY', 'XZ', 'YZ'].includes(feature.plane)) throw new Error('Plano de croquis desconocido.');
      if (!Number.isFinite(feature.offset) || Math.abs(feature.offset) > 1_000_000) {
        throw new Error('El desplazamiento del plano debe ser finito y no superar 1.000.000 mm.');
      }
      const beforeStage = prefixState(features, sourceIndex);
      if (beforeStage === 'stale') throw new Error('Source sketch historical definitions have changed.');
      // Preserve the ordinary shallow Feature copy and real solve even if an
      // ignored raw extra field cannot be cloned. Such a source gets no token.
      const base = { ...feature };
      const profile = feature.profile;
      if (profile.kind !== 'entities') throw new Error('Entity source profile changed during solve staging.');
      const result = solveEntityProfileResult(profile);
      if (result.status !== 'underdefined' && result.status !== 'fullyDefined') {
        throw new Error(`No se puede resolver el croquis (${result.status}): ${result.message}`);
      }
      const resolved: SketchFeature = { ...base, profile: result.profile };
      const admitted = definitions.get(sourceIndex);
      const input = admitted?.snapshot;
      const view = beforeStage === 'valid' && input?.type === 'sketch' ? structuredClone<SourceSketchSolveView>({
        revision: SOURCE_SKETCH_SOLVE_REVISION, sourceIndex, input,
        resolved: { ...input, profile: result.profile }, result, ...placement }) : null;
      const owner = supportOwner(feature);
      const visual = sketchVisual(resolved, placement.frame);
      stage(resolved, placement.frame, placement.supportLineage, visual);
      requireActive();
      if (!view) return { kind: 'staged', handle: null };
      requirePrefix(features, sourceIndex);
      const afterStage = frameFor(view.input);
      if (!afterStage || supportOwner(view.input) !== owner || canonical(afterStage) !== canonical(placement)) {
        throw new Error('Source sketch support changed while staging its visual and maps.');
      }
      // No stage caller receives the handle or the retained result/frame objects.
      const handle = Object.freeze({}) as SourceSketchSolveHandle;
      records.set(handle, { epoch, view, fullSolveKey: canonical(view.result), supportOwner: owner });
      const next = new Map(published);
      next.set(view.input.id, handle);
      published = next;
      return { kind: 'staged', handle };
    },
    handleFor(sourceId: string): SourceSketchSolveHandle | undefined { requireActive(); return published.get(sourceId); },
    read(handle: SourceSketchSolveHandle, current: readonly Feature[]): SourceSketchSolveView {
      return structuredClone(requireRecord(handle, current).view);
    },
    checkpoint(current: readonly Feature[], sourceIds: readonly string[]): SourceSketchSolveCheckpoint {
      requireActive();
      const handles = [...new Set(sourceIds)].map(id => {
        const handle = published.get(id);
        if (!handle) throw new Error(`No published real source sketch solve for ${id}.`);
        return handle;
      });
      // One prefix pass for a group, rather than copying a full prefix per solve.
      const last = Math.max(-1, ...handles.map(handle => records.get(handle)!.view.sourceIndex));
      if (last >= 0) requirePrefix(current, last);
      for (const handle of handles) requireRecord(handle, current, true);
      const proof = Object.freeze({}) as SourceSketchSolveCheckpoint;
      checkpoints.set(proof, handles);
      return proof;
    },
    assertCheckpoint(proof: SourceSketchSolveCheckpoint, current: readonly Feature[]): void {
      requireActive();
      const handles = checkpoints.get(proof);
      if (!handles) throw new Error('Source sketch solve checkpoint is not from this build.');
      const last = Math.max(-1, ...handles.map(handle => records.get(handle)!.view.sourceIndex));
      if (last >= 0) requirePrefix(current, last);
      for (const handle of handles) requireRecord(handle, current, true);
    },
    /** Build abort/finally invalidates every prior handle and checkpoint. */
    revoke(): void { active = false; published.clear(); definitions.clear(); },
  });
  // The evaluator receives only this reader. Issuing and revoking remain in the
  // engine reconstruction closure, never in saved inputs or evaluation DTOs.
  const reader = Object.freeze({ handleFor: controller.handleFor, read: controller.read,
    checkpoint: controller.checkpoint, assertCheckpoint: controller.assertCheckpoint });
  readers.set(reader, { checkpoint: controller.checkpoint, assertCheckpoint: controller.assertCheckpoint,
    readCheckpointSource(proof, current, sourceId) {
      controller.assertCheckpoint(proof, current);
      const handle = published.get(sourceId);
      if (!handle || !checkpoints.get(proof)?.includes(handle)) throw new Error('The source solve is not included in this checkpoint.');
      return structuredClone(requireRecord(handle, current).view);
    } });
  return Object.freeze({ ...controller, reader });
}
export type SourceSketchSolveRegistry = ReturnType<typeof createSourceSketchSolveRegistry>['reader'];
