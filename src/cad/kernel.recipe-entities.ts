import type { Shape3D } from 'replicad';
import type { Feature, PlaneFrame, Vec3 } from './kernel.types';
import type { IntrinsicRecipeExtrusionPlacement } from '../model/featureRecipes';
import { entityProfileSolid } from './kernel.profiles';
import { prepareThinSection } from './kernel.thin-wall';
import { assertThinWallEndCapsContext, resolveThinWall } from './thinWall';
import { buildThinWallEndCaps } from './kernel.thin-caps';
import { copyBodyShape, maximumNativeShapeTolerance } from './kernel.bodies';
import { withNativeOwners } from './kernel.native-ownership';
import { throughAllBossTool, throughAllTool, untilNextTool, upToSurfaceTool } from './kernel.extrusion-limits';
import { resolveUntilNextAdd, resolveUntilNextCut, type UntilNextCutResolution } from './kernel.until-next-resolution';
import type { PrimitiveTermination } from './kernel.recipe-primitives';
import { readCheckpointSourceSketchSolve, type SourceSketchSolveCheckpoint,
  type SourceSketchSolveRegistry } from './kernel.sketch-solves';

export interface EntityRecipeSolveInput {
  readonly registry: SourceSketchSolveRegistry;
  readonly checkpoint: SourceSketchSolveCheckpoint;
  readonly features: readonly Feature[];
}
export interface EntityRecipeProfileInput {
  readonly source: EntityRecipeSolveInput;
  /** Derived by the bridge from the exact extracted canonical address and Q. */
  readonly placement: Readonly<IntrinsicRecipeExtrusionPlacement>;
  readonly validateTool: (tool: Shape3D) => void;
  /** Closes over the evaluator's actual current map, shape and input revision. */
  readonly assertWorkingCurrent: () => void;
}
export interface EntityRecipeToolInput extends EntityRecipeProfileInput {
  readonly termination: PrimitiveTermination;
  readonly operation: 'add' | 'subtract';
  readonly workingTarget: Shape3D;
}
const sameFrame = (a: PlaneFrame, b: PlaneFrame): boolean =>
  a.origin.every((value, axis) => value === b.origin[axis]) &&
  a.xDirection.every((value, axis) => value === b.xDirection[axis]) &&
  a.normal.every((value, axis) => value === b.normal[axis]);

/** The ordinary tool and absence witness use the same authentic native profile construction. */
function entityRecipePrismFactory(input: EntityRecipeProfileInput): {
  makePrism: (length: number, start?: number) => Shape3D; ray: Vec3;
} {
  const { source, placement } = input;
  input.assertWorkingCurrent();
  const view = readCheckpointSourceSketchSolve(source.registry, source.checkpoint, source.features, placement.sketchId);
  if (view.input.support || view.input.profile.kind !== 'entities' || view.resolved.profile.kind !== 'entities'
      || !sameFrame(view.frame, placement.sourceFrame)) {
    throw new Error('Entity recipe placement requires its unchanged intrinsic source solve/frame.');
  }
  const depth = placement.signedDepth, sign = Math.sign(depth), frame = placement.frame;
  if (!Number.isFinite(depth) || Math.abs(depth) < .01 || Math.abs(depth) > 100_000) throw new Error('Entity recipe depth is outside the native parameter range.');
  const ray = frame.normal.map(value => sign * value) as Vec3;
  const thinWall = resolveThinWall(placement);
  const feature = source.features.find(feature => feature.id === placement.sourceFeatureId);
  assertThinWallEndCapsContext(thinWall?.definition, feature?.type === 'extrude' ? 'add' : 'subtract',
    placement.termination.kind === 'blind', placement.termination.kind !== 'blind' || placement.termination.symmetric !== false);
  const section = thinWall ? prepareThinSection(view.resolved, thinWall) : undefined;
  const profile = section?.sketch.profile ?? view.result.profile;
  if (profile.kind !== 'entities') throw new Error('Entity recipes require a closed resolved entity section.');
  // Reflection parity was applied exactly once by transformedExtrusionFrame.
  // Keep the authentic solved local coordinates and arc orientation unchanged.
  const makePrism = (length: number, start = 0): Shape3D => {
    if (!Number.isFinite(length) || length < 1e-7 || length > 10_000_000 || !Number.isFinite(start) || Math.abs(start) > 10_000_000) {
      throw new Error('Calculated entity prism extent is outside the native construction range.');
    }
    const origin = frame.origin.map((value, axis) => value + ray[axis] * start) as Vec3;
    const end = origin.map((value, axis) => value + ray[axis] * length);
    if (![...origin, ...end].every(Number.isFinite)) throw new Error('Entity prism coordinates overflowed.');
    return withNativeOwners(owners => {
      input.assertWorkingCurrent();
      // Explicit frame already includes the sketch offset once. This builder
      // constructs contours/holes/regions from result.profile without solving.
      const prism = owners.own(section && thinWall?.definition.endCaps?.enabled
        ? buildThinWallEndCaps(section, thinWall.definition, view.input.plane, 0, sign * length, { ...frame, origin })
        : entityProfileSolid(profile, view.input.plane, 0,
          { type: 'extrude', depth: sign * length }, { ...frame, origin }, !!thinWall?.definition.autoCorners?.enabled));
      input.validateTool(prism);
      input.assertWorkingCurrent();
      return prism;
    }, prism => [prism], 'Entity recipe prism construction or release failed.');
  };
  return { makePrism, ray };
}

/** Native profile evidence only. The witness never changes or replaces an owner. */
export function validateEntityRecipeProfileForAbsence(input: EntityRecipeProfileInput): number {
  const { makePrism } = entityRecipePrismFactory(input);
  const tolerance = withNativeOwners(owners => {
    const prism = owners.own(makePrism(Math.abs(input.placement.signedDepth)));
    return maximumNativeShapeTolerance(prism);
  }, undefined, 'Entity recipe absence witness construction or release failed.');
  // Cleanup must succeed before this evidence can authorize a no-op. The
  // actual source epoch and owner/revision must still be current after release.
  input.assertWorkingCurrent();
  readCheckpointSourceSketchSolve(input.source.registry, input.source.checkpoint,
    input.source.features, input.placement.sketchId);
  return tolerance;
}

/** Native observations from the full authentic solved profile; no saved miss policy is inferred here. */
export function resolveEntityRecipeUntilNext(input: EntityRecipeToolInput): UntilNextCutResolution {
  if (input.termination.kind !== 'untilNext') throw new Error('Entity UntilNext resolution requires its exact termination.');
  assertThinWallEndCapsContext(resolveThinWall(input.placement)?.definition, input.operation, false, false);
  const { makePrism, ray } = entityRecipePrismFactory(input);
  return withNativeOwners<UntilNextCutResolution>(owners => {
    const result = (input.operation === 'subtract' ? resolveUntilNextCut : resolveUntilNextAdd)({
      workingTarget: input.workingTarget, origin: input.placement.frame.origin, direction: ray, makePrism,
    });
    if (result.kind === 'complete') {
      owners.own(result.tool);
      input.validateTool(result.tool);
    }
    // The resolver has already released its target copy, probe and inspection
    // resources. A release-time mutation cannot authorize either a tool or miss.
    input.assertWorkingCurrent();
    readCheckpointSourceSketchSolve(input.source.registry, input.source.checkpoint,
      input.source.features, input.placement.sketchId);
    return result;
  }, result => result.kind === 'complete' ? [result.tool] : [], 'Entity UntilNext resolution or release failed.');
}

/** Real solved entities, freshly constructed native material; no seed BRep/delta copying. */
export function buildEntityRecipeTool(input: EntityRecipeToolInput): Shape3D {
  const { source, placement, termination } = input;
  assertThinWallEndCapsContext(resolveThinWall(placement)?.definition, input.operation,
    termination.kind === 'blind', termination.kind !== 'blind' || termination.symmetric !== false);
  const { makePrism, ray } = entityRecipePrismFactory(input);
  const depth = placement.signedDepth, frame = placement.frame;
  return withNativeOwners(owners => {
    const target = termination.kind === 'throughAll' || termination.kind === 'untilNext'
      ? owners.own(copyBodyShape(input.workingTarget)) : undefined;
    let tool: Shape3D;
    if (termination.kind === 'blind') tool = owners.own(makePrism(Math.abs(depth), termination.symmetric ? -Math.abs(depth) / 2 : 0));
    else if (termination.kind === 'throughAll') tool = owners.own(input.operation === 'add'
      ? throughAllBossTool(target!, frame.origin, ray, termination.bothDirections, makePrism)
      : throughAllTool(target!, frame.origin, ray, termination.bothDirections, makePrism));
    else if (termination.kind === 'untilNext') tool = owners.own(untilNextTool(target!, frame.origin, ray, makePrism, input.operation === 'subtract'));
    else if (termination.kind === 'upToSurface') tool = owners.own(upToSurfaceTool(termination.limit, frame.origin, ray, makePrism));
    else throw new Error('Unknown entity recipe termination.');
    input.validateTool(tool);
    input.assertWorkingCurrent();
    readCheckpointSourceSketchSolve(source.registry, source.checkpoint, source.features, placement.sketchId);
    return tool;
  }, tool => [tool], 'Entity recipe tool construction or release failed.');
}
