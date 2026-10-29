import { Plane as NativePlane, sketchCircle, sketchRectangle, type Face, type Shape3D, type Sketch } from 'replicad';
import { framePoint } from './kernel.frames';
import { copyBodyShape, maximumNativeShapeTolerance } from './kernel.bodies';
import { withNativeOwners, type NativeOwners } from './kernel.native-ownership';
import { throughAllBossTool, throughAllTool, untilNextTool, upToSurfaceTool } from './kernel.extrusion-limits';
import type { PlaneFrame, ThinWallDefinition, Vec3 } from './kernel.types';
import { prepareThinSection } from './kernel.thin-wall';
import { resolveThinWall } from './thinWall';
import { entityProfileSolid } from './kernel.profiles';
import { resolveUntilNextAdd, resolveUntilNextCut, type UntilNextCutResolution } from './kernel.until-next-resolution';

/** Explicit-frame primitive construction: no document IDs, recipe graph or catalog publication. */
export type PrimitiveProfile =
  | { readonly kind: 'rectangle'; readonly center: readonly [number, number]; readonly width: number; readonly height: number }
  | { readonly kind: 'circle'; readonly center: readonly [number, number]; readonly radius: number };

/** A caller-resolved geometric limit. Reference/owner attestation is still the caller's job. */
export type ResolvedPrimitiveLimit = { readonly frame: PlaneFrame } | { readonly face: Face };
export type PrimitiveTermination =
  | { readonly kind: 'blind'; readonly symmetric: boolean }
  | { readonly kind: 'throughAll'; readonly bothDirections: boolean }
  | { readonly kind: 'untilNext' }
  | { readonly kind: 'upToSurface'; readonly limit: ResolvedPrimitiveLimit };

export interface ExplicitFramePrimitiveInput {
  readonly profile: PrimitiveProfile;
  /** Already resolved, right-handed orthonormal frame; its origin includes sketch offset ONCE. */
  readonly frame: PlaneFrame;
  /** Reflection parity has already been incorporated in the signed depth by the recipe evaluator. */
  readonly signedDepth: number;
  readonly termination: PrimitiveTermination;
  readonly operation: 'add' | 'subtract';
  /** Borrowed, detached, CURRENT working owner for this instance, not a scene aggregate. */
  readonly workingTarget?: Shape3D;
  /** Borrowed input, must not consume/mutate it. Check native validity, finite bounds and solid geometry. */
  readonly validateTool: (tool: Shape3D) => void;
  readonly thinWall?: ThinWallDefinition;
}

const MIN_PARAMETER_LENGTH = .01, MAX_PARAMETER_LENGTH = 100_000;
const MIN_CALCULATED_LENGTH = 1e-7, MAX_CALCULATED_LENGTH = 10_000_000;
const FRAME_TOLERANCE = 1e-8;
/** Replicad consumes this owned Sketch; retain cleanup failure until its returned solid is observable. */
function consumeSketch(sketch: Sketch, owners: NativeOwners): void {
  owners.own(sketch); // Capture original raw deleter BEFORE installing the local consumption adapter.
  Object.defineProperty(sketch, 'delete', { configurable: true, value: () => owners.release(sketch) });
}

function vector(value: readonly number[], context: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || ![0, 1, 2].every(axis =>
    Object.prototype.hasOwnProperty.call(value, axis) && Number.isFinite(value[axis]))) {
    throw new Error(context + ' must contain three finite coordinates.');
  }
  return [value[0], value[1], value[2]];
}
function resolvedFrame(value: PlaneFrame): PlaneFrame {
  if (!value || typeof value !== 'object') throw new Error('A resolved primitive frame is required.');
  const origin = vector(value.origin, 'Frame origin'), xDirection = vector(value.xDirection, 'Frame X'),
    normal = vector(value.normal, 'Frame normal');
  const dot = xDirection[0] * normal[0] + xDirection[1] * normal[1] + xDirection[2] * normal[2];
  if (Math.abs(Math.hypot(...xDirection) - 1) > FRAME_TOLERANCE ||
      Math.abs(Math.hypot(...normal) - 1) > FRAME_TOLERANCE || Math.abs(dot) > FRAME_TOLERANCE) {
    throw new Error('The resolved primitive frame must be orthonormal; arbitrary axes are not normalized here.');
  }
  return { origin, xDirection, normal };
}
function parameterLength(value: number, context: string, signed = false): number {
  const length = signed ? Math.abs(value) : value;
  if (!Number.isFinite(value) || length < MIN_PARAMETER_LENGTH || length > MAX_PARAMETER_LENGTH) {
    throw new Error(context + ' must be between 0.01 and 100000 millimeters in magnitude.');
  }
  return value;
}
function primitiveProfile(value: PrimitiveProfile): PrimitiveProfile {
  if (!value || !Array.isArray(value.center) || value.center.length !== 2 ||
      ![0, 1].every(axis => Object.prototype.hasOwnProperty.call(value.center, axis) &&
        Number.isFinite(value.center[axis]) && Math.abs(value.center[axis]) <= 1_000_000)) {
    throw new Error('Primitive profile center must contain two finite coordinates within the sketch parameter range.');
  }
  const center: [number, number] = [value.center[0], value.center[1]];
  if (value.kind === 'rectangle') return { kind: value.kind, center,
    width: parameterLength(value.width, 'Rectangle width'), height: parameterLength(value.height, 'Rectangle height') };
  if (value.kind === 'circle') return { kind: value.kind, center, radius: parameterLength(value.radius, 'Circle radius') };
  throw new Error('This primitive builder supports only rectangle and circle profiles.');
}
function finitePoint(value: Vec3, context: string): Vec3 { return vector(value, context); }

/**
 * Constructs a real native tool in an explicit frame. Input scalars/frame are
 * checked, but this is an internal typed API, not a raw-document descriptor or
 * prototype validation boundary. Callers first use their strict recipe parser.
 * All native inputs are borrowed; the successfully returned tool is OWNED.
 */
function explicitFramePrimitiveFactory(input: ExplicitFramePrimitiveInput): {
  signedDepth: number; center: Vec3; ray: Vec3; termination: PrimitiveTermination;
  target: Shape3D | undefined; limit: ResolvedPrimitiveLimit | undefined;
  makePrism: (length: number, start?: number) => Shape3D;
} {
  if (!input || (input.operation !== 'add' && input.operation !== 'subtract') || typeof input.validateTool !== 'function') {
    throw new Error('Primitive operation and an explicit native tool validator are required.');
  }
  const profile = primitiveProfile(input.profile), frame = resolvedFrame(input.frame),
    signedDepth = parameterLength(input.signedDepth, 'Signed depth', true), sign = Math.sign(signedDepth),
    ray = frame.normal.map(value => sign * value) as Vec3,
    center = finitePoint(framePoint(frame, profile.center[0], profile.center[1]), 'World profile center');
  const thinWall = resolveThinWall(input);
  const section = thinWall ? prepareThinSection({
    id: 'recipe-primitive-profile', name: 'Recipe primitive profile', type: 'sketch', suppressed: false,
    plane: 'XY', offset: 0, profile: { ...profile, center: [...profile.center] },
  }, thinWall).sketch : undefined;
  if (section && section.profile.kind !== 'entities') throw new Error('Thin-wall recipes require a closed prepared entity section.');
  const termination = input.termination;
  if (!termination || typeof termination !== 'object') throw new Error('Primitive termination is required.');
  if (termination.kind === 'blind' && typeof termination.symmetric !== 'boolean') throw new Error('Blind symmetry must be explicit.');
  if (termination.kind === 'throughAll' && typeof termination.bothDirections !== 'boolean') throw new Error('ThroughAll direction scope must be explicit.');
  const target = input.workingTarget;
  if ((termination.kind === 'throughAll' || termination.kind === 'untilNext') && !target) {
    throw new Error('Dynamic termination requires the current per-instance working target.');
  }
  let limit: ResolvedPrimitiveLimit | undefined;
  if (termination.kind === 'upToSurface') {
    const provided = termination.limit;
    if (!provided || typeof provided !== 'object' || ('frame' in provided) === ('face' in provided)) {
      throw new Error('UpToSurface requires exactly one caller-resolved frame or native face.');
    }
    if ('frame' in provided) limit = { frame: resolvedFrame(provided.frame) };
    else {
      if (!provided.face || typeof provided.face.clone !== 'function') throw new Error('The resolved surface face is not available.');
      limit = { face: provided.face }; // Helper clones its borrowed face; no owner attestation is implied.
    }
  }
  const makePrism = (length: number, start = 0): Shape3D => {
    if (!Number.isFinite(length) || length < MIN_CALCULATED_LENGTH || length > MAX_CALCULATED_LENGTH ||
        !Number.isFinite(start) || Math.abs(start) > MAX_CALCULATED_LENGTH) {
      throw new Error('Calculated primitive extent must be finite and within the native construction range.');
    }
    // No sketch.offset field: resolved frame origin already contains it. Apply
    // the profile center once, then translate by signed ray * start once.
    const startCenter = finitePoint(center.map((value, axis) => value + ray[axis] * start) as Vec3, 'Prism start center');
    const endCenter = finitePoint(startCenter.map((value, axis) => value + ray[axis] * length) as Vec3, 'Prism end center');
    void endCenter; // Reject overflow BEFORE invoking native constructors.
    return withNativeOwners(owners => {
      if (section?.profile.kind === 'entities') {
        // The temporary section retains local center coordinates. Apply only
        // the explicit frame and axial start here, never the center twice.
        const origin = finitePoint(frame.origin.map((value, axis) => value + ray[axis] * start) as Vec3, 'Thin prism start origin');
        const result = owners.own(entityProfileSolid(section.profile, 'XY', 0,
          { type: 'extrude', depth: sign * length }, { ...frame, origin }));
        input.validateTool(result);
        return result;
      }
      const plane = owners.own(new NativePlane(startCenter, frame.xDirection, frame.normal));
      const sketch = profile.kind === 'rectangle' ? sketchRectangle(profile.width, profile.height, { plane })
        : sketchCircle(profile.radius, { plane });
      consumeSketch(sketch, owners);
      const result = owners.own(sketch.extrude(sign * length));
      input.validateTool(result);
      return result;
    }, result => [result], 'Explicit-frame prism construction or release failed.');
  };
  return { signedDepth, center, ray, termination, target, limit, makePrism };
}

export interface PrimitiveRecipeProfileInput extends Pick<ExplicitFramePrimitiveInput,
  'profile' | 'frame' | 'signedDepth' | 'validateTool' | 'thinWall'> {
  /** Evaluator-owned guard for the actual working owner/revision and source epoch. */
  readonly assertWorkingCurrent: () => void;
}

/** A real validated section, released before it can authorize a separated miss. */
export function validatePrimitiveRecipeProfileForAbsence(input: PrimitiveRecipeProfileInput): number {
  input.assertWorkingCurrent();
  const thinWall = resolveThinWall(input);
  const { signedDepth, makePrism } = explicitFramePrimitiveFactory({
    profile: input.profile, frame: input.frame, signedDepth: input.signedDepth, validateTool: input.validateTool,
    termination: { kind: 'blind', symmetric: false }, operation: 'subtract',
    ...(thinWall ? { thinWall: thinWall.definition } : {}),
  });
  const tolerance = withNativeOwners(owners => {
    const witness = owners.own(makePrism(Math.abs(signedDepth)));
    return maximumNativeShapeTolerance(witness);
  }, undefined, 'Primitive recipe absence witness construction or release failed.');
  // Successful geometry is insufficient if releasing it failed or changed the
  // working owner. No caught native failure is converted into absence evidence.
  input.assertWorkingCurrent();
  return tolerance;
}

/** Native observations only; saved scope, currentness and miss policy belong to the bridge/evaluator. */
export function resolveExplicitFrameUntilNext(input: ExplicitFramePrimitiveInput): UntilNextCutResolution {
  const { termination, target, center, ray, makePrism } = explicitFramePrimitiveFactory(input);
  if (termination.kind !== 'untilNext') throw new Error('UntilNext resolution requires its exact termination.');
  return withNativeOwners<UntilNextCutResolution>(owners => {
    const result = (input.operation === 'subtract' ? resolveUntilNextCut : resolveUntilNextAdd)({
      workingTarget: target!, origin: center, direction: ray, makePrism,
    });
    if (result.kind === 'complete') {
      owners.own(result.tool);
      input.validateTool(result.tool);
    }
    return result;
  }, result => result.kind === 'complete' ? [result.tool] : [], 'Explicit-frame UntilNext resolution or release failed.');
}

/** Strict construction API: a successfully returned tool is always owned and non-null. */
export function buildExplicitFramePrimitive(input: ExplicitFramePrimitiveInput): Shape3D {
  const { signedDepth, center, ray, termination, target, limit, makePrism } = explicitFramePrimitiveFactory(input);
  return withNativeOwners(owners => {
    let result: Shape3D;
    // Existing limit helpers include native operations on their target. Protect
    // the borrowed working owner with a geometric/topological duplicate, not
    // Shape.clone() (which shares topology). This is input isolation, NOT a
    // copied feature delta or an already-regenerated output.
    const isolatedTarget = (termination.kind === 'throughAll' || termination.kind === 'untilNext')
      ? owners.own(copyBodyShape(target!)) : undefined;
    switch (termination.kind) {
      case 'blind': result = owners.own(makePrism(Math.abs(signedDepth), termination.symmetric ? -Math.abs(signedDepth) / 2 : 0)); break;
      case 'throughAll': result = owners.own(input.operation === 'add'
        ? throughAllBossTool(isolatedTarget!, center, ray, termination.bothDirections, makePrism)
        : throughAllTool(isolatedTarget!, center, ray, termination.bothDirections, makePrism)); break;
      case 'untilNext': result = owners.own(untilNextTool(isolatedTarget!, center, ray, makePrism, input.operation === 'subtract')); break;
      case 'upToSurface': result = owners.own(upToSurfaceTool(limit!, center, ray, makePrism)); break;
      default: throw new Error('Unknown primitive termination.');
    }
    input.validateTool(result);
    return result;
  }, result => [result], 'Explicit-frame primitive construction or release failed.');
}
