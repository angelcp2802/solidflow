import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { afterEach, beforeAll, expect, it } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, localGC, measureShapeSurfaceProperties, setOC, type Shape3D } from 'replicad';
import { CadEngine } from './kernel.engine';
import { entityProfileStructure } from './kernel.profiles';
import { importStepSolid } from './kernel.step';
import { createStepSource } from '../model/stepSource';
import { createSketchOffsetDocument } from '../examples/sketch-offset';
import { addFeature, createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument, type Document } from '../model/document';
import { planSketchOffset, type OffsetParameters } from '../sketch/offset';
import { solveOffsetApplication } from '../sketch/offsetApplication';
import { solveSketch } from '../sketch/solver';
import type { EntityProfile, SketchOffsetRelation } from '../sketch/types';

// Original analytical profiles authored for SolidFlow, in mm. Expected area,
// perimeter and coordinates below are independent formulas, never planner or
// offset-geometry results. STEP producer/reader share OCCT: no independent
// interoperability or interactive UI claim follows from these programmatic tests.
const engine = new CadEngine(), sketchId = 'offset-sketch', solidId = 'offset-solid';
const tolerance = 5e-6, coordinateTolerance = 5e-7;
type Metrics = { volume: number; area: number; bounds: readonly (readonly number[])[] };
const defaults: OffsetParameters = { distance: 1, reverse: false, bothDirections: false, chain: true, cap: 'none', construction: 'none', addDimensions: true };
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined })), 60_000);
afterEach(() => engine.dispose());
function profile(document: Document): EntityProfile {
  const sketch = document.features.find(feature => feature.id === sketchId);
  if (sketch?.type !== 'sketch' || sketch.profile.kind !== 'entities') throw new Error('Entity sketch expected');
  return sketch.profile;
}
function solve(target: EntityProfile) {
  const before = structuredClone(target), result = solveSketch(target);
  expect(target).toEqual(before); expect(['fullyDefined', 'underdefined'], result.message).toContain(result.status);
  expect(result.conflictingConstraintIds).toEqual([]); expect(result.maxResidual).toBeLessThanOrEqual(1e-7);
  return result;
}
function apply(document: Document, options: Partial<OffsetParameters> = {}, selected?: string[]) {
  const bytes = serializeDocument(document), current = solve(profile(document)), before = structuredClone(current.profile);
  const ids = selected ?? [current.profile.entities[0].id];
  const plan = planSketchOffset(current.profile, ids.map(id => ({ kind: 'entity', id })), { ...defaults, ...options });
  expect(plan.changed, plan.message).toBe(true); expect(plan.sourceProfile).toBe(current.profile); expect(plan.profile).not.toBe(current.profile);
  expect(current.profile).toEqual(before); expect(serializeDocument(document)).toBe(bytes);
  const result = solveOffsetApplication(current, plan);
  if (!result.accepted) throw new Error(result.message);
  return { document: updateFeature(document, sketchId, { profile: result.solution.profile }), plan, solution: result.solution };
}
function extrude(document: Document) {
  return addFeature(document, { id: solidId, name: 'Offset · 4 mm', type: 'extrude', sketchId, depth: 4, symmetric: false, suppressed: false });
}
function edit(document: Document, id: string, value: number) {
  const target = structuredClone(profile(document)), dimension = target.constraints.find(constraint => constraint.id === id);
  if (!dimension || !('value' in dimension) || dimension.driven) throw new Error('Driving dimension expected');
  dimension.value = value;
  return updateFeature(document, sketchId, { profile: solve(target).profile });
}
function relation(document: Document): SketchOffsetRelation {
  const found = profile(document).constraints.find(constraint => constraint.type === 'offset');
  if (!found || found.type !== 'offset') throw new Error('Offset relation expected');
  return found;
}
function distanceDimension(document: Document, side: 'right' | 'left' = 'right') {
  const found = profile(document).constraints.find(constraint => constraint.type === 'offsetDistance' && constraint.side === side);
  if (!found || found.type !== 'offsetDistance') throw new Error('Offset dimension expected');
  return found;
}
function expectPoint(target: EntityProfile, id: string, x: number, y: number) {
  const point = id === 'origin' ? { x: 0, y: 0 } : target.points.find(point => point.id === id);
  expect(point).toBeDefined(); expect(Math.abs(point!.x-x)).toBeLessThan(coordinateTolerance); expect(Math.abs(point!.y-y)).toBeLessThan(coordinateTolerance);
}
function expectImageVertices(document: Document, side: 'right' | 'left', coordinates: readonly (readonly number[])[]) {
  const target = profile(document), group = relation(document), image = group.images.find(image => image.side === side)!;
  expect(image.entityIds).toHaveLength(coordinates.length);
  image.entityIds.forEach((id,index) => {
    const entity = target.entities.find(entity => entity.id === id)!;
    if (entity.type === 'circle') throw new Error('Chain entity expected');
    expectPoint(target, group.sources[index].reversed ? entity.end : entity.start, coordinates[index][0], coordinates[index][1]);
  });
}
function measure(shape: Shape3D): Metrics {
  const [own, cleanup] = localGC();
  try {
    const oc = getOC(), analyzer = own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
    const mass = own(new oc.GProp_GProps()), surface = own(measureShapeSurfaceProperties(shape)), box = own(shape.boundingBox), solids = shape.solids;
    solids.forEach(own); expect(solids).toHaveLength(1); expect(analyzer.IsValid()).toBe(true);
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
    return { volume: mass.Mass(), area: surface.area, bounds: box.bounds };
  } finally { cleanup(); }
}
function expectMetrics(actual: Metrics, expected: Metrics) {
  expect(Math.abs(actual.volume - expected.volume)).toBeLessThan(tolerance); expect(Math.abs(actual.area - expected.area)).toBeLessThan(tolerance);
  actual.bounds.forEach((side, i) => side.forEach((value, j) => expect(Math.abs(value - expected.bounds[i][j])).toBeLessThan(tolerance)));
}
async function expectRebuilt(document: Document, expected: Metrics) {
  const before = structuredClone(document), first = engine.build(document.features);
  expect(document).toEqual(before); expect(first.featureErrors).toEqual([]); expect(first.warnings).toEqual([]);
  expect(Math.abs(first.volume - expected.volume)).toBeLessThan(tolerance);
  const reopened = parseDocument(serializeDocument(document)); expect(reopened.features).toEqual(document.features);
  const restored = engine.build(reopened.features); expect(restored.featureErrors).toEqual([]); expect(restored.warnings).toEqual([]);
  expect(restored.faces?.map(face => face.ref)).toEqual(first.faces?.map(face => face.ref)); expect(restored.edges.map(edge => edge.ref)).toEqual(first.edges.map(edge => edge.ref));
  const step = importStepSolid(createStepSource(new Uint8Array(await engine.export('step', reopened.features).arrayBuffer())));
  try { expectMetrics(measure(step), expected); } finally { step.delete(); }
  return first;
}
function original(profile: EntityProfile, name: string) {
  return validateDocument({ ...createDocument(name), features: [{ id: sketchId, name, type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile }] });
}
function lineDocument() {
  return original({ kind: 'entities', points: [{ id: 'end', x: 10, y: 0 }], entities: [{ id: 'line', type: 'line', start: 'origin', end: 'end', construction: false }],
    constraints: [{ id: 'horizontal', type: 'horizontal', entityId: 'line' }, { id: 'source-length', type: 'length', entityId: 'line', value: 10 }] }, 'Original line L10');
}
function arcDocument() {
  return original({ kind: 'entities', points: [{ id: 'start', x: 2, y: 0 }, { id: 'end', x: -2, y: 0 }],
    entities: [{ id: 'arc', type: 'arc', center: 'origin', start: 'start', end: 'end', clockwise: false, construction: false }],
    constraints: [{ id: 'fixed-start', type: 'fix', pointId: 'start', x: 2, y: 0 }, { id: 'fixed-end', type: 'fix', pointId: 'end', x: -2, y: 0 }] }, 'Original semicircle R2');
}
function capsuleDocument() {
  const points = [{ id: 'bottom-left', x: 0, y: -2 }, { id: 'bottom-right', x: 6, y: -2 }, { id: 'top-right', x: 6, y: 2 }, { id: 'top-left', x: 0, y: 2 }, { id: 'right-center', x: 6, y: 0 }];
  return original({ kind: 'entities', points, entities: [
    { id: 'bottom', type: 'line', start: 'bottom-left', end: 'bottom-right', construction: false },
    { id: 'right', type: 'arc', center: 'right-center', start: 'bottom-right', end: 'top-right', clockwise: false, construction: false },
    { id: 'top', type: 'line', start: 'top-right', end: 'top-left', construction: false },
    { id: 'left', type: 'arc', center: 'origin', start: 'top-left', end: 'bottom-left', clockwise: false, construction: false },
  ], constraints: points.map(point => ({ id: `fixed-${point.id}`, type: 'fix', pointId: point.id, x: point.x, y: point.y })) }, 'Original capsule L6 R2');
}

it('builds the 10×6 rectangle outward ring at d1 with V144/A360', async () => {
  const result = apply(createSketchOffsetDocument()); expect(result.solution.status).toBe('fullyDefined');
  expectImageVertices(result.document, 'right', [[-1,-1],[11,-1],[11,7],[-1,7]]);
  await expectRebuilt(extrude(result.document), { volume: 144, area: 360, bounds: [[-1,-1,0],[11,7,4]] });
});
it.each([
  ['source', { volume: 384, area: 352, bounds: [[-1,-1,0],[11,7,4]] }],
  ['offset', { volume: 240, area: 248, bounds: [[0,0,0],[10,6,4]] }],
] as const)('construction=%s changes which solved contours produce material', async (construction, expected) => {
  await expectRebuilt(extrude(apply(createSketchOffsetDocument(), { construction }).document), expected as Metrics);
});
it('builds the concentric R3→R4 ring with V28π/A70π and exact circular BRep', async () => {
  const result = apply(createSketchOffsetDocument('circle')); expect(result.solution.status).toBe('fullyDefined');
  const image = profile(result.document).entities.find(entity => entity.id === result.plan.imageEntityIds[0])!;
  if (image.type !== 'circle') throw new Error('Circle expected');
  expectPoint(profile(result.document), image.center, 0, 0); expect(image.radius).toBeCloseTo(4,7);
  await expectRebuilt(extrude(result.document), { volume: 28*Math.PI, area: 70*Math.PI, bounds: [[-4,-4,0],[4,4,4]] });
  const shape = importStepSolid(createStepSource(new Uint8Array(await engine.export('step').arrayBuffer()))), faces = shape.faces;
  try { expect(faces.filter(face => face.geomType === 'CYLINDRE')).toHaveLength(2); } finally { faces.forEach(face => face.delete()); shape.delete(); }
});
it.each([
  [{}, { volume: 176, area: 440, bounds: [[-1,-1,0],[11,11,4]] }],
  [{ reverse: true }, { volume: 144, area: 360, bounds: [[0,0,0],[10,10,4]] }],
  [{ bothDirections: true, construction: 'source' }, { volume: 320, area: 480, bounds: [[-1,-1,0],[11,11,4]] }],
] as const)('builds a concave L with analytical miter geometry %o', async (options, expected) => {
  const result = apply(createSketchOffsetDocument('concave'), options); expect(result.solution.status).toBe('fullyDefined');
  for (const image of relation(result.document).images) expectImageVertices(result.document, image.side, image.side === 'right'
    ? [[-1,-1],[11,-1],[11,5],[5,5],[5,11],[-1,11]] : [[1,1],[9,1],[9,3],[3,3],[3,9],[1,9]]);
  await expectRebuilt(extrude(result.document), expected as Metrics);
});
it('offsets a mixed line/arc capsule L6 R2→R3 into one analytical ring', async () => {
  const result = apply(capsuleDocument());
  expectImageVertices(result.document, 'right', [[0,-3],[6,-3],[6,3],[0,3]]);
  await expectRebuilt(extrude(result.document), { volume: 48+20*Math.PI, area: 120+50*Math.PI, bounds: [[-3,-3,0],[9,3,4]] });
});
it('edits independent right/left distances of a line-capped L10 strip to 2/3 mm', async () => {
  const result = apply(lineDocument(), { distance: 2, bothDirections: true, cap: 'line', construction: 'source' });
  expect(result.solution.status).toBe('fullyDefined'); expect(distanceDimension(result.document, 'left').driven).not.toBe(true);
  const changed = edit(parseDocument(serializeDocument(result.document)), distanceDimension(result.document, 'left').id, 3);
  await expectRebuilt(extrude(changed), { volume: 200, area: 220, bounds: [[0,-2,0],[10,3,4]] });
});
it('keeps symmetric arc caps and refreshes the second driven distance after changing the first', async () => {
  const result = apply(lineDocument(), { distance: 2, bothDirections: true, cap: 'arc', construction: 'source' });
  const driven = distanceDimension(result.document, 'left'); expect(driven.driven).toBe(true); expect(result.solution.drivenValues[driven.id]).toBeCloseTo(2,7);
  await expectRebuilt(extrude(result.document), { volume: 160+16*Math.PI, area: 160+24*Math.PI, bounds: [[-2,-2,0],[12,2,4]] });
  const changed = edit(parseDocument(serializeDocument(result.document)), distanceDimension(result.document).id, 3), solution = solve(profile(changed));
  expect(solution.drivenValues[driven.id]).toBeCloseTo(3,7); expect(distanceDimension(changed, 'left')).toMatchObject({ value: 2, driven: true });
  await expectRebuilt(extrude(changed), { volume: 240+36*Math.PI, area: 200+42*Math.PI, bounds: [[-3,-3,0],[13,3,4]] });
});
it('restores an offset-owned arc cap direction from a stale persisted flag', async () => {
  const result = apply(lineDocument(), { distance: 2, bothDirections: true, cap: 'arc', construction: 'source' });
  const target = structuredClone(profile(result.document)), capId = relation(result.document).capEntityIds[0];
  const cap = target.entities.find(entity => entity.id === capId);
  if (cap?.type !== 'arc') throw new Error('Arc cap expected');
  const outwardClockwise = cap.clockwise; cap.clockwise = !outwardClockwise;
  const persisted = parseDocument(serializeDocument(updateFeature(result.document, sketchId, { profile: target })));
  const stale = profile(persisted).entities.find(entity => entity.id === capId);
  expect(stale).toMatchObject({ type: 'arc', clockwise: !outwardClockwise });
  const solution = solve(profile(persisted)); expect(solution.status).toBe('fullyDefined');
  expect(solution.profile.entities.find(entity => entity.id === capId)).toMatchObject({ type: 'arc', clockwise: outwardClockwise });
  // Two exterior R2 semicircles plus a 10×4 strip, extruded by 4 mm.
  await expectRebuilt(extrude(persisted), { volume: 160+16*Math.PI, area: 160+24*Math.PI, bounds: [[-2,-2,0],[12,2,4]] });
});
it('rejects a persisted capped-arc endpoint on the antipodal source ray and blocks export', async () => {
  const quarter = original({ kind: 'entities', points: [{ id: 'start', x: 2, y: 0 }, { id: 'end', x: 0, y: 2 }],
    entities: [{ id: 'arc', type: 'arc', center: 'origin', start: 'start', end: 'end', clockwise: false, construction: false }],
    constraints: [{ id: 'fixed-start', type: 'fix', pointId: 'start', x: 2, y: 0 }, { id: 'fixed-end', type: 'fix', pointId: 'end', x: 0, y: 2 }] }, 'Original quarter circle R2');
  const result = apply(quarter, { cap: 'line' }), valid = extrude(result.document), bytes = serializeDocument(valid);
  // Quarter annulus R2..R3: S=5π/4, perimeter=5π/2+2; h=4.
  await expectRebuilt(valid, { volume: 5*Math.PI, area: 8+12.5*Math.PI, bounds: [[0,0,0],[3,3,4]] });
  const target = structuredClone(profile(result.document)), imageId = relation(result.document).images[0].entityIds[0];
  const image = target.entities.find(entity => entity.id === imageId);
  if (image?.type !== 'arc') throw new Error('Offset arc expected');
  const endpoint = target.points.find(point => point.id === image.start)!; endpoint.x = -3; endpoint.y = 0;
  const changed = parseDocument(serializeDocument(updateFeature(valid, sketchId, { profile: target }))), before = structuredClone(changed);
  const solution = solveSketch(profile(changed)); expect(['fullyDefined', 'underdefined']).not.toContain(solution.status);
  const rejected = engine.build(changed.features);
  expect(changed).toEqual(before); expect(rejected.featureErrors).toHaveLength(1); expect(rejected.volume).toBe(0); expect(()=>engine.export('step')).toThrow(/errores/);
  expect(serializeDocument(valid)).toBe(bytes);
});
it('omits continuous offset seeds from lineage but preserves discrete side/joins/cap ownership', () => {
  const result = apply(createSketchOffsetDocument()), first = entityProfileStructure(profile(result.document));
  const changed = structuredClone(profile(result.document)), group = changed.constraints.find(constraint => constraint.type === 'offset')! as SketchOffsetRelation;
  group.images[0].distance = 2;
  expect(entityProfileStructure(changed)).toEqual(first);
  group.images[0].side = 'left'; expect(entityProfileStructure(changed)).not.toEqual(first);
  group.images[0].side = 'right'; group.images[0].joins[0].branch = 1; expect(entityProfileStructure(changed)).not.toEqual(first);
  group.images[0].joins[0].branch = 0; group.capEntityIds.push('different-cap'); expect(entityProfileStructure(changed)).not.toEqual(first);
});
it('retains the selected outer corner fillet after source-width and offset-distance edits on reopening', async () => {
  const result = apply(createSketchOffsetDocument(), { construction: 'source' }), base = extrude(result.document), first = await expectRebuilt(base, { volume: 384, area: 352, bounds: [[-1,-1,0],[11,7,4]] });
  const corner = first.edges.filter(edge => edge.lines.every((value,index) => index%3 === 0 ? Math.abs(value-11)<coordinateTolerance : index%3 === 1 ? Math.abs(value-7)<coordinateTolerance : true));
  expect(corner).toHaveLength(1);
  const finished = addFeature(base, { id: 'offset-fillet', name: 'R1 corner', type: 'fillet', baseFeatureId: solidId, size: 1, selection: { mode: 'selected', edges: [corner[0].ref] }, suppressed: false });
  const distanceId = distanceDimension(result.document).id;
  for (const [width, distance, volume, area, maxX, maxY] of [[10,1,384,352,11,7], [10,2,560,472,12,8], [12,2,640,528,14,8]]) {
    let changed = edit(parseDocument(serializeDocument(finished)), distanceId, distance);
    changed = edit(changed, 'source-width', width);
    const bare = engine.build(changed.features.filter(feature => feature.id !== 'offset-fillet')); expect(bare.featureErrors).toEqual([]);
    expect(bare.faces?.map(face=>face.ref)).toEqual(first.faces?.map(face=>face.ref)); expect(bare.edges.map(edge=>edge.ref)).toEqual(first.edges.map(edge=>edge.ref));
    // One R1 square-minus-quarter-disk prism is removed from the outer corner.
    await expectRebuilt(changed, { volume: volume-4+Math.PI, area: area-10+2.5*Math.PI, bounds: [[-distance,-distance,0],[maxX,maxY,4]] });
  }
});
it('edits source radius and offset distance after reopening a circular ring', async () => {
  const result = apply(createSketchOffsetDocument('circle')), distanceId = distanceDimension(result.document).id;
  const changed = edit(edit(parseDocument(serializeDocument(result.document)), 'source-radius', 5), distanceId, 2);
  // Annulus R5..R7: S=24π, combined perimeter=24π; h=4.
  await expectRebuilt(extrude(changed), { volume: 96*Math.PI, area: 144*Math.PI, bounds: [[-7,-7,0],[7,7,4]] });
});
it('records a whole associative offset as one detached history step', () => {
  const source = createSketchOffsetDocument(), history = new DocumentHistory(source), result = apply(history.current);
  expect(history.canUndo).toBe(false); history.apply(result.document); expect(history.undo()).toEqual(source); expect(history.redo()).toEqual(result.document);
});
it.each([lineDocument, arcDocument])('aligns dimensioned open line endpoints, leaves arc ends free and refuses extrusion', factory => {
  const source = factory(), result = apply(source, { construction: 'source' });
  expect(result.solution.status).toBe(factory === lineDocument ? 'fullyDefined' : 'underdefined'); expect(result.solution.degreesOfFreedom).toBe(factory === lineDocument ? 0 : 2);
  const solid = engine.build(extrude(result.document).features); expect(solid.featureErrors[0].message).toMatch(/abierto|cerrad/); expect(solid.volume).toBe(0); expect(()=>engine.export('step')).toThrow(/errores/);
});
it('rejects inward collapse atomically and does not replace the original solved document', () => {
  const document = createSketchOffsetDocument(), bytes = serializeDocument(document), current = solve(profile(document)), before = structuredClone(current.profile);
  const plan = planSketchOffset(current.profile, [{kind:'entity',id:'edge-0'}], { ...defaults, distance: 3, reverse: true });
  expect(plan.changed).toBe(false); expect(plan.profile).toBe(current.profile); expect(current.profile).toEqual(before); expect(serializeDocument(document)).toBe(bytes);
});
it.each(['source-height', 'offset-distance'])('rejects persisted inward collapse after editing %s and rebuilds the valid snapshot again', async id => {
  const result = apply(createSketchOffsetDocument(), { reverse: true }), valid = extrude(result.document), bytes = serializeDocument(valid);
  await expectRebuilt(valid, { volume: 112, area: 280, bounds: [[0,0,0],[10,6,4]] });
  const target = structuredClone(profile(valid)), dimension = target.constraints.find(constraint => constraint.id === (id === 'source-height' ? id : distanceDimension(valid,'left').id))!;
  if (!('value' in dimension)) throw new Error('Dimension expected'); dimension.value = id === 'source-height' ? 2 : 3;
  const changed = updateFeature(valid, sketchId, { profile: target }), before = structuredClone(changed), rejected = engine.build(changed.features);
  expect(changed).toEqual(before); expect(rejected.featureErrors).toHaveLength(1); expect(rejected.volume).toBe(0); expect(()=>engine.export('step')).toThrow(/errores/);
  expect(serializeDocument(valid)).toBe(bytes);
  await expectRebuilt(parseDocument(bytes), { volume: 112, area: 280, bounds: [[0,0,0],[10,6,4]] });
});
