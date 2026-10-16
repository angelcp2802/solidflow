import { getOC, type cast, type Shape3D } from 'replicad';
import { withNativeOwners, type NativeOwners } from './kernel.native-ownership';
import type { Vec3 } from './kernel.types';

type RawShape = Parameters<typeof cast>[0];
type Bounds = readonly [Vec3, Vec3];
interface SolidRecord { readonly raw: RawShape; readonly bounds: Bounds; readonly volume: number }
export interface PositiveClosedToolSummary {
  readonly solidCount: number;
  readonly volumeMm3: number;
}

function validBRep(raw: RawShape, owners: NativeOwners): void {
  const analyzer = owners.own(new (getOC().BRepCheck_Analyzer)(raw, true, false, false));
  if (!analyzer.IsValid()) throw new Error('A temporary tool must be a valid native BRep.');
  owners.release(analyzer);
}

function positiveVolume(raw: RawShape, owners: NativeOwners): number {
  const properties = owners.own(new (getOC().GProp_GProps)());
  getOC().BRepGProp.VolumeProperties(raw, properties, 1e-10, false, false);
  const value = properties.Mass();
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Every temporary tool solid must have strictly positive finite signed volume.');
  }
  owners.release(properties);
  return value;
}

function boundsOf(raw: RawShape, owners: NativeOwners): Bounds {
  const oc = getOC(), box = owners.own(new oc.Bnd_Box());
  oc.BRepBndLib.Add(raw, box, false);
  if (box.IsVoid() || box.IsOpen()) throw new Error('A temporary tool must have finite native bounds.');
  const low = owners.own(box.CornerMin()), high = owners.own(box.CornerMax());
  const a: Vec3 = [low.X(), low.Y(), low.Z()], b: Vec3 = [high.X(), high.Y(), high.Z()];
  if (![...a, ...b].every(Number.isFinite) || a.some((value, axis) => value > b[axis])) {
    throw new Error('A temporary tool must have finite ordered native bounds.');
  }
  owners.release(low); owners.release(high); owners.release(box);
  return [a, b];
}

function closedSolid(raw: RawShape): Omit<SolidRecord, 'raw'> {
  return withNativeOwners(owners => {
    const oc = getOC();
    validBRep(raw, owners);
    const shells = owners.own(new oc.TopExp_Explorer(raw, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    let count = 0;
    while (shells.More()) {
      const shell = owners.own(shells.Current());
      if (!oc.BRep_Tool.IsClosed(shell)) throw new Error('Every temporary tool solid must contain only closed shells.');
      owners.release(shell); count++; shells.Next();
    }
    if (!count) throw new Error('A temporary tool solid without a closed shell is not material.');
    // The occurrence is borrowed from the outer explorer. Native bounds query
    // it directly; this inner scope never casts/adopts its raw handle.
    return { volume: positiveVolume(raw, owners), bounds: boundsOf(raw, owners) };
  }, undefined, 'Temporary tool solid inspection or release failed.');
}

function rejectLooseTopology(raw: RawShape, owners: NativeOwners): void {
  const oc = getOC();
  for (const kind of ['SHELL', 'FACE', 'WIRE', 'EDGE', 'VERTEX'] as const) {
    const explorer = owners.own(new oc.TopExp_Explorer(raw,
      oc.TopAbs_ShapeEnum[`TopAbs_${kind}`], oc.TopAbs_ShapeEnum.TopAbs_SOLID));
    if (explorer.More()) throw new Error('A temporary tool cannot contain topology outside its closed solids.');
    owners.release(explorer);
  }
}

function overlapHasMaterial(left: RawShape, right: RawShape): boolean {
  return withNativeOwners(owners => {
    const oc = getOC(), argumentsList = owners.own(new oc.NCollection_List_TopoDS_Shape()),
      tools = owners.own(new oc.NCollection_List_TopoDS_Shape()), builder = owners.own(new oc.BRepAlgoAPI_Common());
    owners.own(argumentsList.Append(left)); owners.own(tools.Append(right));
    builder.SetArguments(argumentsList); builder.SetTools(tools); builder.SetNonDestructive(true);
    if (!builder.NonDestructive()) throw new Error('Temporary tool overlap inspection must be non-destructive.');
    builder.Build();
    if (!builder.IsDone()) throw new Error('The native temporary tool overlap query did not finish.');
    const common = owners.own(builder.Shape());
    if (common.IsNull()) throw new Error('A null Common is not proof of non-overlapping temporary tool solids.');
    validBRep(common, owners);
    const solids = owners.own(new oc.TopExp_Explorer(common, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    // A valid face/edge contact is permitted between closed tool components.
    // Only actual positive closed-solid intersection proves interior overlap.
    if (!solids.More()) return false;
    const raw = owners.own(solids.Current());
    closedSolid(raw);
    return true;
  }, undefined, 'Temporary tool overlap inspection or release failed.');
}

/**
 * Borrowed, non-destructive geometry inspection for an operation's temporary
 * tool. This detached summary certifies no recipe, frame, body association or
 * lifetime. Source/current/final-owner validation remains a separate contract.
 */
export function validatePositiveClosedTool(shape: Shape3D): PositiveClosedToolSummary {
  return withNativeOwners(owners => {
    const oc = getOC(), raw = shape.wrapped;
    if (raw.IsNull()) throw new Error('A temporary tool cannot be null.');
    const kind = raw.ShapeType();
    if (kind !== oc.TopAbs_ShapeEnum.TopAbs_SOLID && kind !== oc.TopAbs_ShapeEnum.TopAbs_COMPSOLID &&
      kind !== oc.TopAbs_ShapeEnum.TopAbs_COMPOUND) {
      throw new Error('A temporary tool must contain closed solids, not a lower-dimensional root.');
    }
    validBRep(raw, owners); boundsOf(raw, owners);
    const explorer = owners.own(new oc.TopExp_Explorer(raw, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    const solids: SolidRecord[] = [];
    // Do not use Shape.solids: its SDK traversal deduplicates IsSame entries.
    // Native traversal also carries each occurrence's accumulated placement and
    // orientation; signed per-solid mass must be positive in that context.
    while (explorer.More()) {
      const current = owners.own(explorer.Current());
      if (solids.some(previous => previous.raw.IsSame(current))) {
        throw new Error('A temporary tool cannot contain repeated native solid occurrences.');
      }
      solids.push({ raw: current, ...closedSolid(current) }); explorer.Next();
    }
    if (!solids.length) throw new Error('A temporary tool must contain at least one positive closed solid.');
    rejectLooseTopology(raw, owners);
    // Bounds are only a proof of separation. Candidate intersections always
    // use completed native Common; exceptions never become non-overlap.
    solids.sort((a, b) => a.bounds[0][0] - b.bounds[0][0]);
    for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
      const left = solids[i], right = solids[j];
      if (right.bounds[0][0] > left.bounds[1][0]) break;
      if ([1, 2].some(axis => left.bounds[1][axis] < right.bounds[0][axis] || right.bounds[1][axis] < left.bounds[0][axis])) continue;
      if (overlapHasMaterial(left.raw, right.raw)) throw new Error('A temporary tool cannot contain overlapping solid interiors.');
    }
    const volumeMm3 = positiveVolume(raw, owners);
    return { solidCount: solids.length, volumeMm3 };
  }, undefined, 'Temporary tool validation or owned-resource release failed.');
}
