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
import { repositionSketchPoints, type PointTarget } from '../sketch/point-reposition';
import { solveSketch } from '../sketch/solver';
import type { EntityProfile, SketchOffsetRelation } from '../sketch/types';

// Original Cartesian fixture, mm: source (0,0)->(10,0), an uncapped right
// offset at 2 without a distance dimension, and two 1 mm capped descendants.
// Only the final rectangle contributes material. Analytical prism h=4,
// width=2: V=8L and A=12L+16. No external fixture or interactive capture.
const sketchId = 'following-sketch', engine = new CadEngine();
const coordinateTolerance = 5e-7, measureTolerance = 5e-6;
const options: OffsetParameters = { distance: 2, reverse: false, bothDirections: false, chain: false, cap: 'none', construction: 'source', addDimensions: false };
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined })), 60_000);
afterEach(() => engine.dispose());

function profile(document: Document): EntityProfile {
  const sketch = document.features.find(feature => feature.id === sketchId);
  if (sketch?.type !== 'sketch' || sketch.profile.kind !== 'entities') throw Error('Entity sketch expected');
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
  if (!application.accepted) throw Error(application.message);
  return { profile: application.solution.profile, imageIds: plan.imageEntityIds };
}
function fixture() {
  const source: EntityProfile = { kind: 'entities', points: [{ id: 'source-end', x: 10, y: 0 }],
    entities: [{ id: 'source-line', type: 'line', start: 'origin', end: 'source-end', construction: false }],
    constraints: [{ id: 'source-horizontal', type: 'horizontal', entityId: 'source-line' }, { id: 'source-length', type: 'length', entityId: 'source-line', value: 10 }] };
  const first = apply(source, 'source-line', options), second = apply(first.profile, first.imageIds[0], { ...options, distance: 1, bothDirections: true, cap: 'line', addDimensions: true });
  const sketch = validateDocument({ ...createDocument('Original offset following'), features: [{ id: sketchId, name: 'L10 offset chain', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: second.profile }] });
  return { document: addFeature(sketch, { id: 'following-solid', name: '4 mm extrusion', type: 'extrude', sketchId, depth: 4, symmetric: false, suppressed: false }), firstImageId: first.imageIds[0], secondImageIds: second.imageIds };
}
function relation(target: EntityProfile, imageId: string) {
  return target.constraints.find((constraint): constraint is SketchOffsetRelation => constraint.type === 'offset' && constraint.images.some(image => image.entityIds.includes(imageId)))!;
}
function line(target: EntityProfile, id: string) {
  const entity = target.entities.find(entity => entity.id === id);
  if (entity?.type !== 'line') throw Error('Line expected');
  return entity;
}
function point(target: EntityProfile, id: string) { return id === 'origin' ? { x: 0, y: 0 } : target.points.find(point => point.id === id)!; }
function expectLine(target: EntityProfile, id: string, startX: number, endX: number, y: number) {
  const entity = line(target, id);
  for (const [pointId, x] of [[entity.start, startX], [entity.end, endX]] as const) {
    expect(Math.abs(point(target, pointId).x-x)).toBeLessThan(coordinateTolerance);
    expect(Math.abs(point(target, pointId).y-y)).toBeLessThan(coordinateTolerance);
  }
}
function lengthTarget(document: Document, length: number) {
  const target = structuredClone(profile(document)), dimension = target.constraints.find(constraint => constraint.id === 'source-length');
  if (dimension?.type !== 'length') throw Error('Length expected');
  dimension.value = length;
  return updateFeature(document, sketchId, { profile: target });
}
function reposition(document: Document, targets: PointTarget[]) {
  const result = repositionSketchPoints(solve(profile(document)).profile, targets);
  if (!result.accepted) throw Error(result.message);
  return updateFeature(document, sketchId, { profile: result.solution.profile });
}
function expectSolid(shape: Shape3D, startX: number, endX: number, y: number) {
  const [own, cleanup] = localGC();
  try {
    const oc = getOC(), analyzer = own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
    const mass = own(new oc.GProp_GProps()), area = own(measureShapeSurfaceProperties(shape)), box = own(shape.boundingBox), solids = shape.solids;
    solids.forEach(own); expect(solids).toHaveLength(1); expect(analyzer.IsValid()).toBe(true);
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
    const length = endX-startX;
    expect(Math.abs(mass.Mass()-8*length)).toBeLessThan(measureTolerance);
    expect(Math.abs(area.area-(12*length+16))).toBeLessThan(measureTolerance);
    [[startX,y-1,0],[endX,y+1,4]].forEach((bound,i) => bound.forEach((value,j) => expect(Math.abs(box.bounds[i][j]-value)).toBeLessThan(measureTolerance)));
  } finally { cleanup(); }
}
async function expectBuiltAndExported(document: Document, startX: number, endX: number, y: number) {
  const before = structuredClone(document), built = engine.build(document.features);
  expect(built.featureErrors).toEqual([]); expect(built.warnings).toEqual([]);
  expect(Math.abs(built.volume-8*(endX-startX))).toBeLessThan(measureTolerance);
  const shape = importStepSolid(createStepSource(new Uint8Array(await engine.export('step', document.features).arrayBuffer())));
  try { expectSolid(shape, startX, endX, y); } finally { shape.delete(); }
  expect(document).toEqual(before);
}

it('includes following stations in structural naming and normalizes all-released state to legacy free', () => {
  const { document, firstImageId } = fixture(), target = structuredClone(profile(document)), image = relation(target, firstImageId).images[0];
  expect(image.lineEndpointFollowing).toEqual([true,true]);
  const following = entityProfileStructure(target); image.lineEndpointFollowing = [true,false];
  const partial = entityProfileStructure(target); expect(partial).not.toEqual(following);
  image.lineEndpointFollowing = [false,false]; const released = entityProfileStructure(target);
  delete image.lineEndpointFollowing; expect(entityProfileStructure(target)).toEqual(released);
  expect(released).not.toEqual(partial);
});

it('follows a source length from 10 to 14 through capped descendants, reopened CAD and fresh STEP', async () => {
  const { document, firstImageId, secondImageIds } = fixture();
  await expectBuiltAndExported(document, 0, 10, -2);
  const edited = parseDocument(serializeDocument(lengthTarget(parseDocument(serializeDocument(document)), 14)));
  const result = solve(profile(edited));
  // Normal separation is unconstrained. Check stations and relative distances
  // at the realized normal coordinate, rather than making its seed a target.
  const y = point(result.profile, line(result.profile, firstImageId).start).y;
  expectLine(result.profile, firstImageId, 0, 14, y);
  expectLine(result.profile, secondImageIds[0], 0, 14, y-1); expectLine(result.profile, secondImageIds[1], 0, 14, y+1);
  await expectBuiltAndExported(edited, 0, 14, y);
});

it('persists one explicit end release through one undo/redo entry and keeps its 12 mm solid when source becomes 14', async () => {
  const { document, firstImageId } = fixture(), history = new DocumentHistory(document), before = serializeDocument(history.current);
  const endpoint = line(profile(document), firstImageId).end;
  history.apply(reposition(history.current, [{ pointId: endpoint, x: 12 }]));
  const detached = serializeDocument(history.current);
  expect(relation(profile(history.current), firstImageId).images[0].lineEndpointFollowing).toEqual([true,false]);
  expect(serializeDocument(history.undo())).toBe(before); expect(history.canUndo).toBe(false);
  expect(serializeDocument(history.redo())).toBe(detached); expect(history.canRedo).toBe(false);
  const reopened = parseDocument(detached), edited = lengthTarget(reopened, 14), result = solve(profile(edited));
  expectLine(result.profile, 'source-line', 0, 14, 0); expectLine(result.profile, firstImageId, 0, 12, -2);
  await expectBuiltAndExported(edited, 0, 12, -2);
});

it('releases a normal-only endpoint request and retains the new normal separation after reopening', async () => {
  const { document, firstImageId } = fixture(), endpoint = line(profile(document), firstImageId).end;
  // Both coordinates are targets, but only the normal coordinate changes.
  const changed = reposition(document, [{ pointId: endpoint, x: 10, y: -3 }]), reopened = parseDocument(serializeDocument(changed));
  const edited = lengthTarget(reopened, 14), result = solve(profile(edited));
  expect(relation(result.profile, firstImageId).images[0].lineEndpointFollowing).toEqual([true,false]);
  expectLine(result.profile, firstImageId, 0, 10, -3);
  await expectBuiltAndExported(edited, 0, 10, -3);
});

it('keeps the untouched end following after a start-only edit, producing an analytical 16 mm prism', async () => {
  const { document, firstImageId } = fixture(), endpoint = line(profile(document), firstImageId).start;
  const changed = reposition(document, [{ pointId: endpoint, x: -2 }]), edited = lengthTarget(parseDocument(serializeDocument(changed)), 14);
  const result = solve(profile(edited));
  expect(relation(result.profile, firstImageId).images[0].lineEndpointFollowing).toEqual([false,true]);
  const y = point(result.profile, line(result.profile, firstImageId).start).y;
  expectLine(result.profile, firstImageId, -2, 14, y);
  await expectBuiltAndExported(edited, -2, 14, y);
});

it('preserves reopened references but rejects a stale selected fillet after a station-equation release', () => {
  const { document, firstImageId } = fixture(), initial = engine.build(document.features);
  expect(initial.featureErrors).toEqual([]);
  const reopened = engine.build(parseDocument(serializeDocument(document)).features);
  expect(reopened.edges.map(edge => edge.ref)).toEqual(initial.edges.map(edge => edge.ref));
  expect(reopened.faces?.map(face => face.ref)).toEqual(initial.faces?.map(face => face.ref));
  const corner = initial.edges.filter(edge => edge.lines.every((value,index) => index%3 === 0 ? Math.abs(value-10)<coordinateTolerance : index%3 === 1 ? Math.abs(value+1)<coordinateTolerance : true));
  expect(corner).toHaveLength(1);
  const finished = addFeature(document, { id: 'following-fillet', name: 'R0.25 corner', type: 'fillet', baseFeatureId: 'following-solid', size: 0.25, selection: { mode: 'selected', edges: [corner[0].ref] }, suppressed: false });
  expect(engine.build(finished.features).featureErrors).toEqual([]);
  // Same coordinates, different station equations: isolate naming policy from
  // ordinal changes or a changed BRep. A stale reference must require reselection.
  const released = structuredClone(profile(document)); relation(released, firstImageId).images[0].lineEndpointFollowing = [true,false];
  const bare = updateFeature(document, sketchId, { profile: released }), built = engine.build(bare.features);
  expect(built.featureErrors).toEqual([]); expect(Math.abs(built.volume-80)).toBeLessThan(measureTolerance);
  expect(built.edges.map(edge => edge.ref)).not.toEqual(initial.edges.map(edge => edge.ref));
  expect(built.faces?.map(face => face.ref)).not.toEqual(initial.faces?.map(face => face.ref));
  const stale = engine.build(updateFeature(finished, sketchId, { profile: released }).features);
  expect(stale.featureErrors).toHaveLength(1); expect(stale.featureErrors[0].id).toBe('following-fillet');
});
