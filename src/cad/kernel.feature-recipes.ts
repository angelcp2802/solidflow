import { getOC, measureShapeVolumeProperties, type Shape3D } from 'replicad';
import type { BodyReference, Feature, Vec3 } from './kernel.types';
import {
  exactStateKey, extractRecipeClosure, fixedProfileInstanceInput, intrinsicProfileInstancePlacement, requireInitialRecipeDeclaration,
  type IntrinsicRecipeExtrusionPlacement, type RegenerationRequest, type RecipeClosure, type RecipeOperation, type RecipeOwnerApplication,
} from '../model/featureRecipes';
import {
  bodyBoolean, copyBodyShape, createConservativeBodyBounds, validateBodyShape, type NativeBodyCatalog,
  type NativeBodyReplacement, type NativeBodyStateUpdate, type NativeBodyTransaction,
} from './kernel.bodies';
import { buildRecipeInstanceTool } from './kernel.recipe-instance';
import { framePoint } from './kernel.frames';
import { validatePositiveClosedTool } from './kernel.closed-tools';
import { validateEntityRecipeProfileForAbsence, type EntityRecipeSolveInput } from './kernel.recipe-entities';
import { isNativeCleanupFailure, NativeCleanupError, withNativeOwners, type NativeOwner, type NativeOwners } from './kernel.native-ownership';
import { attestNativeRecipeScope, assertNativeRecipeScopeCurrent, type NativeRecipeScopeAttestation } from './kernel.recipe-scopes';

import { checkpointSourceSketchSolves, assertSourceSketchSolvesCurrent,
  type SourceSketchSolveCheckpoint, type SourceSketchSolveRegistry } from './kernel.sketch-solves';

export const RECIPE_EVALUATOR_REVISION = 'intrinsic-real-solved-profiles-all-forward-v5';
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const tolerance = (volume: number): number => Math.max(1e-8, Math.abs(volume) * 1e-10);
const sameRef = (a: Readonly<BodyReference>, b: Readonly<BodyReference>): boolean =>
  a.bodyId === b.bodyId && a.sourceFeatureId === b.sourceFeatureId;
const frozenRef = (ref: Readonly<BodyReference>): Readonly<BodyReference> => Object.freeze({ ...ref });

/** Borrowed exact output captured by this reconstruction, never an aggregate. */
export interface NativeRecipeSourceState {
  readonly ref: Readonly<BodyReference>;
  readonly lineage: string;
  readonly shape?: Shape3D;
  /** Ordinary capture failure belongs to its consumer; release failures remain fatal. */
  readonly error?: unknown;
}
export interface RecipeEvaluationInput {
  /** Parsed current definitions. The evaluator always extracts its own fresh closure. */
  readonly features: readonly Feature[];
  readonly request: RegenerationRequest;
  readonly catalog: NativeBodyCatalog;
  readonly historicalStates: ReadonlyMap<string, NativeRecipeSourceState>;
  /** Build-local real-solve capability; never saved or supplied in a worker DTO. */
  readonly sourceSketchSolves?: SourceSketchSolveRegistry;
}
export interface RecipeVirtualOutput {
  readonly sourcePoststate: Readonly<BodyReference>;
  readonly targetBodyId: string;
  readonly address: string;
  readonly role: 'body';
  /** Local working revision, not a persisted BodyReference or allocated identity. */
  readonly inputRevision: number;
  readonly outputRevision: number;
  readonly materialChanged: boolean;
}
export interface RecipeEvaluationAttestation {
  readonly evaluatorRevision: typeof RECIPE_EVALUATOR_REVISION;
  readonly patternId: string;
  readonly recipeFingerprintInput: string;
  readonly sources: readonly { readonly ref: Readonly<BodyReference>; readonly lineage: string }[];
  readonly targets: readonly { readonly ref: Readonly<BodyReference>; readonly lineage: string }[];
  readonly virtualOutputs: readonly RecipeVirtualOutput[];
}
export interface OwnedRecipeEvaluation {
  /** Borrowed until dispose; stageFeatureRecipeEvaluation copies then consumes them. */
  readonly replacements: readonly NativeBodyReplacement[];
  readonly attestation: RecipeEvaluationAttestation;
  /** One release attempt for every retained candidate, including on failure. */
  dispose(): void;
}
interface NativeSnapshot { ref: Readonly<BodyReference>; lineage: string; shape: Shape3D }
interface EvaluationProof {
  active: boolean;
  patternId: string;
  fingerprintInput: string;
  catalog: NativeBodyCatalog;
  history: ReadonlyMap<string, NativeRecipeSourceState>;
  sources: NativeSnapshot[];
  targets: NativeSnapshot[];
  scope: NativeRecipeScopeAttestation;
  sketchSolves?: { registry: SourceSketchSolveRegistry; checkpoint: SourceSketchSolveCheckpoint };
}
const evaluations = new WeakMap<OwnedRecipeEvaluation, EvaluationProof>();

/** Semantic lookup identity. It does not create a target body@parent state. */
export function recipeVirtualOutputKey(source: Readonly<BodyReference>, targetBodyId: string,
  address: string, role: 'body' = 'body'): string {
  return JSON.stringify([source.bodyId, source.sourceFeatureId, targetBodyId, address, role]);
}

function volume(shape: Shape3D): number {
  return withNativeOwners(owners => {
    const properties = owners.own(measureShapeVolumeProperties(shape));
    const value = properties.volume;
    if (!Number.isFinite(value) || value < -1e-10) throw new Error('Recipe material has a nonfinite or negative volume.');
    return value;
  }, undefined, 'Recipe mass-property inspection or release failed.');
}

function finiteBounds(shape: Shape3D): void {
  withNativeOwners(owners => {
    const bounds = owners.own(shape.boundingBox).bounds;
    if (bounds.length !== 2 || bounds.some(side => side.length !== 3 || side.some(value => !Number.isFinite(value)))) {
      throw new Error('Recipe material must have finite three-dimensional bounds.');
    }
  }, undefined, 'Recipe bounds inspection or release failed.');
}

/**
 * Absence proof only for the intrinsic ALL/unilateral ThroughAll cut subset.
 * The caller has already validated this current detached owner with intermediate().
 * A conservative AABB may prove the entire owner is behind the physical ray;
 * it never chooses ownership, proves a general miss or turns native errors into no-ops.
 */
function allCutEntirelyBehindRay(closure: RecipeClosure, operation: RecipeOperation,
  address: string, shape: Shape3D, entitySource: EntityRecipeSolveInput | undefined,
  assertWorkingCurrent: () => void): boolean {
  if (closure.request.scope.mode !== 'all' || operation.type !== 'cut'
    || operation.termination?.kind !== 'throughAll' || operation.termination.bothDirections) return false;
  const sketch = closure.definitions.find(definition => definition.feature.id === operation.sketchId)?.feature;
  if (sketch?.type !== 'sketch') return false;
  let entityPlacement: Readonly<IntrinsicRecipeExtrusionPlacement> | undefined;
  let origin: Vec3, ray: Vec3;
  if (sketch.profile.kind === 'entities') {
    if (!entitySource) throw new Error('Entity absence requires the engine real-solve checkpoint.');
    const placement = intrinsicProfileInstancePlacement(closure, operation.featureId, address);
    entityPlacement = placement;
    origin = placement.frame.origin;
    // Use the same physical ray as the native prism factory; parity and offset
    // were already applied exactly once by the canonical placement adapter.
    ray = placement.frame.normal.map(value => Math.sign(placement.signedDepth) * value) as Vec3;
  } else {
    if (sketch.profile.kind !== 'rectangle' && sketch.profile.kind !== 'circle') return false;
    const resolved = fixedProfileInstanceInput(closure, operation.featureId, address);
    if (resolved.profile.kind !== 'rectangle' && resolved.profile.kind !== 'circle') return false;
    const profile = resolved.profile;
    const parameter = (value: number): boolean => Number.isFinite(value) && value >= .01 && value <= 100_000;
    // Do not let a behind-owner shortcut hide primitive parameter rejection.
    // Inconclusive/invalid inputs still go through the unchanged builder validator.
    if (!Array.isArray(profile.center) || profile.center.length !== 2 || ![0, 1].every(axis => Object.hasOwn(profile.center, axis)
        && Number.isFinite(profile.center[axis]) && Math.abs(profile.center[axis]) <= 1_000_000)
      || !parameter(Math.abs(resolved.signedDepth)) || (profile.kind === 'circle' ? !parameter(profile.radius)
        : !parameter(profile.width) || !parameter(profile.height))) return false;
    origin = framePoint(resolved.frame, profile.center[0], profile.center[1]); ray = resolved.ray;
  }
  if (!origin.every(Number.isFinite) || !ray.every(Number.isFinite)) throw new Error('Recipe ray placement must be finite.');
  const projection = withNativeOwners(owners => {
    // The SDK getter excludes BRep tolerances. Absence needs the conservative
    // native envelope including those tolerances, not only exact geometry.
    const box = owners.own(createConservativeBodyBounds(shape));
    const low = owners.own(box.CornerMin()), high = owners.own(box.CornerMax());
    const bounds = [[low.X(), low.Y(), low.Z()], [high.X(), high.Y(), high.Z()]];
    if (!Array.isArray(bounds) || bounds.length !== 2 || ![0, 1].every(side => Object.hasOwn(bounds, side)
      && Array.isArray(bounds[side]) && bounds[side].length === 3 && [0, 1, 2].every(axis =>
        Object.hasOwn(bounds[side], axis) && Number.isFinite(bounds[side][axis])))
      || [0, 1, 2].some(axis => bounds[0][axis] > bounds[1][axis])) {
      throw new Error('Recipe absence proof needs finite ordered three-dimensional bounds.');
    }
    let maximum = -Infinity, arithmeticScale = 0;
    for (const x of [bounds[0][0], bounds[1][0]]) for (const y of [bounds[0][1], bounds[1][1]])
      for (const z of [bounds[0][2], bounds[1][2]]) {
        const point = [x, y, z], terms = point.map((coordinate, axis) => (coordinate - origin[axis]) * ray[axis]);
        const projection = terms[0] + terms[1] + terms[2];
        const scale = point.reduce((sum, coordinate, axis) => sum + (Math.abs(coordinate) + Math.abs(origin[axis])) * Math.abs(ray[axis]), 0);
        if (!terms.every(Number.isFinite) || !Number.isFinite(projection) || !Number.isFinite(scale)) {
          throw new Error('Recipe absence-proof projection must remain finite.');
        }
        maximum = Math.max(maximum, projection); arithmeticScale = Math.max(arithmeticScale, scale);
      }
    // Strictly negative separation, with a geometric guard and arithmetic allowance.
    // Contact, near-plane and inconclusive boxes retain the original native path.
    const guard = 1e-6 + 32 * Number.EPSILON * arithmeticScale;
    if (!Number.isFinite(guard)) throw new Error('Recipe absence-proof guard must remain finite.');
    return { maximum, guard };
  }, undefined, 'Recipe forward-material bounds inspection or release failed.');
  if (projection.maximum >= -projection.guard) return false;
  assertWorkingCurrent();
  let witnessTolerance = 0;
  if (entityPlacement) {
    // AABB separation alone cannot authorize skipping an entity's native
    // validation. Read its real checkpoint/profile, construct the shared
    // positive closed witness and release it successfully before returning.
    witnessTolerance = validateEntityRecipeProfileForAbsence({ source: entitySource!, placement: entityPlacement,
      validateTool: validatePositiveClosedTool, assertWorkingCurrent });
  }
  assertWorkingCurrent();
  const rayLength = Math.hypot(...ray), guard = projection.guard + witnessTolerance * rayLength;
  if (!Number.isFinite(rayLength) || rayLength <= 0 || !Number.isFinite(guard)) throw new Error('Recipe witness-tolerance separation must remain finite.');
  // A real witness with a wider native tolerance makes the proof inconclusive;
  // it does not turn an uncertain owner into a no-op or a caught miss.
  return projection.maximum < -guard;
}

function validateSingle(shape: Shape3D): void { validateBodyShape(shape); finiteBounds(shape); }

/** Only a successful Boolean's genuinely topology-free compound may be empty. */
function intermediate(shape: Shape3D): { volume: number; empty: boolean } {
  if (shape.isNull) throw new Error('A recipe operation returned null native geometry.');
  const value = volume(shape);
  if (value > 1e-10) return withNativeOwners(owners => {
    finiteBounds(shape);
    const oc = getOC(), analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
    if (!analyzer.IsValid()) throw new Error('A nonempty recipe working state is not a valid BRep.');
    const solids = owners.ownAll(shape.solids);
    if (!solids.length) throw new Error('Positive material must consist of closed solids.');
    // Temporary islands have one virtual owner; no split identities are allocated.
    // Every island must be valid/closed; persistent cardinality is checked later.
    for (const solid of solids) validateBodyShape(solid);
    for (const kind of ['SHELL', 'FACE', 'WIRE', 'EDGE', 'VERTEX'] as const) {
      const loose = owners.own(new oc.TopExp_Explorer(shape.wrapped,
        oc.TopAbs_ShapeEnum[`TopAbs_${kind}`], oc.TopAbs_ShapeEnum.TopAbs_SOLID));
      if (loose.More()) throw new Error('A recipe working state contains topology outside its closed solids.');
      owners.release(loose);
    }
    return { volume: value, empty: false };
  }, undefined, 'Recipe closed-material inspection or release failed.');
  return withNativeOwners(owners => {
    const oc = getOC();
    if (shape.wrapped.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_COMPOUND) {
      throw new Error('Zero material alone does not establish a valid empty recipe state.');
    }
    for (const kind of ['COMPSOLID', 'SOLID', 'SHELL', 'FACE', 'WIRE', 'EDGE', 'VERTEX'] as const) {
      const explorer = owners.own(new oc.TopExp_Explorer(shape.wrapped,
        oc.TopAbs_ShapeEnum[`TopAbs_${kind}`], oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
      if (explorer.More()) throw new Error('An empty recipe state must contain no sheet, debris or other topology.');
      owners.release(explorer);
    }
    return { volume: value, empty: true };
  }, undefined, 'Recipe empty-state inspection or release failed.');
}

function release(owners: NativeOwners, value: NativeOwner): void {
  owners.release(value);
  const errors = owners.cleanupErrors();
  if (errors.length) throw new NativeCleanupError(undefined, errors, 'Recipe working-resource release failed.');
}

/** Comparison only: no signed source contributions are captured or replayed. */
function materialChanged(before: Shape3D, after: Shape3D, owners: NativeOwners): boolean {
  const a = intermediate(before), b = intermediate(after);
  if (a.empty || b.empty) return a.empty !== b.empty;
  if (Math.abs(a.volume - b.volume) > tolerance(a.volume)) return true;
  const removed = owners.own(bodyBoolean('subtract', before, after));
  const added = owners.own(bodyBoolean('subtract', after, before));
  const changed = Math.abs(volume(removed)) + Math.abs(volume(added)) > tolerance(a.volume);
  release(owners, removed); release(owners, added);
  return changed;
}

function preflight(input: RecipeEvaluationInput, closure: RecipeClosure): { sources: NativeSnapshot[]; targets: NativeSnapshot[] } {
  const sources: NativeSnapshot[] = [], targets: NativeSnapshot[] = [];
  for (const requirement of closure.nativeRequirements) {
    if (requirement.kind === 'materialized-source') {
      const source = input.historicalStates.get(exactStateKey(requirement.ref));
      if (!source || !sameRef(source.ref, requirement.ref)) throw new Error('The exact historical recipe source is unavailable.');
      if (source.error !== undefined) {
        if (isNativeCleanupFailure(source.error)) throw source.error;
        throw new Error('The exact historical recipe source could not be captured.', { cause: source.error });
      }
      if (!source.shape || typeof source.lineage !== 'string' || !source.lineage.length) {
        throw new Error('A potential source declaration is not a materialized native recipe state.');
      }
      validateSingle(source.shape);
      sources.push({ ref: frozenRef(source.ref), lineage: source.lineage, shape: source.shape });
    } else if (requirement.kind === 'current-target') {
      const target = input.catalog.resolve(requirement.ref);
      validateSingle(target.shape);
      targets.push({ ref: frozenRef(target.ref), lineage: target.lineage, shape: target.shape });
    } else throw new Error('Exact face/plane recipe evaluation remains pending; no native reference is guessed.');
  }
  sources.sort((a, b) => compare(exactStateKey(a.ref), exactStateKey(b.ref)));
  targets.sort((a, b) => compare(a.ref.bodyId, b.ref.bodyId));
  return { sources, targets };
}

function assertParent(application: RecipeOwnerApplication, targetBodyId: string, address: string,
  outputs: ReadonlyMap<string, RecipeVirtualOutput>): void {
  const parent = application.selectedParent;
  if (!parent) return;
  const output = outputs.get(recipeVirtualOutputKey(parent.sourcePoststate, targetBodyId, address, parent.outputRole));
  if (parent.targetBodyId !== targetBodyId || parent.outputRole !== 'body' || !output
    || !sameRef(output.sourcePoststate, parent.sourcePoststate) || output.targetBodyId !== targetBodyId
    || output.address !== address || output.role !== parent.outputRole) {
    throw new Error('The child recipe has no exact same-instance parent owner output.');
  }
}

/**
 * Regenerates actual fixed-profile tools in canonical instance/history order.
 * This API is not wired to the saved-document grammar or worker yet. All inputs
 * and sources remain borrowed; no catalog publication occurs here.
 */
export function evaluateFeatureRecipes(input: RecipeEvaluationInput): OwnedRecipeEvaluation {
  try {
    const closure = requireInitialRecipeDeclaration(extractRecipeClosure(input.features, input.request));
    if (closure.request.scope.mode === 'auto' || closure.request.variation.kind !== 'none') {
      throw new Error('Automatic discovery and variation require their pending native recipe policies.');
    }
    // Entity declarations still need current build-issued solves before any
    // native clone or absence decision; their native profiles are validated below.
    const entitySketchIds = [...new Set(closure.operations.flatMap(operation => {
      const sketch = closure.definitions.find(item => item.feature.id === operation.sketchId)?.feature;
      return sketch?.type === 'sketch' && sketch.profile.kind === 'entities' ? [sketch.id] : [];
    }))];
    if (entitySketchIds.length && !input.sourceSketchSolves) throw new Error('Entity recipes require the engine real-solve registry.');
    const sketchSolves = input.sourceSketchSolves ? { registry: input.sourceSketchSolves,
      checkpoint: checkpointSourceSketchSolves(input.sourceSketchSolves, input.features, entitySketchIds) } : undefined;
    const scope = attestNativeRecipeScope(closure.request.scope, closure.request.targetSnapshot, input.catalog);
    // All native requirements resolve before the first target clone or tool.
    const snapshots = preflight(input, closure);
    return withNativeOwners(owners => {
      const initial = new Map<string, Shape3D>(), current = new Map<string, Shape3D>(), revisions = new Map<string, number>();
      for (const target of snapshots.targets) {
        initial.set(target.ref.bodyId, owners.own(copyBodyShape(target.shape)));
        current.set(target.ref.bodyId, owners.own(copyBodyShape(target.shape)));
        revisions.set(target.ref.bodyId, 0);
      }
      const outputs = new Map<string, RecipeVirtualOutput>();
      for (const transform of closure.request.plan.transforms) {
        const instanceBefore = new Map<string, Shape3D>();
        for (const [bodyId, shape] of current) instanceBefore.set(bodyId, owners.own(copyBodyShape(shape)));
        // The plan's address order is preserved, never lexically re-sorted.
        for (const operation of closure.operations) {
          const groups = new Map<string, RecipeOwnerApplication[]>();
          for (const application of operation.applications) {
            const bodyId = application.targetAtPatternInput.bodyId, group = groups.get(bodyId) ?? [];
            group.push(application); groups.set(bodyId, group);
          }
          for (const bodyId of [...groups.keys()].sort(compare)) {
            const applications = groups.get(bodyId)!;
            for (const application of applications) assertParent(application, bodyId, transform.key, outputs);
            const before = current.get(bodyId)!, inputRevision = revisions.get(bodyId)!;
            const assertWorkingCurrent = () => {
              if (current.get(bodyId) !== before || revisions.get(bodyId) !== inputRevision) throw new Error('The recipe working owner/revision changed during tool construction.');
              if (sketchSolves) assertSourceSketchSolvesCurrent(sketchSolves.registry, sketchSolves.checkpoint, input.features);
            };
            assertWorkingCurrent();
            const beforeState = intermediate(before);
            if (beforeState.empty && operation.termination?.kind !== 'blind' && operation.termination?.kind !== 'upToSurface') {
              throw new Error('A dynamic end condition on an empty working owner needs a separate extent policy.');
            }
            // Equivalent fixed intrinsic bindings share one event/target tool.
            // Every source was attested above and every route counted by extraction.
            const entitySource = sketchSolves ? { ...sketchSolves, features: input.features } : undefined;
            let changed = false;
            if (!allCutEntirelyBehindRay(closure, operation, transform.key, before, entitySource, assertWorkingCurrent)) {
              const built = buildRecipeInstanceTool({ closure, featureId: operation.featureId,
                address: transform.key, targetBodyId: bodyId, workingTarget: before, assertWorkingCurrent, entitySource,
                // Tools may contain several closed regions. Recipe/profile gates
                // remain in the bridge; source/current/final owners still use validateSingle.
                validateTool: validatePositiveClosedTool });
              const tool = owners.own(built.tool);
              assertWorkingCurrent();
              const raw = owners.own(bodyBoolean(built.operation, before, tool));
              assertWorkingCurrent();
              const rawState = intermediate(raw);
              const signedChange = built.operation === 'subtract' ? beforeState.volume - rawState.volume : rawState.volume - beforeState.volume;
              if (signedChange < -tolerance(beforeState.volume)) throw new Error('A regenerated operation changed material with the wrong sign.');
              changed = materialChanged(before, raw, owners);
              if (changed) {
                // Empty topology has no borrowed material to alias. Nonempty
                // Boolean results are geometrically detached before tool retirement.
                const next = rawState.empty ? raw : owners.own(copyBodyShape(raw));
                if (next !== raw) release(owners, raw);
                release(owners, tool); release(owners, before);
                current.set(bodyId, next); revisions.set(bodyId, inputRevision + 1);
              } else { release(owners, raw); release(owners, tool); }
            }
            for (const application of applications) {
              const output: RecipeVirtualOutput = Object.freeze({ sourcePoststate: frozenRef(application.sourcePoststate),
                targetBodyId: bodyId, address: transform.key, role: 'body', inputRevision,
                outputRevision: revisions.get(bodyId)!, materialChanged: changed });
              outputs.set(recipeVirtualOutputKey(application.sourcePoststate, bodyId, transform.key), output);
            }
          }
        }
        const instanceChanged = [...current].some(([bodyId, shape]) => materialChanged(instanceBefore.get(bodyId)!, shape, owners));
        for (const shape of instanceBefore.values()) release(owners, shape);
        if (!instanceChanged) throw new Error(`Recipe instance ${transform.key} changes no material in any selected owner.`);
      }
      const replacements: NativeBodyReplacement[] = [];
      for (const target of snapshots.targets) {
        const shape = current.get(target.ref.bodyId)!;
        validateSingle(shape);
        if (materialChanged(initial.get(target.ref.bodyId)!, shape, owners)) {
          replacements.push(Object.freeze({ ref: frozenRef(target.ref), shape }));
        }
      }
      if (!replacements.length) throw new Error('The final recipe pattern changes no selected owner material.');
      if (sketchSolves) assertSourceSketchSolvesCurrent(sketchSolves.registry, sketchSolves.checkpoint, input.features);
      const attestation: RecipeEvaluationAttestation = Object.freeze({ evaluatorRevision: RECIPE_EVALUATOR_REVISION,
        patternId: closure.request.patternId, recipeFingerprintInput: closure.fingerprintInput,
        sources: Object.freeze(snapshots.sources.map(item => Object.freeze({ ref: item.ref, lineage: item.lineage }))),
        targets: Object.freeze(snapshots.targets.map(item => Object.freeze({ ref: item.ref, lineage: item.lineage }))),
        virtualOutputs: Object.freeze([...outputs.values()]) });
      const proof: EvaluationProof = { active: true, patternId: closure.request.patternId, fingerprintInput: closure.fingerprintInput,
        catalog: input.catalog, history: input.historicalStates, ...snapshots, scope, sketchSolves };
      const result: OwnedRecipeEvaluation = Object.freeze({ replacements: Object.freeze(replacements), attestation,
        dispose() {
          if (!proof.active) return;
          proof.active = false;
          withNativeOwners(cleanup => { cleanup.ownAll(replacements.map(item => item.shape)); }, undefined,
            'Retained recipe candidate release failed.');
        } });
      evaluations.set(result, proof);
      return result;
    }, result => result.replacements.map(item => item.shape), 'Feature recipe evaluation or release failed.');
  } catch (error) {
    if (isNativeCleanupFailure(error) && !(error instanceof NativeCleanupError)) {
      throw new NativeCleanupError({ error }, [], 'Feature recipe evaluation has an unsafe native ownership failure.');
    }
    throw error;
  }
}

/** Native event-effects for a future AUTO capture proposal, never a saved receipt. */
export function recipeEvaluationEventAffectedBodyIds(evaluation: OwnedRecipeEvaluation): readonly string[] {
  const proof = evaluations.get(evaluation);
  if (!proof?.active || proof.scope.intent.mode !== 'all') throw new Error('AUTO capture proposals need a genuine active ALL evaluation.');
  return Object.freeze([...new Set(evaluation.attestation.virtualOutputs.filter(output => output.materialChanged)
    .map(output => output.targetBodyId))].sort(compare));
}

/**
 * Copies every candidate into an uncommitted catalog proposal, then retires the
 * evaluator's candidates BEFORE returning the transaction. The caller must use
 * the engine's existing staged-cache/adopt boundary; this function never commits.
 */
export function stageFeatureRecipeEvaluation(evaluation: OwnedRecipeEvaluation, catalog: NativeBodyCatalog,
  update: NativeBodyStateUpdate, current: Pick<RecipeEvaluationInput, 'features' | 'request' | 'sourceSketchSolves'>): NativeBodyTransaction {
  const proof = evaluations.get(evaluation);
  if (!proof || !proof.active) throw new Error('Recipe evaluation is forged, already staged or disposed.');
  let transaction: NativeBodyTransaction | undefined, primary: { error: unknown } | undefined;
  const cleanup: unknown[] = [];
  try {
    const fresh = requireInitialRecipeDeclaration(extractRecipeClosure(current.features, current.request));
    if (fresh.fingerprintInput !== proof.fingerprintInput || evaluation.attestation.evaluatorRevision !== RECIPE_EVALUATOR_REVISION) {
      throw new Error('The recipe document or declaration changed after native evaluation.');
    }
    if (proof.catalog !== catalog || update.sourceFeatureId !== proof.patternId) throw new Error('The recipe proposal belongs to another catalog or pattern.');
    if (proof.sketchSolves) {
      if (current.sourceSketchSolves !== proof.sketchSolves.registry) throw new Error('The recipe source-solve epoch changed after evaluation.');
      assertSourceSketchSolvesCurrent(proof.sketchSolves.registry, proof.sketchSolves.checkpoint, current.features);
    }
    assertNativeRecipeScopeCurrent(proof.scope, fresh.request.scope, fresh.request.targetSnapshot, catalog);
    for (const snapshot of proof.targets) {
      const actual = catalog.resolve(snapshot.ref);
      if (actual.lineage !== snapshot.lineage || actual.shape !== snapshot.shape) throw new Error('A current recipe target changed after evaluation.');
    }
    for (const snapshot of proof.sources) {
      const actual = proof.history.get(exactStateKey(snapshot.ref));
      if (actual?.error !== undefined) {
        if (isNativeCleanupFailure(actual.error)) throw actual.error;
        throw new Error('An exact recipe source capture failed after evaluation.', { cause: actual.error });
      }
      if (!actual || !sameRef(actual.ref, snapshot.ref) || actual.lineage !== snapshot.lineage || actual.shape !== snapshot.shape) {
        throw new Error('An exact recipe source changed after evaluation.');
      }
    }
    transaction = catalog.stageReplaceMany(evaluation.replacements, update);
  } catch (error) { primary = { error }; }
  try { evaluation.dispose(); } catch (error) { cleanup.push(error); }
  if (primary || cleanup.length) {
    try { transaction?.dispose(); } catch (error) { cleanup.push(error); }
    if (cleanup.length || (primary && isNativeCleanupFailure(primary.error))) {
      throw new NativeCleanupError(primary, cleanup, 'Recipe staging or candidate/proposal release failed before publication.');
    }
    throw primary!.error;
  }
  return transaction!;
}
