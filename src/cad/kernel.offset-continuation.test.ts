import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { afterEach, beforeAll, expect, it } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, localGC, measureShapeSurfaceProperties, setOC, type Shape3D } from 'replicad';
import { CadEngine } from './kernel.engine';
import { entityProfileStructure } from './kernel.profiles';
import { importStepSolid } from './kernel.step';
import { createStepSource } from '../model/stepSource';
import { addFeature, createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument, type Document } from '../model/document';
import { planSketchOffset, type OffsetParameters } from '../sketch/offset';
import { solveOffsetApplication } from '../sketch/offsetApplication';
import { solveSketch } from '../sketch/solver';
import type { EntityProfile } from '../sketch/types';

// Original synthetic Cartesian fixture authored for SolidFlow, in mm:
// source line L10, an uncapped right offset at 2, then two offsets at 1 with
// straight caps. Only the final 10×2 rectangle is material; extrusion h=4.
// Expected coordinates and rectangular-prism measures are analytical. The
// STEP producer and reader share OCCT; these tests do not prove independent
// interoperability, interactive behavior or native solver/DOF parity.
const sketchId = 'continuation-sketch', engine = new CadEngine();
const coordinateTolerance = 5e-7, measureTolerance = 5e-6;
const options: OffsetParameters = { distance: 2, reverse: false, bothDirections: false, chain: false, cap: 'none', construction: 'source', addDimensions: true };
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined })), 60_000);
afterEach(() => engine.dispose());

function profile(document: Document): EntityProfile {
  const sketch = document.features.find(feature => feature.id === sketchId);
  if (sketch?.type !== 'sketch' || sketch.profile.kind !== 'entities') throw new Error('Entity sketch expected');
  return sketch.profile;
}
function solve(input: EntityProfile) {
  const before = structuredClone(input), result = solveSketch(input);
  expect(input).toEqual(before); expect(['fullyDefined', 'underdefined'], result.message).toContain(result.status);
  expect(result.conflictingConstraintIds).toEqual([]); expect(result.maxResidual).toBeLessThanOrEqual(1e-7);
  return result;
}
function apply(input: EntityProfile, entityId: string, parameters: OffsetParameters) {
  const current = solve(input), plan = planSketchOffset(current.profile, [{ kind: 'entity', id: entityId }], parameters);
  expect(plan.changed, plan.message).toBe(true);
  const application = solveOffsetApplication(current, plan);
  if (!application.accepted) throw new Error(application.message);
  return { profile: application.solution.profile, imageIds: plan.imageEntityIds };
}
function fixture() {
  const source: EntityProfile = { kind: 'entities', points: [{ id: 'source-end', x: 10, y: 0 }],
    entities: [{ id: 'source-line', type: 'line', start: 'origin', end: 'source-end', construction: false }],
    constraints: [{ id: 'source-horizontal', type: 'horizontal', entityId: 'source-line' }, { id: 'source-length', type: 'length', entityId: 'source-line', value: 10 }] };
  const first = apply(source, 'source-line', options), second = apply(first.profile, first.imageIds[0], { ...options, distance: 1, bothDirections: true, cap: 'line' });
  const sketch = validateDocument({ ...createDocument('Original offset continuation'), features: [{ id: sketchId, name: 'L10 offset chain', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: second.profile }] });
  return { document: addFeature(sketch, { id: 'continuation-solid', name: '4 mm extrusion', type: 'extrude', sketchId, depth: 4, symmetric: false, suppressed: false }), firstImageId: first.imageIds[0], secondImageIds: second.imageIds };
}
function lengthTarget(document: Document, length: number) {
  const target = structuredClone(profile(document)), dimension = target.constraints.find(constraint => constraint.id === 'source-length');
  if (dimension?.type !== 'length') throw new Error('Source length expected');
  dimension.value = length;
  return updateFeature(document, sketchId, { profile: target });
}
function expectLine(target: EntityProfile, id: string, length: number, y: number) {
  const line = target.entities.find(entity => entity.id === id);
  if (line?.type !== 'line') throw new Error('Line expected');
  for (const [pointId, x] of [[line.start, 0], [line.end, length]] as const) {
    const point = pointId === 'origin' ? { x: 0, y: 0 } : target.points.find(point => point.id === pointId)!;
    expect(Math.abs(point.x-x)).toBeLessThan(coordinateTolerance); expect(Math.abs(point.y-y)).toBeLessThan(coordinateTolerance);
  }
}
function identities(target: EntityProfile) {
  return { points: target.points.map(point => point.id), entities: target.entities.map(entity => entity.id), constraints: target.constraints.map(constraint => constraint.id) };
}
function expectSolid(shape: Shape3D, length: number) {
  const [own, cleanup] = localGC();
  try {
    const oc = getOC(), analyzer = own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
    const mass = own(new oc.GProp_GProps()), area = own(measureShapeSurfaceProperties(shape)), box = own(shape.boundingBox), solids = shape.solids;
    solids.forEach(own); expect(solids).toHaveLength(1); expect(analyzer.IsValid()).toBe(true);
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
    // Rectangular prism length×2×4: V=8L, A=2(2L+4L+8).
    expect(Math.abs(mass.Mass()-8*length)).toBeLessThan(measureTolerance);
    expect(Math.abs(area.area-(12*length+16))).toBeLessThan(measureTolerance);
    [[0,-3,0],[length,-1,4]].forEach((bound,i) => bound.forEach((value,j) => expect(Math.abs(box.bounds[i][j]-value)).toBeLessThan(measureTolerance)));
  } finally { cleanup(); }
}
async function expectStep(document: Document, length: number) {
  const shape = importStepSolid(createStepSource(new Uint8Array(await engine.export('step', document.features).arrayBuffer())));
  try { expectSolid(shape, length); } finally { shape.delete(); }
}

it('normalizes explicit free and absent endpoint mode in lineage while distinguishing aligned stations', () => {
  const { document, firstImageId } = fixture(), target = structuredClone(profile(document));
  const group = target.constraints.find(constraint => constraint.type === 'offset' && constraint.images.some(image => image.entityIds.includes(firstImageId)));
  if (group?.type !== 'offset') throw new Error('First offset group expected');
  const image = group.images[0]; expect(image.lineEndpointMode).toBe('aligned');
  const aligned = entityProfileStructure(target); delete image.lineEndpointMode;
  const legacy = entityProfileStructure(target); image.lineEndpointMode = 'free';
  expect(entityProfileStructure(target)).toEqual(legacy); expect(legacy).not.toEqual(aligned);
});

it('continues both capped descendants through one saved source-length history edit with stable identities', () => {
  const { document, firstImageId, secondImageIds } = fixture(), history = new DocumentHistory(parseDocument(serializeDocument(document)));
  const before = serializeDocument(history.current), initialIds = identities(profile(document));
  expect(history.canUndo).toBe(false);
  const pending = lengthTarget(history.current, 12), solution = solve(profile(pending));
  expectLine(solution.profile, 'source-line', 12, 0); expectLine(solution.profile, firstImageId, 12, -2);
  expectLine(solution.profile, secondImageIds[0], 12, -3); expectLine(solution.profile, secondImageIds[1], 12, -1);
  expect(identities(solution.profile)).toEqual(initialIds);
  const changed = updateFeature(pending, sketchId, { profile: solution.profile }), reopened = parseDocument(serializeDocument(changed));
  expect(reopened.features).toEqual(changed.features); history.apply(reopened);
  expect(serializeDocument(history.undo())).toBe(before); expect(history.canUndo).toBe(false);
  expect(history.redo().features).toEqual(reopened.features); expect(history.canRedo).toBe(false);
  expectLine(solve(profile(history.current)).profile, firstImageId, 12, -2);
});

it('rebuilds the 10×2×4 solid as 12×2×4 from a reopened parameter edit and exports the fresh snapshot', async () => {
  const { document } = fixture(), before = structuredClone(document), initial = engine.build(document.features);
  expect(initial.featureErrors).toEqual([]); expect(initial.warnings).toEqual([]); expect(Math.abs(initial.volume-80)).toBeLessThan(measureTolerance);
  await expectStep(document, 10); expect(document).toEqual(before);
  // The saved geometry is still L10. Only the source dimensional target changes.
  const edited = lengthTarget(parseDocument(serializeDocument(document)), 12), editedBefore = structuredClone(edited);
  expectLine(profile(edited), 'source-line', 10, 0);
  const reopened = parseDocument(serializeDocument(edited)), rebuilt = engine.build(reopened.features);
  expect(edited).toEqual(editedBefore); expect(reopened.features).toEqual(edited.features);
  expect(rebuilt.featureErrors).toEqual([]); expect(rebuilt.warnings).toEqual([]); expect(Math.abs(rebuilt.volume-96)).toBeLessThan(measureTolerance);
  expect(rebuilt.faces?.map(face => face.ref)).toEqual(initial.faces?.map(face => face.ref)); expect(rebuilt.edges.map(edge => edge.ref)).toEqual(initial.edges.map(edge => edge.ref));
  // Deliberately replace the engine's current solid, then export the committed
  // L12 feature snapshot so a cached L10 body cannot satisfy this assertion.
  expect(engine.build(document.features).featureErrors).toEqual([]);
  await expectStep(reopened, 12); expect(reopened.features).toEqual(editedBefore.features);
});
