import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, makeBox, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import type { Vec3 } from './kernel.types';
import { bodyBoolean, maximumNativeShapeTolerance, validateBodyShape } from './kernel.bodies';
import { NativeCleanupError, withNativeOwners, type NativeOwner, type NativeOwners } from './kernel.native-ownership';
import * as ownership from './kernel.native-ownership';
import { classifyAdditiveRecipeOwner } from './kernel.recipe-additive-applicability';

// Original Cartesian probes, in mm. No saved topology or external CAD models.
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);

const probes = [
  { name: 'separated', min: [10, 0, 4], max: [12, 2, 6], validUnion: false },
  { name: 'face-contact', min: [0, 0, 4], max: [2, 2, 6], validUnion: true },
  { name: 'edge-contact', min: [4, 0, 4], max: [6, 2, 6], validUnion: false },
  { name: 'point-contact', min: [4, 4, 4], max: [6, 6, 6], validUnion: false },
  { name: 'overlap', min: [0, 0, 3], max: [2, 2, 5], validUnion: true },
  { name: 'contained', min: [1, 1, 1], max: [3, 3, 3], validUnion: true },
  // OCCT can tolerance-glue this gap into one solid. Applicability must still
  // reject its independently observed positive near-distance before that Fuse.
  { name: 'near-gap', min: [0, 0, 4.0000002], max: [2, 2, 6.0000002], validUnion: true },
] as const;

it.each(probes)('observes actual raw Common, native distance and connected union for $name', probe => withNativeOwners(owners => {
  const oc = getOC(), owner = owners.own(makeBox([0, 0, 0], [4, 4, 4]));
  const tool = owners.own(makeBox([...probe.min] as Vec3, [...probe.max] as Vec3));
  validateBodyShape(owner); validateBodyShape(tool);
  if (probe.name === 'near-gap') expect(() => classifyAdditiveRecipeOwner(owner, tool)).toThrow(/demasiado cerca/);
  else {
    const actual = classifyAdditiveRecipeOwner(owner, tool);
    expect(actual.kind).toBe(probe.name === 'separated' ? 'separated' : ['overlap', 'contained'].includes(probe.name) ? 'overlap' : 'contact');
    if (actual.kind === 'separated') expect(actual.distanceMm).toBeGreaterThan(actual.guardMm);
  }
  const argumentsList = owners.own(new oc.NCollection_List_TopoDS_Shape()), tools = owners.own(new oc.NCollection_List_TopoDS_Shape());
  owners.own(argumentsList.Append(owner.wrapped)); owners.own(tools.Append(tool.wrapped));
  const builder = owners.own(new oc.BRepAlgoAPI_Common());
  builder.SetArguments(argumentsList); builder.SetTools(tools); builder.SetNonDestructive(true); builder.Build();
  expect(builder.NonDestructive()).toBe(true); expect(builder.IsDone()).toBe(true);
  const raw = owners.own(builder.Shape()); expect(raw.IsNull()).toBe(false);
  const topology: Record<string, number> = {};
  for (const kind of ['SOLID', 'FACE', 'EDGE', 'VERTEX'] as const) {
    const explorer = owners.own(new oc.TopExp_Explorer(raw, oc.TopAbs_ShapeEnum[`TopAbs_${kind}`], oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    let count = 0; while (explorer.More()) { count++; explorer.Next(); } topology[kind] = count;
  }
  const distance = owners.own(new oc.BRepExtrema_DistShapeShape());
  distance.LoadS1(owner.wrapped); distance.LoadS2(tool.wrapped); distance.Perform();
  expect(distance.IsDone()).toBe(true); expect(distance.NbSolution()).toBeGreaterThan(0); expect(distance.Value()).toBeGreaterThanOrEqual(0);
  const guard = 1e-7 + maximumNativeShapeTolerance(owner) + maximumNativeShapeTolerance(tool);
  let union: Shape3D | undefined, unionError = '', unionVolume: number | null = null;
  try { union = owners.own(bodyBoolean('add', owner, tool)); unionVolume = validateBodyShape(union); }
  catch (error) { unionError = String(error); }
  if (process.env.SOLIDFLOW_CAD_REPORT === '1') process.stdout.write(JSON.stringify({ probe: probe.name, topology,
    distanceMm: distance.Value(), guard, unionVolume, unionError }) + '\n');
  expect(!unionError).toBe(probe.validUnion);
}), 60_000);

// Declared failure injection on actual received native wrappers, solely inside
// this component's owned scope. Never a replacement geometry/accepted result.
function nativeFault<T>(patch: (owner: NativeOwner) => void, action: () => T): T {
  const real = ownership.withNativeOwners;
  const replacement: typeof ownership.withNativeOwners = <R>(operation: (owners: NativeOwners) => R,
    retained: (value: R) => readonly NativeOwner[] = () => [], label?: string): R => real(owners => {
    if (label === 'Additive recipe applicability or native release failed.') {
      const own = owners.own.bind(owners);
      owners.own = <S extends NativeOwner>(value: S): S => { patch(value); return own(value); };
    }
    return operation(owners);
  }, retained, label);
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(replacement);
  try { return action(); } finally { spy.mockRestore(); }
}
const tree = (error: unknown): unknown[] => error instanceof AggregateError ? [error, ...error.errors.flatMap(tree)] : [error];

it.each(['common-not-done', 'common-throw', 'distance-not-done', 'distance-nonfinite', 'common-primary-and-release', 'separation-release'] as const)(
  'does not issue an applicability miss after actual native %s failure', fault => withNativeOwners(owners => {
    const target = owners.own(makeBox([0, 0, 0], [4, 4, 4])), tool = owners.own(makeBox([10, 0, 4], [12, 2, 6]));
    const primary = new Error('Original native positive Common fault'), cleanup = new Error('Original native applicability release fault');
    let commonSeen = false, distanceSeen = false, releases = 0, distanceReleases = 0, caught: unknown, delivered: unknown;
    try {
      delivered = nativeFault(owner => {
        if ('SetArguments' in owner && 'SetTools' in owner && 'Build' in owner && typeof owner.Build === 'function'
          && 'IsDone' in owner && typeof owner.IsDone === 'function') {
          commonSeen = true;
          const build = owner.Build.bind(owner), done = owner.IsDone.bind(owner), remove = owner.delete.bind(owner);
          Object.defineProperty(owner, 'delete', { configurable: true, value: () => { releases++; remove(); if (fault === 'common-primary-and-release') throw cleanup; } });
          if (fault === 'common-not-done') Object.defineProperty(owner, 'IsDone', { configurable: true, value: () => { done(); return false; } });
          if (fault === 'common-throw' || fault === 'common-primary-and-release') {
            Object.defineProperty(owner, 'Build', { configurable: true, value: () => { build(); throw primary; } });
          }
        }
        if ('LoadS1' in owner && 'Value' in owner && typeof owner.Value === 'function'
          && 'IsDone' in owner && typeof owner.IsDone === 'function') {
          distanceSeen = true;
          const done = owner.IsDone.bind(owner), value = owner.Value.bind(owner), remove = owner.delete.bind(owner);
          Object.defineProperty(owner, 'delete', { configurable: true, value: () => { distanceReleases++; remove(); if (fault === 'separation-release') throw cleanup; } });
          if (fault === 'distance-not-done') Object.defineProperty(owner, 'IsDone', { configurable: true, value: () => { done(); return false; } });
          if (fault === 'distance-nonfinite') Object.defineProperty(owner, 'Value', { configurable: true, value: () => { value(); return NaN; } });
        }
      }, () => classifyAdditiveRecipeOwner(target, tool));
    } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(Error); expect(delivered).toBeUndefined(); expect(commonSeen).toBe(true); expect(releases).toBe(1);
    expect(distanceSeen).toBe(!fault.startsWith('common-'));
    expect(distanceReleases).toBe(distanceSeen ? 1 : 0);
    if (fault === 'common-throw') expect(caught).toBe(primary);
    if (fault === 'common-primary-and-release') { expect(caught).toBeInstanceOf(NativeCleanupError); expect(tree(caught)).toContain(primary); expect(tree(caught)).toContain(cleanup); }
    if (fault === 'separation-release') { expect(caught).toBeInstanceOf(NativeCleanupError); expect(tree(caught)).toContain(cleanup); }
    // Every query ran against the real original boxes; all failures preserve them.
    expect(validateBodyShape(target)).toBeCloseTo(64, 8); expect(validateBodyShape(tool)).toBeCloseTo(8, 8);
  }), 60_000);
