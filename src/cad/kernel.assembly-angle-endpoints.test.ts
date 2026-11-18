import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC } from 'replicad';
import { beforeAll, expect, it } from 'vitest';
import { validateDocument } from '../model/document';
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type AssemblyGeometryReference, type AssemblyOccurrence } from '../model/assemblyDocument';
import { composeRigidPoses, identityRigidPose, type RigidPose } from '../model/rigidPose';
import { prepareAssemblySolve, discardAssemblySolvePreview, type AssemblySolvePreview } from './kernel.assembly-solve';
import { CadEngine } from './kernel.engine';
import { placeAssemblyBody } from './kernel.assembly-placements';
import { validateBodyShape, type NativeBodyCatalog } from './kernel.bodies';
import { withNativeOwners } from './kernel.native-ownership';
import type { Vec3 } from './kernel.types';

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
const stamp = '2026-11-07T00:00:00.000Z', root = Math.sqrt(30);
const rigid: RigidPose = { translation: [80, -120, 50], rotation: [2 / root, -1 / root, 3 / root, 4 / root] };
type Case = { axis: 'X' | 'Y'; target: 0 | 180; transformed: boolean };
const cases: Case[] = (['X', 'Y'] as const).flatMap(axis => ([0, 180] as const).flatMap(target => [false, true].map(transformed => ({ axis, target, transformed }))));
function rotate(q: RigidPose['rotation'], p: Vec3): Vec3 {
  const [x, y, z, w] = q, [a, b, c] = p;
  return [(1 - 2 * (y * y + z * z)) * a + 2 * (x * y - z * w) * b + 2 * (x * z + y * w) * c,
    2 * (x * y + z * w) * a + (1 - 2 * (x * x + z * z)) * b + 2 * (y * z - x * w) * c,
    2 * (x * z - y * w) * a + 2 * (y * z + x * w) * b + (1 - 2 * (x * x + y * y)) * c];
}
function fixture(item: Case): AssemblyDocument {
  // Original 3x2x4 mm prism, authored for this regression. No imported source,
  // stored native topology, vendor data or saved solver placement fixture.
  const part = validateDocument({ version: 1, id: 'endpoint-prism', name: 'Original endpoint prism', units: 'mm', createdAt: stamp, updatedAt: stamp,
    features: [
      { id: 'endpoint-profile', name: 'Original 3 by 2 rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [1.5, 1], width: 3, height: 2 } },
      { id: 'endpoint-extrude', name: 'Original 4 mm extrusion', type: 'extrude', sketchId: 'endpoint-profile', depth: 4, symmetric: false, suppressed: false,
        bodyOperation: { mode: 'new', bodyId: 'endpoint-body' } },
    ] });
  const definition = { id: 'endpoint-prism', revision: 'r1' }, common = item.transformed ? rigid : identityRigidPose();
  const initial = item.target === 180 ? 0 : 180, halfTurn: RigidPose['rotation'] = item.axis === 'X' ? [1, 0, 0, 0] : [0, 1, 0, 0];
  const make = (id: string, fixed: boolean, translation: Vec3, rotation: RigidPose['rotation']): AssemblyOccurrence => ({ id, name: id,
    definition, fixed, visible: true, suppressed: false, pose: composeRigidPoses(common, { translation, rotation }) });
  const reference = (id: string | null, kind: 'principal-axis' | 'principal-plane'): AssemblyGeometryReference => ({ kind,
    component: id ? { occurrencePath: [id], definition } : null, ...(kind === 'principal-axis' ? { axis: 'Z' as const } : { plane: item.axis === 'X' ? 'YZ' as const : 'XZ' as const }) } as AssemblyGeometryReference);
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'endpoint-root', revision: 'r1', name: 'Original coupled endpoint assembly', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [{ kind: 'part', ...definition, document: part }], occurrences: [make('base', true, [0, 0, 0], [0, 0, 0, 1]),
      make('guide', false, item.axis === 'X' ? [12, 0, 0] : [0, 12, 0], initial === 0 ? [0, 0, 0, 1] : halfTurn),
      make('follower', false, [16, 0, 0], [Math.SQRT1_2, 0, 0, Math.SQRT1_2])], mates: [
      { id: 'guide-distance', name: 'Original signed plane distance', type: 'distance', suppressed: false, alignment: 'aligned',
        first: reference(item.transformed ? 'base' : null, 'principal-plane'), second: reference('guide', 'principal-plane'), distance: item.axis === 'X' ? -12 : 12 },
      { id: 'follower-perpendicular', name: 'Original perpendicular follower', type: 'perpendicular', suppressed: false, alignment: null,
        first: reference('follower', 'principal-axis'), second: reference('base', 'principal-axis') },
      { id: 'guide-angle', name: 'Original principal angle', type: 'angle', suppressed: false, angle: initial,
        first: reference(item.target === 0 ? 'base' : 'guide', 'principal-axis'), second: reference(item.target === 0 ? 'guide' : 'base', 'principal-axis') },
    ] });
}
function ready(input: AssemblyDocument): AssemblySolvePreview {
  const result = prepareAssemblySolve(input);
  expect(result.status, JSON.stringify(result.status === 'rejected' ? result : result.scopes)).toBe('ready');
  if (result.status !== 'ready') throw Error(result.message);
  try {
    expect(result.scopes[0].result).toMatchObject({ rank: 5, localDOF: 7 });
    expect(result.checks).toHaveLength(3); expect(result.checks.every(check => check.satisfied && check.angleTolerance === 1e-8 && check.lengthTolerance === 1e-6)).toBe(true);
    return result;
  } catch (error) { discardAssemblySolvePreview(result); throw error; }
}
function physicalGeometry(document: AssemblyDocument, item: Case) {
  const common = item.transformed ? rigid : identityRigidPose();
  withNativeOwners(owners => {
    const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() });
    const definition = document.definitions[0]; if (definition.kind !== 'part') throw Error('Original prism definition required');
    expect(engine.build(definition.document.features).featureErrors).toEqual([]);
    // Test-only native body access; no shape/ref is injected into a worker or UI.
    const source = (engine as unknown as { bodyCatalog: NativeBodyCatalog }).bodyCatalog.resolve({ bodyId: 'endpoint-body', sourceFeatureId: 'endpoint-extrude' }).shape;
    for (const occurrence of document.occurrences) {
      const shape = owners.own(placeAssemblyBody(source, occurrence.pose)); validateBodyShape(shape);
      expect(owners.ownAll(shape.solids)).toHaveLength(1);
      expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - 24)).toBeLessThanOrEqual(1e-5);
      expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - 52)).toBeLessThanOrEqual(1e-5);
      const corners: Vec3[] = [];
      for (const x of [0, 3]) for (const y of [0, 2]) for (const z of [0, 4]) {
        const local: Vec3 = occurrence.id === 'follower' ? [x, -z, y]
          : occurrence.id === 'guide' && item.target === 180 ? item.axis === 'X' ? [x, -y, -z] : [-x, y, -z] : [x, y, z];
        const rotated = rotate(common.rotation, local);
        // In-plane translations remain free. Only use that free origin here;
        // the fixed normal coordinate and both physical directions are checked below.
        corners.push(rotated.map((value, axis) => value + occurrence.pose.translation[axis]) as Vec3);
      }
      const bounds = owners.own(shape.boundingBox).bounds;
      for (let axis = 0; axis < 3; axis++) {
        expect(Math.abs(bounds[0][axis] - Math.min(...corners.map(point => point[axis])))).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(bounds[1][axis] - Math.max(...corners.map(point => point[axis])))).toBeLessThanOrEqual(1e-6);
      }
    }
  });
  const guide = document.occurrences.find(occurrence => occurrence.id === 'guide')!, normal: Vec3 = item.axis === 'X' ? [1, 0, 0] : [0, 1, 0];
  const expectedNormal = rotate(common.rotation, normal), expectedAxis = rotate(common.rotation, [0, 0, item.target === 0 ? 1 : -1]);
  for (const [actual, expected] of [[rotate(guide.pose.rotation, normal), expectedNormal], [rotate(guide.pose.rotation, [0, 0, 1]), expectedAxis]])
    actual.forEach((value, axis) => expect(Math.abs(value - expected[axis])).toBeLessThanOrEqual(1e-8));
  expect(Math.abs(expectedNormal.reduce((sum, value, axis) => sum + value * (guide.pose.translation[axis] - common.translation[axis]), 0) - 12)).toBeLessThanOrEqual(1e-6);
}
it.each(cases)('solves native coupled $axis plane endpoint $target (common rigid frame=$transformed)', item => {
  const original = fixture(item), originalBytes = serializeAssemblyDocument(original), initial = ready(original);
  let candidate: AssemblyDocument;
  try { candidate = validateAssemblyDocument(initial.document); }
  finally { discardAssemblySolvePreview(initial); }
  const angle = candidate.mates.find(mate => mate.id === 'guide-angle'); if (angle?.type !== 'angle') throw Error('Original angle required'); angle.angle = item.target;
  const before = serializeAssemblyDocument(candidate), preview = ready(candidate);
  try {
    expect(serializeAssemblyDocument(original)).toBe(originalBytes); expect(serializeAssemblyDocument(candidate)).toBe(before);
    expect(preview.document.occurrences[0]).toEqual(original.occurrences[0]); expect(preview.document.occurrences[2]).toEqual(original.occurrences[2]);
    expect(preview.document.mates).toEqual(candidate.mates); expect(preview.document.definitions).toEqual(original.definitions);
    const solved = validateAssemblyDocument(preview.document); physicalGeometry(solved, item);
    const reopened = parseAssemblyDocument(serializeAssemblyDocument(solved)), fresh = ready(reopened);
    try { expect(fresh.document.mates).toEqual(candidate.mates); physicalGeometry(validateAssemblyDocument(fresh.document), item); }
    finally { discardAssemblySolvePreview(fresh); }
  } finally { discardAssemblySolvePreview(preview); }
}, 60_000);
