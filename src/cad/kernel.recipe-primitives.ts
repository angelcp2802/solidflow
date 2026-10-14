import { Plane as NativePlane, sketchCircle, sketchRectangle, type Face, type Shape3D, type Sketch } from 'replicad';
import { framePoint } from './kernel.frames';
import { copyBodyShape } from './kernel.bodies';
import { throughAllBossTool, throughAllTool, untilNextTool, upToSurfaceTool } from './kernel.extrusion-limits';
import type { PlaneFrame, Vec3 } from './kernel.types';

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
}

const MIN_PARAMETER_LENGTH = .01, MAX_PARAMETER_LENGTH = 100_000;
const MIN_CALCULATED_LENGTH = 1e-7, MAX_CALCULATED_LENGTH = 10_000_000;
const FRAME_TOLERANCE = 1e-8;
type NativeOwner = { delete(): void };
type Failure = { readonly error: unknown };

/** Tracks only wrappers received by this component, not unpublished objects inside upstream helpers. */
class OwnedWrappers {
  private readonly records = new Map<NativeOwner, { attempted: boolean; release: () => void }>();
  private readonly errors: unknown[] = [];
  own<T extends NativeOwner>(value: T): T {
    if (!this.records.has(value)) this.records.set(value, { attempted: false, release: value.delete.bind(value) });
    return value;
  }
  /** Removal/marking happens BEFORE invocation. Failure never triggers a second native delete attempt. */
  release(value: NativeOwner): void {
    const record = this.records.get(value);
    if (!record || record.attempted) return;
    record.attempted = true;
    try { record.release(); } catch (error) { this.errors.push(error); }
  }
  consumeSketch(sketch: Sketch): void {
    this.own(sketch);
    // Replicad 1.1.0 Sketch.extrude calls this.delete() before returning its solid.
    // Adapt ONLY this owned instance: record cleanup failures so that a returned
    // solid remains observable and can be released before the failure escapes.
    // This is not a prototype/global patch; this consumed instance never escapes.
    Object.defineProperty(sketch, 'delete', { configurable: true, value: () => this.release(sketch) });
  }
  finish(result: Shape3D | undefined, failure?: Failure): Shape3D {
    for (const value of [...this.records.keys()].reverse()) if (value !== result) this.release(value);
    if (failure || this.errors.length) {
      if (result) this.release(result);
      if (failure && !this.errors.length) throw failure.error;
      const causes = failure ? [failure.error, ...this.errors] : [...this.errors];
      throw new AggregateError(causes, 'Explicit-frame primitive construction or wrapper release failed.',
        { cause: failure ? failure.error : causes[0] });
    }
    if (!result) throw new Error('Primitive construction did not return an owned tool.');
    this.records.delete(result); // Ownership transfers to caller exactly here.
    return result;
  }
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
export function buildExplicitFramePrimitive(input: ExplicitFramePrimitiveInput): Shape3D {
  if (!input || (input.operation !== 'add' && input.operation !== 'subtract') || typeof input.validateTool !== 'function') {
    throw new Error('Primitive operation and an explicit native tool validator are required.');
  }
  const profile = primitiveProfile(input.profile), frame = resolvedFrame(input.frame),
    signedDepth = parameterLength(input.signedDepth, 'Signed depth', true), sign = Math.sign(signedDepth),
    ray = frame.normal.map(value => sign * value) as Vec3,
    center = finitePoint(framePoint(frame, profile.center[0], profile.center[1]), 'World profile center');
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
    const owners = new OwnedWrappers();
    let result: Shape3D | undefined, failure: Failure | undefined;
    try {
      const plane = owners.own(new NativePlane(startCenter, frame.xDirection, frame.normal));
      const sketch = profile.kind === 'rectangle' ? sketchRectangle(profile.width, profile.height, { plane })
        : sketchCircle(profile.radius, { plane });
      owners.own(sketch);
      owners.consumeSketch(sketch);
      result = owners.own(sketch.extrude(sign * length));
      input.validateTool(result);
    } catch (error) { failure = { error }; }
    return owners.finish(result, failure);
  };
  const owners = new OwnedWrappers();
  let result: Shape3D | undefined, failure: Failure | undefined;
  try {
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
  } catch (error) { failure = { error }; }
  return owners.finish(result, failure);
}
