import { cast, getOC, type Shape3D } from 'replicad';
import { copyBodyShape, validateBodyShape } from './kernel.bodies';
import { NextBoundaryUnavailableError, untilNextTool } from './kernel.extrusion-limits';
import { withNativeOwners, type NativeOwners } from './kernel.native-ownership';
import type { Vec3 } from './kernel.types';

/** Geometric observations only. No saved scope policy or native owner attestation. */
export const NEXT_CONTACT_DISTANCE_MM = 1e-7;
export interface UntilNextCutInput {
  /** Borrowed progressive owner, already associated with its exact route by the caller. */
  readonly workingTarget: Shape3D;
  readonly origin: Vec3;
  /** Unit physical extrusion ray, including signed reflection/depth exactly once. */
  readonly direction: Vec3;
  /** Returns one fresh owned positive prism along that physical ray. */
  readonly makePrism: (length: number, start?: number) => Shape3D;
}
export interface ForwardMaterialEvidence {
  readonly solidCount: number;
  readonly volumeMm3: number;
  readonly contactTopologyPresent: boolean;
}
export type UntilNextCutResolution =
  | { readonly kind: 'complete'; readonly tool: Shape3D; readonly forward: ForwardMaterialEvidence }
  | { readonly kind: 'empty-forward'; readonly topologyFreeCompound: true; readonly distanceMm: number }
  | { readonly kind: 'contact-or-near'; readonly evidence: 'lower-dimensional-common' | 'empty-common-within-resolution'; readonly distanceMm?: number }
  | { readonly kind: 'incomplete-limit'; readonly forward: ForwardMaterialEvidence; readonly reason: NextBoundaryUnavailableError['reason']; readonly error: NextBoundaryUnavailableError };

// Common is allowed to return lower-dimensional topology, not only Shape3D.
type RawShape = Parameters<typeof cast>[0];
type NativeMaterial =
  | { kind: 'empty' }
  | { kind: 'contact' }
  | { kind: 'material'; evidence: ForwardMaterialEvidence };
const TOPOLOGY = ['COMPSOLID', 'SOLID', 'SHELL', 'FACE', 'WIRE', 'EDGE', 'VERTEX'] as const;
function vector(value: Vec3, label: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || ![0, 1, 2].every(i =>
    Object.hasOwn(value, i) && Number.isFinite(value[i]))) throw new Error(label + ' requires three finite coordinates.');
  return [value[0], value[1], value[2]];
}
function finiteBounds(shape: Pick<Shape3D, 'boundingBox'>): [Vec3, Vec3] {
  return withNativeOwners(owners => {
    const box = owners.own(shape.boundingBox), [a, b] = box.bounds;
    if (![...a, ...b].every(Number.isFinite) || a.some((v, i) => v > b[i])) {
      throw new Error('The native UntilNext geometry has invalid bounds.');
    }
    return [[...a] as Vec3, [...b] as Vec3];
  }, undefined, 'UntilNext bounds inspection or release failed.');
}
function hasTopology(raw: RawShape, kinds: readonly (typeof TOPOLOGY)[number][], avoidSolids = false): boolean {
  return withNativeOwners(owners => {
    const oc = getOC();
    for (const kind of kinds) {
      const explorer = owners.own(new oc.TopExp_Explorer(raw,
        oc.TopAbs_ShapeEnum[`TopAbs_${kind}`], avoidSolids ? oc.TopAbs_ShapeEnum.TopAbs_SOLID : oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
      if (explorer.More()) return true;
    }
    return false;
  }, undefined, 'UntilNext topology inspection or release failed.');
}
function inspect(raw: RawShape): NativeMaterial {
  return withNativeOwners(owners => {
    const oc = getOC();
    if (raw.IsNull()) throw new Error('A null native result is not proof of an empty forward intersection.');
    if (!hasTopology(raw, TOPOLOGY)) {
      if (raw.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_COMPOUND) {
        throw new Error('A topology-free forward result must be an actual native compound.');
      }
      return { kind: 'empty' };
    }
    const analyzer = owners.own(new oc.BRepCheck_Analyzer(raw, true, false, false));
    if (!analyzer.IsValid()) throw new Error('The native UntilNext intersection is not a valid BRep.');
    const solids = owners.own(new oc.TopExp_Explorer(raw, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    let count = 0, volume = 0;
    while (solids.More()) {
      const value = withNativeOwners(check => {
        const current = check.own(solids.Current()), solid = check.own(cast(current)).asShape3D();
        validateBodyShape(solid); finiteBounds(solid);
        const properties = check.own(new oc.GProp_GProps());
        oc.BRepGProp.VolumeProperties(current, properties, 1e-10, false, false);
        const mass = properties.Mass();
        if (!Number.isFinite(mass) || mass <= 0) throw new Error('Forward material must contain actual positive closed-solid volume.');
        return mass;
      }, undefined, 'UntilNext material inspection or release failed.');
      count++; volume += value; solids.Next();
    }
    if (!Number.isFinite(volume)) throw new Error('The native forward material volume is not finite.');
    const contact = hasTopology(raw, ['SHELL', 'FACE', 'WIRE', 'EDGE', 'VERTEX'], true);
    if (!count) {
      if (!contact) throw new Error('An unsupported topology container is not a material/contact/empty proof.');
      finiteBounds(owners.own(cast(raw)));
      return { kind: 'contact' };
    }
    // Lower-dimensional pieces of a successful Common can coexist with solid
    // material. They do not become material merely by contributing signed mass.
    return { kind: 'material', evidence: { solidCount: count, volumeMm3: volume, contactTopologyPresent: contact } };
  }, undefined, 'UntilNext intersection inspection or release failed.');
}
function common(body: Shape3D, prism: Shape3D, owners: NativeOwners): RawShape {
  const oc = getOC(), argumentsList = owners.own(new oc.NCollection_List_TopoDS_Shape()),
    tools = owners.own(new oc.NCollection_List_TopoDS_Shape()), builder = owners.own(new oc.BRepAlgoAPI_Common());
  owners.own(argumentsList.Append(body.wrapped)); owners.own(tools.Append(prism.wrapped));
  builder.SetArguments(argumentsList); builder.SetTools(tools); builder.SetNonDestructive(true);
  if (!builder.NonDestructive()) throw new Error('UntilNext forward classification requires non-destructive processing.');
  builder.Build();
  if (!builder.IsDone()) throw new Error('The native forward Common did not finish.');
  // Do not downcast to Shape3D: contact may be a face/edge, and a genuinely
  // empty compound is an observation rather than a body candidate.
  return owners.own(builder.Shape());
}
function separation(body: Shape3D, prism: Shape3D): number {
  return withNativeOwners(owners => {
    const query = owners.own(new (getOC().BRepExtrema_DistShapeShape)());
    query.LoadS1(body.wrapped); query.LoadS2(prism.wrapped); query.Perform();
    if (!query.IsDone() || query.NbSolution() < 1) throw new Error('The native separation query did not produce a completed result.');
    const distance = query.Value();
    if (!Number.isFinite(distance) || distance < 0) throw new Error('The native separation result is not finite/nonnegative.');
    return distance;
  }, undefined, 'UntilNext separation query or release failed.');
}

/**
 * Real native forward classification, shared by future selected/ALL callers.
 * It never chooses the policy for a miss/contact/incomplete limit, never uses
 * captured deltas, and never infers body identity from the supplied geometry.
 * The caller owns only a successful `complete.tool`; all other wrappers remain
 * local. Native/Boolean/cleanup errors escape unchanged or with retained cause.
 */
export function resolveUntilNextCut(input: UntilNextCutInput): UntilNextCutResolution {
  const origin = vector(input.origin, 'UntilNext origin'), direction = vector(input.direction, 'UntilNext physical ray');
  if (Math.abs(Math.hypot(...direction) - 1) > 1e-8 || typeof input.makePrism !== 'function') {
    throw new Error('UntilNext requires a unit physical ray and a real prism factory.');
  }
  let forward: ForwardMaterialEvidence | undefined;
  try {
    return withNativeOwners<UntilNextCutResolution>(owners => {
      if (!input.workingTarget || input.workingTarget.isNull) throw new Error('The exact progressive UntilNext owner is unavailable.');
      const target = owners.own(copyBodyShape(input.workingTarget)), targetState = inspect(target.wrapped);
      if (targetState.kind !== 'material' || targetState.evidence.contactTopologyPresent) {
        throw new Error('UntilNext on empty material or loose topology needs a separate extent policy.');
      }
      const supplied = new WeakSet<Shape3D>(), suppliedHandles = new WeakSet<RawShape>();
      const borrowedHandle = input.workingTarget.wrapped, targetHandle = target.wrapped;
      const makePrism = (length: number, start = 0): Shape3D => withNativeOwners(fresh => {
        const value = input.makePrism(length, start);
        // Refuse existing borrowed/owned wrappers before acquiring them. Keep a
        // fresh factory return owned while registering its one-use identity.
        if (value === input.workingTarget || value === target || supplied.has(value)) {
          throw new Error('The UntilNext factory must return a fresh owned prism, never a borrowed or repeated wrapper.');
        }
        const handle = value.wrapped;
        if (handle === borrowedHandle || handle === targetHandle || suppliedHandles.has(handle)) {
          throw new Error('The UntilNext factory must return a fresh owned native prism handle, never a borrowed or repeated handle.');
        }
        // Guard exact handles too; this cannot repair finalizers installed by a
        // malformed upstream factory that constructed an SDK wrapper alias.
        fresh.own(value); supplied.add(value); suppliedHandles.add(handle); return value;
      }, value => [value], 'UntilNext prism ownership/registration or release failed.');
      const bounds = finiteBounds(target), projections: number[] = [];
      for (const x of [bounds[0][0], bounds[1][0]]) for (const y of [bounds[0][1], bounds[1][1]]) for (const z of [bounds[0][2], bounds[1][2]]) {
        projections.push((x - origin[0]) * direction[0] + (y - origin[1]) * direction[1] + (z - origin[2]) * direction[2]);
      }
      const maximum = Math.max(...projections), length = Math.max(1, maximum + Math.max(1, Math.abs(maximum) * .01));
      if (!Number.isFinite(length) || length > 10_000_000) throw new Error('The native forward query exceeds the finite UntilNext extent.');
      // Bounds enclose the query only. Actual Common and, for empty results,
      // native separation establish the classification.
      const prism = owners.own(makePrism(length)); validateBodyShape(prism); finiteBounds(prism);
      const intersection = common(target, prism, owners), observed = inspect(intersection);
      if (observed.kind === 'contact') return { kind: 'contact-or-near', evidence: 'lower-dimensional-common' };
      if (observed.kind === 'empty') {
        const distance = separation(target, prism);
        return distance > NEXT_CONTACT_DISTANCE_MM
          ? { kind: 'empty-forward', topologyFreeCompound: true, distanceMm: distance }
          : { kind: 'contact-or-near', evidence: 'empty-common-within-resolution', distanceMm: distance };
      }
      // Only the ordinary full-cap helper's explicitly typed exhaustion is
      // converted below, AFTER this scope's cleanup. No broad error-as-miss.
      forward = observed.evidence;
      const tool = owners.own(untilNextTool(target, origin, direction, makePrism, true));
      validateBodyShape(tool); finiteBounds(tool);
      return { kind: 'complete', tool, forward: observed.evidence };
    }, result => result.kind === 'complete' ? [result.tool] : [], 'UntilNext classification or owned-resource release failed.');
  } catch (error) {
    // Cleanup wrapping the typed primary is not caught by this branch. The
    // fatal Aggregate retains that primary instead of returning a diagnostic.
    if (error instanceof NextBoundaryUnavailableError && forward) return { kind: 'incomplete-limit', forward, reason: error.reason, error };
    throw error;
  }
}
