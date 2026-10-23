import { requireBinaryAssemblyMate as binaryMate } from './assemblyBinaryFixtures.test-utils'
import { expect, it } from 'vitest';
import type { SketchFeature, Vec3 } from '../cad/kernel.types';
import { parseDocument, serializeDocument, type Document } from './document';
import { identityRigidPose, transformRigidPoint, type RigidPose } from './rigidPose';
import type { AssemblyDirectionMateType } from './assemblyDirectionMates';
import type { AssemblyCylinderTangentBranch, AssemblyCylinderTangentMateType } from './assemblyCylinderTangentMates';
import { ASSEMBLY_DOCUMENT_VERSION, MAX_ASSEMBLY_BYTES, MAX_ASSEMBLY_DEFINITIONS,
  MAX_ASSEMBLY_DEPTH, MAX_ASSEMBLY_MATES, MAX_ASSEMBLY_OCCURRENCES, MAX_ASSEMBLY_PART_FEATURES,
  assemblyDefinitionKey, assemblyOccurrencePathKey, createAssemblyDocument, expandAssemblyParts,
  parseAssemblyDocument, parseCadDocument, serializeAssemblyDocument, serializeCadDocument,
  validateAssemblyDocument, validateCadDocument, validateAssemblyGeometryReference, validateAssemblyCylinderSurfaceReference, validateAssemblyTangentReference,
  validateAssemblySphereSurfaceReference, validateAssemblySphereTangentReference,
  type AssemblyCylinderSurfaceReference, type AssemblyCylinderTangentMate, type AssemblyTangentReference, type AssemblyAxisReference, type AssemblyDefinition,
  type AssemblyDefinitionReference, type AssemblyDocument, type AssemblyMate, type AssemblyOccurrence,
  type AssemblyGeometryReference, type AssemblyPrincipalPlaneReference, type EmbeddedAssemblyDefinition, type EmbeddedPartDefinition } from './assemblyDocument';
import type { AssemblySphereSurfaceReference, AssemblySphereTangentMate } from './assemblyDocument';
import type { AssemblySphereTangentMateType } from './assemblySphereTangentMates';

// Original declaration-only documents and Cartesian poses. They supply no
// native entity authority, BRep/volume evidence, mate solve or fixed-world proof.
const stamp = '2026-10-15T00:00:00.000Z';
const pin = { id: 'original-part', revision: 'pin-r1' };
function sketch(id = 'profile', width = 6): SketchFeature {
  return { id, name: 'Original rectangular profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
    profile: { kind: 'rectangle', center: [0, 0], width, height: 4 } };
}
function part(id = pin.id, revision = pin.revision, width = 6): EmbeddedPartDefinition {
  const document: Document = { version: 1, id, name: 'Original embedded part', units: 'mm', createdAt: stamp, updatedAt: stamp,
    features: [sketch('profile', width), { id: 'solid', name: 'Original finite extrusion', type: 'extrude', suppressed: false,
      sketchId: 'profile', depth: 3, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'original-body' } }] };
  return { kind: 'part', id, revision, document };
}
function occurrence(id: string, definition: AssemblyDefinitionReference = pin, pose: RigidPose = identityRigidPose()): AssemblyOccurrence {
  return { id, name: 'Original occurrence ' + id, definition: { id: definition.id, revision: definition.revision },
    pose, fixed: false, suppressed: false, visible: true };
}
function node(id: string, revision = 'sub-r1', occurrences: AssemblyOccurrence[] = [], mates: AssemblyMate[] = []): EmbeddedAssemblyDefinition {
  return { kind: 'assembly', id, revision, name: 'Original nested assembly', occurrences, mates, createdAt: stamp, updatedAt: stamp };
}
function assembly(definitions: AssemblyDefinition[] = [part()], occurrences = [occurrence('left'), occurrence('right')]): AssemblyDocument {
  return { ...node('original-assembly', 'root-r1', occurrences), version: 2, units: 'mm', definitions };
}
function component(path = ['left']) {
  return { occurrencePath: [...path], definition: { ...pin } };
}
function axis(path = ['left']): AssemblyAxisReference {
  return { kind: 'face', component: component(path), body: { bodyId: 'original-body', sourceFeatureId: 'solid' },
    face: { sourceFeatureId: 'solid', key: 'face-v1|original-declaration-axis' }, support: 'axis' };
}
function plane(path: string[] | null = null): AssemblyPrincipalPlaneReference {
  return { kind: 'principal-plane', component: path === null ? null : component(path), plane: 'XY' };
}
function coincidence(id = 'original-plane'): Extract<AssemblyMate, { type: 'coincident' }> {
  return { id, name: 'Original plane intent', suppressed: false, type: 'coincident', first: plane(), second: plane(['left']), alignment: 'aligned' };
}
function mates(): AssemblyMate[] {
  return [
    { id: 'axis', name: 'Original concentric intent', suppressed: false, type: 'concentric', first: axis(), second: axis(['right']),
      alignment: 'opposed', rotationLock: [0, 0, Math.SQRT1_2, Math.SQRT1_2] },
    coincidence(),
    { id: 'distance', name: 'Original signed distance intent', suppressed: true, type: 'distance', first: plane(), second: plane(['right']), alignment: 'aligned', distance: -2.5 },
    { id: 'angle', name: 'Original degree angle intent', suppressed: false, type: 'angle', first: axis(), second: plane(), angle: 37 },
    { id: 'lock', name: 'Original relative-pose declaration', suppressed: false, type: 'lock', first: component(), second: component(['right']),
      relativePose: { translation: [3, 4, 5], rotation: [0, 0, 0, 1] } },
  ];
}
function nested() {
  const child = occurrence('pin', pin, { translation: [1, 2, 3], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] });
  child.fixed = true;
  const sub = node('original-subassembly', 'sub-r1', [child]);
  const left = occurrence('left', sub, { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] });
  const right = occurrence('right', sub, { translation: [-10, 0, 0], rotation: [0, 0, 0, 1] });
  return assembly([part(), sub], [left, right]);
}
function close(actual: Vec3, expected: Vec3): void {
  actual.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThan(1e-12));
}

it('creates a fresh version-2 assembly without relabeling a part or inventing geometry', () => {
  const a = createAssemblyDocument('Original empty assembly'), b = createAssemblyDocument('Original empty assembly');
  expect(a).toMatchObject({ version: ASSEMBLY_DOCUMENT_VERSION, kind: 'assembly', units: 'mm', definitions: [], occurrences: [], mates: [] });
  expect(a.id).not.toBe(b.id); expect(a.revision).not.toBe(b.revision);
  expect(Object.hasOwn(a, 'features')).toBe(false);
  expect(expandAssemblyParts(a)).toEqual([]);
});

it('reuses one definition with two distinct occurrence identities and placements', () => {
  const input = assembly(); input.occurrences[0].pose.translation = [-10, 0, -8]; input.occurrences[1].pose.translation = [10, 0, -8];
  const before = JSON.stringify(input), expanded = expandAssemblyParts(input);
  expect(input.definitions).toHaveLength(1); expect(expanded.map(item => item.path)).toEqual([['left'], ['right']]);
  expect(expanded[0].definition).toBe(expanded[1].definition);
  expect(expanded[0].occurrence).not.toBe(expanded[1].occurrence);
  close(expanded[0].worldPose.translation, [-10, 0, -8]); close(expanded[1].worldPose.translation, [10, 0, -8]);
  expanded[0].worldPose.translation[0] = 99;
  expect(JSON.stringify(input)).toBe(before); close(expanded[1].worldPose.translation, [10, 0, -8]);
});

it('keys exact definition revisions and full paths without delimiter or occurrence aliasing', () => {
  expect(assemblyDefinitionKey({ id: 'a|b', revision: 'c' })).not.toBe(assemblyDefinitionKey({ id: 'a', revision: 'b|c' }));
  expect(assemblyDefinitionKey({ id: 'same', revision: 'r1' })).not.toBe(assemblyDefinitionKey({ id: 'same', revision: 'r2' }));
  expect(assemblyOccurrencePathKey(['left/right', 'pin'])).not.toBe(assemblyOccurrencePathKey(['left', 'right/pin']));
  const expanded = expandAssemblyParts(nested());
  expect(expanded.map(item => item.path)).toEqual([['left', 'pin'], ['right', 'pin']]);
  expect(assemblyOccurrencePathKey(expanded[0].path)).not.toBe(assemblyOccurrencePathKey(expanded[1].path));
});

it('composes parent and local placement once and keeps fixed relative to its containing assembly', () => {
  const input = nested(), first = expandAssemblyParts(input)[0];
  close(first.worldPose.translation, [8, 21, 33]);
  close(transformRigidPoint(first.worldPose, [4, 5, 6]), [14, 25, 38]);
  expect(first.chain.map(item => item.fixed)).toEqual([false, true]);
  expect(first.occurrence.fixed).toBe(true);
  input.occurrences[0].pose.translation[0] = 15;
  const moved = expandAssemblyParts(input)[0];
  close(transformRigidPoint(moved.worldPose, [4, 5, 6]), [19, 25, 38]);
  expect(moved.chain.map(item => item.fixed)).toEqual([false, true]);
});

it('inherits visibility and suppression without turning hidden parts into suppressed parts', () => {
  const input = nested(), sub = input.definitions.find(item => item.kind === 'assembly');
  if (sub?.kind !== 'assembly') throw new Error('Original nested fixture missing.');
  input.occurrences[0].visible = false;
  input.occurrences[1].suppressed = true;
  const normal = expandAssemblyParts(input), complete = expandAssemblyParts(input, true);
  expect(normal.map(item => [item.path, item.visible, item.suppressed])).toEqual([[['left', 'pin'], false, false]]);
  expect(complete.map(item => [item.path, item.visible, item.suppressed])).toEqual([
    [['left', 'pin'], false, false], [['right', 'pin'], true, true],
  ]);
  sub.occurrences[0].suppressed = true;
  expect(expandAssemblyParts(input)).toEqual([]);
  expect(expandAssemblyParts(input, true).every(item => item.suppressed)).toBe(true);
  sub.occurrences[0].suppressed = false; sub.occurrences[0].visible = false;
  expect(expandAssemblyParts(input, true).every(item => !item.visible)).toBe(true);
});

it('pins nested occurrences to exact embedded revisions instead of selecting the newest identity', () => {
  const old = part(), updated = part(pin.id, 'pin-r2', 8), a = node('sub', 'r1', [occurrence('pin', old)]), b = node('sub', 'r2', [occurrence('pin', updated)]);
  const parsed = parseAssemblyDocument(serializeAssemblyDocument(assembly([updated, b, old, a], [occurrence('left', a), occurrence('right', b)])));
  const expanded = expandAssemblyParts(parsed);
  expect(expanded.map(item => item.definition.revision)).toEqual(['pin-r1', 'pin-r2']);
  expect(expanded.map(item => (item.definition.document.features[0] as SketchFeature).profile)).toEqual([
    { kind: 'rectangle', center: [0, 0], width: 6, height: 4 }, { kind: 'rectangle', center: [0, 0], width: 8, height: 4 },
  ]);
  expect(expanded.map(item => item.chain[0].definition)).toEqual([{ id: 'sub', revision: 'r1' }, { id: 'sub', revision: 'r2' }]);
});

it('round trips every declared mate family and returns detached assembly, part and pose data', () => {
  const input = assembly(); input.mates = mates(); const original = JSON.stringify(input);
  const validated = validateAssemblyDocument(input), json = serializeAssemblyDocument(validated), reopened = parseCadDocument(json);
  expect(reopened).toEqual(validated); expect(serializeCadDocument(reopened)).toBe(json);
  if (reopened.version !== 2 || reopened.definitions[0].kind !== 'part') throw new Error('Original embedded part missing.');
  reopened.occurrences[0].pose.translation[0] = 900;
  const first = reopened.definitions[0].document.features[0];
  if (first.type !== 'sketch' || first.profile.kind !== 'rectangle') throw new Error('Original rectangle missing.');
  first.profile.width = 99; reopened.mates[0].name = 'Edited declaration';
  expect(JSON.stringify(input)).toBe(original); expect(serializeAssemblyDocument(validated)).toBe(json);
});

it('retains stale mate endpoints as repairable declarations without granting native or solver authority', () => {
  const input = assembly(), stale = axis(['removed-subassembly', 'removed-pin']);
  stale.component.definition = { id: 'missing-definition', revision: 'old-r9' };
  stale.body = null; stale.face = { sourceFeatureId: 'removed-solid', key: 'face-v1|original-stale-intent' };
  input.mates = [{ id: 'stale', name: 'Original stale declaration', suppressed: false, type: 'concentric', first: stale,
    second: axis(['right']), alignment: 'aligned', rotationLock: null }];
  const reopened = parseAssemblyDocument(serializeAssemblyDocument(input));
  expect(reopened.mates).toEqual(input.mates);
  expect(expandAssemblyParts(reopened).map(item => item.path)).toEqual([['left'], ['right']]);
});

it('preserves version-1 part serialization, feature IDs and body references through the union API', () => {
  const document = part().document, bytes = serializeDocument(document), old = parseDocument(bytes);
  expect(serializeCadDocument(document)).toBe(bytes);
  expect(parseCadDocument(bytes)).toEqual(old); expect(validateCadDocument(document)).toEqual(old);
  expect(Object.hasOwn(parseCadDocument(bytes), 'kind')).toBe(false);
  expect(old.features.map(item => item.id)).toEqual(['profile', 'solid']);
  expect(old.features[1]).toMatchObject({ bodyOperation: { mode: 'new', bodyId: 'original-body' } });
});

it('keeps version-1 and version-2 schemas separate without a silent kind or version migration', () => {
  expect(() => parseAssemblyDocument(serializeDocument(part().document))).toThrow();
  expect(() => parseDocument(serializeAssemblyDocument(assembly()))).toThrow();
  expect(() => validateCadDocument({ ...part().document, kind: 'part' })).toThrow('campo desconocido');
  expect(() => validateCadDocument({ ...assembly(), version: 1 })).toThrow();
});

it('rejects a union-dispatch version getter without invoking it', () => {
  let reads = 0;
  const value = Object.defineProperty({}, 'version', { enumerable: true, get() { reads++; return 2; } });
  expect(() => validateCadDocument(value)).toThrow(); expect(reads).toBe(0);
});

it('orders extended ISO years by their timestamps rather than lexicographic spelling', () => {
  const input = assembly(); input.createdAt = '9999-12-31T23:59:59.000Z'; input.updatedAt = '+010000-01-01T00:00:00.000Z';
  expect(validateAssemblyDocument(input).updatedAt).toBe(input.updatedAt);
});
it('rejects an actual reverse timestamp across the extended-year boundary', () => {
  const input = assembly(); input.createdAt = '+010000-01-01T00:00:00.000Z'; input.updatedAt = '9999-12-31T23:59:59.000Z';
  expect(() => validateAssemblyDocument(input)).toThrow('anterior');
});

it.each(['self', 'two definitions', 'suppressed dormant'] as const)('rejects a %s definition cycle', kind => {
  const input = assembly([], []);
  if (kind === 'self') input.occurrences = [occurrence('self', input)];
  else {
    const a = node('cycle-a'), b = node('cycle-b');
    a.occurrences = [occurrence('b', b)]; b.occurrences = [occurrence('a', a)];
    if (kind === 'suppressed dormant') { a.occurrences[0].suppressed = true; b.occurrences[0].suppressed = true; }
    input.definitions = [a, b];
  }
  expect(() => validateAssemblyDocument(input)).toThrow('ciclo');
});

it.each(['occurrence', 'revision', 'dormant nested'] as const)('rejects a missing %s definition reference', kind => {
  const input = assembly();
  if (kind === 'dormant nested') input.definitions.push(node('dormant', 'r1', [occurrence('missing', { id: 'missing', revision: 'r1' })]));
  else input.occurrences[0].definition = { id: kind === 'revision' ? pin.id : 'missing', revision: 'missing-r9' };
  expect(() => validateAssemblyDocument(input)).toThrow('no encontrada');
});

it.each(['occurrence', 'mate', 'definition revision', 'root revision'] as const)('rejects duplicate %s IDs in their declared scope', kind => {
  const input = assembly();
  if (kind === 'occurrence') input.occurrences[1].id = input.occurrences[0].id;
  else if (kind === 'mate') input.mates = [coincidence(), coincidence()];
  else if (kind === 'definition revision') input.definitions.push(part());
  else input.definitions.push(node(input.id, input.revision));
  expect(() => validateAssemblyDocument(input)).toThrow(/duplicad/);
});

it('rejects one identity being both a part and assembly even at different revisions', () => {
  const input = assembly(); input.definitions.push(node(pin.id, 'different-r2'));
  expect(() => validateAssemblyDocument(input)).toThrow('pieza y ensamblaje');
});
it('rejects a definition ID that disagrees with its embedded part identity', () => {
  const input = assembly(); input.definitions[0].id = 'different-part';
  expect(() => validateAssemblyDocument(input)).toThrow('identidad');
});

const unknownFields: { name: string; value: (v: AssemblyDocument) => unknown }[] = [
  { name: 'root', value: v => ({ ...v, configurations: [] }) },
  { name: 'embedded definition', value: v => ({ ...v, definitions: [{ ...v.definitions[0], sourcePath: 'ungranted.part' }] }) },
  { name: 'nested assembly table', value: v => ({ ...v, definitions: [...v.definitions, { ...node('nested'), definitions: [] }] }) },
  { name: 'occurrence mesh authority', value: v => ({ ...v, occurrences: [{ ...v.occurrences[0], mesh: [] }] }) },
  { name: 'reference latest fallback', value: v => ({ ...v, occurrences: [{ ...v.occurrences[0], definition: { ...pin, latest: true } }] }) },
  { name: 'pose scale', value: v => ({ ...v, occurrences: [{ ...v.occurrences[0], pose: { ...identityRigidPose(), scale: 1 } }] }) },
  { name: 'mate priority', value: v => ({ ...v, mates: [{ ...coincidence(), priority: 1 }] }) },
  { name: 'mate geometry normal', value: v => ({ ...v, mates: [{ ...coincidence(), first: { ...plane(), normal: [0, 0, 1] } }] }) },
];
it.each(unknownFields)('rejects an unknown $name field', ({ value }) => {
  expect(() => validateAssemblyDocument(value(assembly()))).toThrow();
});

const invalidMates: { name: string; value: () => unknown }[] = [
  { name: 'undeclared family', value: () => ({ id: 'bad', name: 'Original unsupported intent', suppressed: false, type: 'gear', first: component(), second: component(['right']) }) },
  { name: 'plane as concentric axis', value: () => ({ id: 'bad', name: 'Original invalid axis intent', suppressed: false, type: 'concentric', first: plane(), second: axis(), alignment: 'aligned', rotationLock: null }) },
  { name: 'axis as coincident plane', value: () => ({ ...coincidence(), first: axis() }) },
  { name: 'unknown alignment', value: () => ({ ...coincidence(), alignment: 'automatic' }) },
  { name: 'non-finite distance', value: () => ({ ...coincidence(), type: 'distance', distance: Infinity }) },
  { name: 'negative degree angle', value: () => ({ id: 'bad', name: 'Original invalid angle intent', suppressed: false, type: 'angle', first: plane(), second: plane(), angle: -1 }) },
  { name: 'angle above 180 degrees', value: () => ({ id: 'bad', name: 'Original invalid angle intent', suppressed: false, type: 'angle', first: plane(), second: plane(), angle: 181 }) },
  { name: 'scaled rotation lock', value: () => ({ id: 'bad', name: 'Original invalid lock intent', suppressed: false, type: 'concentric', first: axis(), second: axis(['right']), alignment: 'aligned', rotationLock: [0, 0, 0, 2] }) },
  { name: 'empty endpoint path', value: () => ({ ...coincidence(), second: plane([]) }) },
  { name: 'scaled relative pose', value: () => ({ id: 'bad', name: 'Original invalid relative pose', suppressed: false, type: 'lock', first: component(), second: component(['right']), relativePose: { translation: [0, 0, 0], rotation: [0, 0, 0, 2] } }) },
];
it.each(invalidMates)('rejects $name mate syntax before any solver is involved', ({ value }) => {
  expect(() => validateAssemblyDocument({ ...assembly(), mates: [value()] })).toThrow();
});

it.each([{ rotation: [0, 0, 0, 0] }, { rotation: [0, 0, 0, 2] }, { rotation: [0, 0, NaN, 1] }])('rejects an invalid occurrence quaternion $rotation', ({ rotation }) => {
  const input = assembly();
  expect(() => validateAssemblyDocument({ ...input, occurrences: [{ ...input.occurrences[0], pose: { translation: [0, 0, 0], rotation } }] })).toThrow();
});

it.each(['definitions', 'occurrences', 'mates'] as const)('bounds the declared %s list', kind => {
  const input = assembly();
  if (kind === 'definitions') input.definitions = Array.from({ length: MAX_ASSEMBLY_DEFINITIONS + 1 }, (_, i) => part('part-' + i));
  else if (kind === 'occurrences') input.occurrences = Array.from({ length: MAX_ASSEMBLY_OCCURRENCES + 1 }, (_, i) => occurrence('pin-' + i));
  else input.mates = Array.from({ length: MAX_ASSEMBLY_MATES + 1 }, (_, i) => coincidence('mate-' + i));
  expect(() => validateAssemblyDocument(input)).toThrow('longitud');
});
it('admits the explicit occurrence limit without silently clipping instances', () => {
  const input = assembly(); input.occurrences = Array.from({ length: MAX_ASSEMBLY_OCCURRENCES }, (_, i) => occurrence('pin-' + i));
  expect(validateAssemblyDocument(input).occurrences).toHaveLength(MAX_ASSEMBLY_OCCURRENCES);
});

function hierarchy(levels: number): AssemblyDocument {
  const leaf = part(), definitions: AssemblyDefinition[] = [leaf]; let ref: AssemblyDefinitionReference = leaf;
  for (let i = 0; i < levels; i++) { const current = node('level-' + i, 'r1', [occurrence('child', ref)]); definitions.push(current); ref = current; }
  return assembly(definitions, [occurrence('root', ref)]);
}
it('admits a hierarchy at its declared depth boundary', () => {
  const expanded = expandAssemblyParts(hierarchy(MAX_ASSEMBLY_DEPTH - 1));
  expect(expanded).toHaveLength(1); expect(expanded[0].path).toHaveLength(MAX_ASSEMBLY_DEPTH);
});
it('rejects one more hierarchy edge before expansion', () => {
  expect(() => validateAssemblyDocument(hierarchy(MAX_ASSEMBLY_DEPTH))).toThrow(/jerarquía/);
});
it.each([false, true])('bounds an exponentially reused occurrence graph, suppressed=%s', suppressed => {
  const leaf = part(), definitions: AssemblyDefinition[] = [leaf]; let ref: AssemblyDefinitionReference = leaf;
  for (let i = 0; i < 12; i++) { const current = node('binary-' + i, 'r1', [occurrence('L', ref), occurrence('R', ref)]); definitions.push(current); ref = current; }
  const root = occurrence('root', ref); root.suppressed = suppressed;
  expect(() => validateAssemblyDocument(assembly(definitions, [root]))).toThrow('presupuesto');
});
it.each(['occurrences', 'mates'] as const)('counts stored %s across dormant definitions and the root', kind => {
  const half = kind === 'occurrences' ? MAX_ASSEMBLY_OCCURRENCES / 2 : MAX_ASSEMBLY_MATES / 2;
  const a = node('dormant-a'), b = node('dormant-b'), input = assembly([part(), a, b], []);
  if (kind === 'occurrences') {
    a.occurrences = Array.from({ length: half }, (_, i) => occurrence('pin-' + i));
    b.occurrences = Array.from({ length: half }, (_, i) => occurrence('pin-' + i)); input.occurrences = [occurrence('one-more')];
  } else {
    a.mates = Array.from({ length: half }, (_, i) => coincidence('mate-' + i));
    b.mates = Array.from({ length: half }, (_, i) => coincidence('mate-' + i)); input.mates = [coincidence('one-more')];
  }
  expect(() => validateAssemblyDocument(input)).toThrow('presupuesto');
});
it('admits exactly 4096 expanded mate declarations in reused empty assemblies', () => {
  const sub = node('mate-only', 'r1', [], Array.from({ length: 64 }, (_, i) => ({ ...coincidence('mate-' + i), second: plane() })));
  const input = assembly([sub], Array.from({ length: 64 }, (_, i) => occurrence('copy-' + i, sub)));
  expect(validateAssemblyDocument(input).occurrences).toHaveLength(64);
  expect(expandAssemblyParts(input)).toEqual([]);
});
it('rejects mate expansion beyond the cap even with modest stored counts and suppressed instances', () => {
  const sub = node('mate-only', 'r1', [], Array.from({ length: 64 }, (_, i) => ({ ...coincidence('mate-' + i), second: plane() })));
  const input = assembly([sub], Array.from({ length: 65 }, (_, i) => ({ ...occurrence('copy-' + i, sub), suppressed: true })));
  expect(() => validateAssemblyDocument(input)).toThrow('presupuesto');
});

function featureBudget(extra: boolean): AssemblyDocument {
  const definitions: EmbeddedPartDefinition[] = [];
  for (let i = 0; i < MAX_ASSEMBLY_PART_FEATURES / 2000; i++) {
    const definition = part('feature-part-' + i);
    definition.document.features = Array.from({ length: 2000 }, (_, j) => sketch('profile-' + j)); definitions.push(definition);
  }
  if (extra) { const definition = part('extra-feature-part'); definition.document.features = [sketch()]; definitions.push(definition); }
  return assembly(definitions, []);
}
it('admits the aggregate feature boundary without native construction or truncation', () => {
  const parsed = validateAssemblyDocument(featureBudget(false));
  expect(parsed.definitions.reduce((count, item) => count + (item.kind === 'part' ? item.document.features.length : 0), 0)).toBe(MAX_ASSEMBLY_PART_FEATURES);
});
it('bounds aggregate part features even when every embedded part is individually legal', () => {
  expect(() => validateAssemblyDocument(featureBudget(true))).toThrow('presupuesto de operaciones');
});
it('bounds actual UTF-8 input bytes rather than character count', () => {
  const json = '"' + 'é'.repeat(MAX_ASSEMBLY_BYTES / 2) + '"';
  expect(json.length).toBeLessThan(MAX_ASSEMBLY_BYTES);
  expect(() => parseCadDocument(json)).toThrow('20 MB');
});
it.each(['sparse list', 'custom prototype', 'object cycle'] as const)('rejects non-JSON object input: %s', kind => {
  const input = assembly();
  if (kind === 'sparse list') expect(() => validateAssemblyDocument({ ...input, occurrences: new Array(2) })).toThrow();
  else if (kind === 'custom prototype') expect(() => validateAssemblyDocument(Object.assign(Object.create({}), input))).toThrow('prototipo');
  else { const cyclic: Record<string, unknown> = { ...input }; cyclic.self = cyclic; expect(() => validateAssemblyDocument(cyclic)).toThrow('ciclo'); }
});

function directionReference(kind: 'plane' | 'cylinder' | 'line', path: string[]): AssemblyGeometryReference {
  if (kind === 'plane') return plane(path)
  if (kind === 'cylinder') return axis(path)
  return { kind: 'edge', component: component(path), body: { bodyId: 'original-body', sourceFeatureId: 'solid' },
    edge: { sourceFeatureId: 'solid', key: 'edge-v1|original-declaration-line' }, support: 'line' }
}
const directionPairs: ['plane' | 'cylinder' | 'line', 'plane' | 'cylinder' | 'line', AssemblyDirectionMateType][] = [
  ['plane', 'plane', 'parallel'], ['plane', 'cylinder', 'perpendicular'], ['plane', 'line', 'perpendicular'],
  ['cylinder', 'plane', 'perpendicular'], ['cylinder', 'cylinder', 'parallel'], ['cylinder', 'line', 'parallel'],
  ['line', 'plane', 'perpendicular'], ['line', 'cylinder', 'parallel'], ['line', 'line', 'parallel'],
];
it.each(directionPairs)('round-trips all three directed declarations for %s/%s in version 2', (firstKind, secondKind, collinear) => {
  const input = assembly(), first = directionReference(firstKind, ['left']), second = directionReference(secondKind, ['right']);
  input.mates = [
    { id: 'aligned', name: 'Original directed collinearity', type: collinear, first, second, alignment: 'aligned', suppressed: false },
    { id: 'opposed', name: 'Original opposite collinearity', type: collinear, first, second, alignment: 'opposed', suppressed: true },
    { id: 'orthogonal', name: 'Original direction orthogonality', type: collinear === 'parallel' ? 'perpendicular' : 'parallel', first, second, alignment: null, suppressed: false },
  ];
  const before = JSON.stringify(input), parsed = parseAssemblyDocument(serializeAssemblyDocument(input));
  expect(parsed).toEqual(input); expect(parsed.version).toBe(2); expect(JSON.stringify(input)).toBe(before);
  const cloned = binaryMate(parsed.mates[0]);
  if (cloned.type !== 'parallel' && cloned.type !== 'perpendicular') throw new Error('Original direction mate missing');
  if (cloned.first.kind === 'principal-axis') throw new Error('Original direction fixture has no principal axis');
  if (cloned.first.kind === 'principal-plane') cloned.first.plane = 'YZ';
  else cloned.first.component.occurrencePath[0] = 'changed';
  expect(JSON.stringify(input)).toBe(before);
});
it.each(['null collinear', 'missing alignment', 'string orthogonal', 'boolean alignment', 'extra angle', 'extra distance', 'extra rotationLock'] as const)(
  'rejects a noncanonical direction mate record: %s', fault => {
    const input = assembly(), value: Record<string, unknown> = { id: 'direction', name: 'Original direction intent', suppressed: false,
      type: 'parallel', first: plane(['left']), second: plane(['right']), alignment: 'aligned' };
    if (fault === 'null collinear') value.alignment = null;
    else if (fault === 'missing alignment') delete value.alignment;
    else if (fault === 'string orthogonal') value.type = 'perpendicular';
    else if (fault === 'boolean alignment') value.alignment = true;
    else if (fault === 'extra angle') value.angle = 0;
    else if (fault === 'extra distance') value.distance = 0;
    else value.rotationLock = [0, 0, 0, 1];
    expect(() => validateAssemblyDocument({ ...input, mates: [value] })).toThrow();
  });
it('preserves a legacy mixed-support angle zero without converting it to geometric parallelism', () => {
  const input = assembly(); input.mates = [{ id: 'legacy-angle', name: 'Original normal-axis angle zero', suppressed: false,
    type: 'angle', first: plane(['left']), second: axis(['right']), angle: 0 }];
  expect(parseAssemblyDocument(serializeAssemblyDocument(input)).mates).toEqual(input.mates);
});
it('preserves native face-plane and legacy LINE reference identities without rewriting their saved role', () => {
  const input = assembly(), first = { ...axis(['left']), support: 'plane' as const, face: { sourceFeatureId: 'solid', key: 'face-v1|original-plane' } },
    second = { ...directionReference('line', ['right']), body: null } as AssemblyGeometryReference;
  input.mates = [{ id: 'direction', name: 'Original face-plane and legacy line', suppressed: false, type: 'parallel', first, second, alignment: null }];
  expect(parseAssemblyDocument(serializeAssemblyDocument(input)).mates).toEqual(input.mates);
});
it('rejects direction record accessors before invoking executable input', () => {
  const input = assembly(), value = { id: 'direction', name: 'Original direction intent', suppressed: false,
    type: 'perpendicular', first: plane(['left']), second: axis(['right']), alignment: 'aligned' };
  let invoked = false; Object.defineProperty(value, 'alignment', { enumerable: true, get: () => { invoked = true; return 'aligned' } });
  expect(() => validateAssemblyDocument({ ...input, mates: [value] })).toThrow(); expect(invoked).toBe(false);
});

function tangentSurface(path = ['right']): AssemblyCylinderSurfaceReference {
  return { kind: 'face', component: component(path), body: { bodyId: 'original-body', sourceFeatureId: 'solid' },
    face: { sourceFeatureId: 'solid', key: 'face-v1|original-surface-declaration' }, support: 'cylinder-surface' };
}
const tangentDeclarations = [false, true].flatMap(reversed => ['positive', 'negative'].flatMap(side => [false, true].map(datum => ({ reversed, side: side as 'positive' | 'negative', datum }))));
it.each(tangentDeclarations)('round-trips explicit tangent side=$side reversed=$reversed datum=$datum without axis coercion', ({ reversed, side, datum }) => {
  const input = assembly(), surface = tangentSurface(), flat: AssemblyTangentReference = datum ? plane(['left'])
    : { ...axis(['left']), support: 'plane' };
  input.mates = [{ id: 'tangent', name: 'Original infinite analytic tangency', type: 'tangent', suppressed: false,
    first: reversed ? surface : flat, second: reversed ? flat : surface, side }];
  const before = JSON.stringify(input.mates), parsed = parseAssemblyDocument(serializeAssemblyDocument(input)); expect(parsed.mates).toEqual(input.mates);
  expect(validateAssemblyTangentReference(surface)).toEqual(surface); expect(validateAssemblyCylinderSurfaceReference(surface)).not.toBe(surface);
  expect(() => validateAssemblyGeometryReference(surface)).toThrow();
  const current = binaryMate(parsed.mates[0]); if (current.type !== 'tangent') throw new Error('Expected tangent declaration');
  const selected = reversed ? current.first : current.second;
  if (selected.kind !== 'face') throw new Error('Expected original surface');
  selected.face.key = 'mutated detached surface'; expect(JSON.stringify(input.mates)).toBe(before);
});
it.each([
  { side: 'aligned' }, { side: null }, { side: 1 }, { alignment: 'aligned' }, { angle: 90 }, { phase: 0 },
  { neutralTravel: 2 }, { first: plane(), second: plane(['right']) },
  { first: tangentSurface(['left']), second: tangentSurface() }, { second: axis(['right']) },
  { second: { kind: 'edge', component: component(['right']), body: null, edge: { sourceFeatureId: 'solid', key: 'LINE' }, support: 'line' } },
])('rejects malformed/inert tangent fields %# while retaining the original input', change => {
  const input = assembly(), value = { id: 'tangent', name: 'Original tangent', suppressed: true, type: 'tangent', first: plane(), second: tangentSurface(), side: 'positive', ...change };
  const before = JSON.stringify(value); expect(() => validateAssemblyDocument({ ...input, mates: [value] })).toThrow(); expect(JSON.stringify(value)).toBe(before);
});
it('requires side even in a dormant suppressed tangent record and does not invoke getters', () => {
  const input = assembly(), value = { id: 'tangent', name: 'Original tangent', suppressed: true, type: 'tangent', first: plane(), second: tangentSurface() };
  input.definitions.push(node('dormant', 'r1', [occurrence('right')], []));
  const dormant = input.definitions.at(-1)!; if (dormant.kind !== 'assembly') throw new Error('Original dormant source required');
  dormant.mates = [value as never]; expect(() => validateAssemblyDocument(input)).toThrow();
  let reads = 0; Object.defineProperty(value.second, 'support', { enumerable: true, get() { reads++; return 'cylinder-surface'; } });
  expect(() => validateAssemblyTangentReference(value.second)).toThrow(); expect(reads).toBe(0);
});
it.each(['angle', 'parallel', 'perpendicular', 'concentric', 'gear', 'screw', 'rack-pinion'] as const)('keeps cylinder-surface purpose out of the existing %s family', type => {
  const base = assembly(), common = { id: 'old', name: 'Original old family', type, suppressed: false, first: tangentSurface(['left']), second: axis(['right']) };
  const data = type === 'angle' ? { angle: 90 } : type === 'parallel' || type === 'perpendicular' ? { alignment: 'aligned' }
    : type === 'concentric' ? { alignment: 'aligned', rotationLock: null }
      : type === 'gear' ? { carrier: null, ratio: { numerator: 1, denominator: 1 }, direction: 'opposed', neutralRotations: { first: [0, 0, 0, 1], second: [0, 0, 0, 1] }, angles: { first: 0, second: 0 }, phase: 0 }
        : type === 'screw' ? { lead: 5, reverse: false, alignment: 'aligned', neutralRotation: [0, 0, 0, 1], angle: 0, neutralTravel: 0 }
          : { conversion: { mode: 'diameter', override: null }, reverse: false, neutralRotation: [0, 0, 0, 1], angle: 0, neutralTravel: 0 };
  expect(() => validateAssemblyDocument({ ...base, mates: [{ ...common, ...data }] })).toThrow();
});
it('keeps old axis/angle saved records byte-compatible beside a new tangent declaration', () => {
  const input = assembly(); input.mates = mates(); const before = serializeAssemblyDocument(input);
  const next = validateAssemblyDocument(input); next.mates.push({ id: 'tangent', name: 'New explicit surface intent', type: 'tangent', suppressed: false, first: plane(), second: tangentSurface(), side: 'negative' });
  next.mates.pop(); expect(serializeAssemblyDocument(next)).toBe(before);
});

const cylinderDeclarationTypes: AssemblyCylinderTangentMateType[] = ['skew-cylinder-tangent', 'parallel-cylinder-tangent'];
const cylinderDeclarationBranches: AssemblyCylinderTangentBranch[] = [{ kind: 'external' }, { kind: 'internal', larger: 'first' }, { kind: 'internal', larger: 'second' }];
function cylinderDeclaration(type: AssemblyCylinderTangentMateType, branch: AssemblyCylinderTangentBranch = { kind: 'external' }): AssemblyCylinderTangentMate {
  return { id: 'cylinders', name: 'Original infinite cylinder support intent', type, suppressed: false,
    first: tangentSurface(['left']), second: tangentSurface(['right']), branch };
}
it.each(cylinderDeclarationTypes.flatMap(type => cylinderDeclarationBranches.map(branch => ({ type, branch })) ))(
  'round-trips a distinct $type/$branch.kind/$branch.larger record without cached geometry', ({ type, branch }) => {
    const input = assembly(); input.mates = [cylinderDeclaration(type, branch)]; const before = serializeAssemblyDocument(input);
    const parsed = parseAssemblyDocument(before); expect(parsed).toEqual(input); expect(parsed.version).toBe(2);
    const value = binaryMate(parsed.mates[0]); if (value.type !== type || value.type !== 'skew-cylinder-tangent' && value.type !== 'parallel-cylinder-tangent') throw new Error('Original cylinder intent required');
    expect(value.first.support).toBe('cylinder-surface'); expect(value.second.support).toBe('cylinder-surface');
    value.first.component.occurrencePath[0] = 'detached'; value.branch.kind = 'external'; expect(serializeAssemblyDocument(input)).toBe(before);
  });
it.each(cylinderDeclarationTypes.flatMap(type => ['side', 'alignment', 'angle', 'radius', 'target', 'contact', 'normalRelation'].map(field => ({ type, field })) ))(
  'rejects inert $field on $type', ({ type, field }) => {
    const input = assembly(), value = { ...cylinderDeclaration(type), [field]: 0 };
    expect(() => validateAssemblyDocument({ ...input, mates: [value] })).toThrow();
  });
it.each(['axis', 'plane', 'principal-plane', 'line'] as const)('rejects %s as a cylinder surface endpoint in both families', kind => {
  for (const type of cylinderDeclarationTypes) for (const side of ['first', 'second'] as const) {
    const replacement = kind === 'principal-plane' ? plane(['left']) : kind === 'line' ? directionReference('line', ['left']) : { ...axis(['left']), support: kind };
    expect(() => validateAssemblyDocument({ ...assembly(), mates: [{ ...cylinderDeclaration(type), [side]: replacement }] })).toThrow();
  }
});
it('requires a canonical branch inside dormant and suppressed cylinder declarations without running getters', () => {
  const input = assembly(), value = { ...cylinderDeclaration('skew-cylinder-tangent'), suppressed: true, branch: { kind: 'internal' } };
  input.definitions.push(node('dormant-cylinders', 'r1', [occurrence('left'), occurrence('right')]));
  const dormant = input.definitions.at(-1)!; if (dormant.kind !== 'assembly') throw new Error('Original dormant assembly required');
  expect(() => validateAssemblyDocument({ ...input, definitions: [...input.definitions.slice(0, -1), { ...dormant, mates: [value] }] })).toThrow();
  let reads = 0; Object.defineProperty(value.branch, 'kind', { enumerable: true, get() { reads++; return 'external'; } });
  expect(() => validateAssemblyDocument({ ...assembly(), mates: [value] })).toThrow(); expect(reads).toBe(0);
});
it('preserves PC tangent side and all legacy mate records beside both new families', () => {
  const input = assembly(); input.mates = [...mates(), { id: 'pc', name: 'Original PC support tangency', type: 'tangent', suppressed: false, first: plane(), second: tangentSurface(), side: 'negative' }];
  const before = serializeAssemblyDocument(input);
  input.mates.push(cylinderDeclaration('skew-cylinder-tangent'), { ...cylinderDeclaration('parallel-cylinder-tangent'), id: 'parallel-cylinders' });
  const roundtrip = parseAssemblyDocument(serializeAssemblyDocument(input)); roundtrip.mates.splice(-2);
  expect(serializeAssemblyDocument(roundtrip)).toBe(before);
});

function sphereDeclarationSurface(path = ['right']): AssemblySphereSurfaceReference { return { ...tangentSurface(path), support: 'sphere-surface' }; }
function sphereDeclaration(type: AssemblySphereTangentMateType, reversed = false): AssemblySphereTangentMate {
  const s = sphereDeclarationSurface(), first = type === 'plane-sphere-tangent' ? plane(['left']) : type === 'sphere-sphere-tangent' ? sphereDeclarationSurface(['left']) : tangentSurface(['left']);
  if (type === 'plane-sphere-tangent') return { id: 'sphere', name: 'Original plane/sphere', type, suppressed: false,
    first: reversed ? s : plane(['left']), second: reversed ? plane(['left']) : s, side: 'positive' };
  if (type === 'sphere-sphere-tangent') return { id: 'sphere', name: 'Original sphere pair', type, suppressed: false,
    first: reversed ? s : sphereDeclarationSurface(['left']), second: reversed ? sphereDeclarationSurface(['left']) : s, branch: { kind: 'internal', larger: 'second' } };
  if (first.kind !== 'face' || first.support !== 'cylinder-surface') throw new Error('Original cylinder required');
  return { id: 'sphere', name: 'Original cylinder/sphere', type, suppressed: false, first: reversed ? s : first, second: reversed ? first : s, branch: { kind: 'external' } };
}
const sphereDeclarationTypes: AssemblySphereTangentMateType[] = ['plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent'];
it.each(sphereDeclarationTypes.flatMap(type => [false, true].map(reversed => ({ type, reversed }))))('round-trips $type reversed=$reversed with detached exact purposes', ({ type, reversed }) => {
  const input = assembly(); input.mates = [sphereDeclaration(type, reversed)]; const before = serializeAssemblyDocument(input), parsed = parseAssemblyDocument(before);
  expect(parsed).toEqual(input); expect(parsed.version).toBe(2); expect(validateAssemblySphereSurfaceReference(sphereDeclarationSurface())).toEqual(sphereDeclarationSurface());
  expect(validateAssemblySphereTangentReference(sphereDeclarationSurface())).toEqual(sphereDeclarationSurface());
  const m = binaryMate(parsed.mates[0]); if (!('kind' in m.first) || m.first.kind !== 'face') m.name = 'detached'; else m.first.face.key = 'detached';
  expect(serializeAssemblyDocument(input)).toBe(before);
});
it.each(sphereDeclarationTypes.flatMap(type => ['alignment', 'radius', 'neutralRotation', 'angle', 'contact', 'normalRelation'].map(field => ({ type, field }))))(
  'rejects inert spherical $field on $type', ({ type, field }) => { expect(() => validateAssemblyDocument({ ...assembly(), mates: [{ ...sphereDeclaration(type), [field]: 0 }] })).toThrow(); });
it.each(sphereDeclarationTypes)('requires the exact $type endpoint pair and side/branch discriminator', type => {
  const original = sphereDeclaration(type);
  for (const second of [axis(['right']), tangentSurface(), plane(['right'])]) expect(() => validateAssemblyDocument({ ...assembly(), mates: [{ ...original, first: axis(), second }] })).toThrow();
  const { side: _side, branch: _branch, ...missing } = { ...original, side: undefined, branch: undefined };
  expect(() => validateAssemblyDocument({ ...assembly(), mates: [missing] })).toThrow();
  expect(() => validateAssemblyDocument({ ...assembly(), mates: [{ ...original, ...(type === 'plane-sphere-tangent' ? { branch: { kind: 'external' } } : { side: 'positive' }) }] })).toThrow();
});
it.each(['angle', 'parallel', 'perpendicular', 'concentric', 'coincident', 'distance', 'gear', 'screw', 'rack-pinion', 'tangent', 'skew-cylinder-tangent', 'parallel-cylinder-tangent'] as const)(
  'keeps a sphere surface outside every prior %s saved family', type => {
    const value = type === 'tangent' ? { ...sphereDeclaration('plane-sphere-tangent'), type }
      : type === 'skew-cylinder-tangent' || type === 'parallel-cylinder-tangent' ? { ...cylinderDeclaration(type), second: sphereDeclarationSurface() }
      : { ...mates().find(m => m.type === type), type, id: 'old', name: 'Old intent', suppressed: false, first: sphereDeclarationSurface(), second: plane() };
    expect(() => validateAssemblyDocument({ ...assembly(), mates: [value] })).toThrow();
    expect(() => validateAssemblyGeometryReference(sphereDeclarationSurface())).toThrow(); expect(() => validateAssemblyTangentReference(sphereDeclarationSurface())).toThrow();
  });
it('rejects sphere locator accessors, hidden fields, extra axes and malformed bodies without executing them', () => {
  let reads = 0; const sphere = sphereDeclarationSurface(); Object.defineProperty(sphere.face, 'key', { enumerable: true, get() { reads++; return 'fake'; } });
  expect(() => validateAssemblySphereSurfaceReference(sphere)).toThrow(); expect(reads).toBe(0);
  for (const ref of [{ ...sphereDeclarationSurface(), axis: [0, 0, 1] }, { ...sphereDeclarationSurface(), body: { bodyId: 'only' } }, Object.defineProperty(sphereDeclarationSurface(), 'radius', { value: 2 })]) expect(() => validateAssemblySphereSurfaceReference(ref)).toThrow();
});
it('preserves old PC/CC bytes and validates suppressed dormant sphere intent with the same strict schema', () => {
  const input = assembly(); input.mates = [cylinderDeclaration('skew-cylinder-tangent'), { id: 'pc', name: 'PC', type: 'tangent', suppressed: false, first: plane(), second: tangentSurface(), side: 'negative' }];
  const before = serializeAssemblyDocument(input); input.mates.push(sphereDeclaration('sphere-sphere-tangent')); const reopened = parseAssemblyDocument(serializeAssemblyDocument(input)); reopened.mates.pop(); expect(serializeAssemblyDocument(reopened)).toBe(before);
  const dormant = node('dormant-sphere', 'r1', [occurrence('left'), occurrence('right')], [{ ...sphereDeclaration('plane-sphere-tangent'), suppressed: true }]);
  input.definitions.push(dormant); expect(validateAssemblyDocument(input).definitions.at(-1)).toEqual(dormant);
  expect(() => validateAssemblyDocument({ ...input, definitions: [...input.definitions.slice(0, -1), { ...dormant, mates: [{ ...dormant.mates[0], side: null }] }] })).toThrow();
});
