import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { EntityProfile, SketchOffsetRelation } from '../sketch/types';
import {
  createEntityPrismIdentityV2, createEntityPrismReferenceCatalogV2,
  isEdgeReferenceKeyV2, isFaceReferenceKeyV2, prismEdgeReferenceV2, prismFaceReferenceV2,
  resolvePrismEdgeReferenceV2, resolvePrismFaceReferenceV2, SEMANTIC_PRISM_LIMITS,
  type EntityPrismContextV2, type PrismFaceRoleV2, type PrismHistoryEntryV2,
  type PrismMaterialRegionV2, type PrismVerifiedWitnessV2,
} from './kernel.semantic-references';

// Original symbolic fixtures. These tests prove the pure identity contract, not native provenance or CAD validity.
const region: PrismMaterialRegionV2 = { outer: ['bottom', 'right', 'top', 'left'], holes: [['hole-a'], ['hole-b']] };
const context = (): EntityPrismContextV2 => ({ sourceFeatureId: 'extrude', sketchFeatureId: 'sketch', history: [
  { id: 'sketch', type: 'sketch', suppressed: false, plane: 'XY' },
  { id: 'extrude', type: 'extrude', suppressed: false, sketchId: 'sketch', symmetric: false, direction: 'positive' },
] });
function plate(): EntityProfile {
  return { kind: 'entities', points: [
    { id: 'p0', x: -10, y: -10 }, { id: 'p1', x: 40, y: -10 },
    { id: 'p2', x: 40, y: 10 }, { id: 'p3', x: -10, y: 10 },
    { id: 'ca', x: 0, y: 0 }, { id: 'cb', x: 20, y: 0 },
  ], entities: [
    { id: 'bottom', type: 'line', construction: false, start: 'p0', end: 'p1' },
    { id: 'right', type: 'line', construction: false, start: 'p1', end: 'p2' },
    { id: 'top', type: 'line', construction: false, start: 'p2', end: 'p3' },
    { id: 'left', type: 'line', construction: false, start: 'p3', end: 'p0' },
    { id: 'hole-a', type: 'circle', construction: false, center: 'ca', radius: 3 },
    { id: 'hole-b', type: 'circle', construction: false, center: 'cb', radius: 5 },
  ], constraints: [{ id: 'width', type: 'length', entityId: 'bottom', value: 50, referenceRole: 'constraint' }] };
}
function offsetPlate(): EntityProfile {
  const profile = plate();
  for (const [suffix, radius] of [['a', 1], ['b', 3]] as const) {
    profile.entities.push({ id: `source-${suffix}`, type: 'circle', construction: true, center: `c${suffix}`, radius });
    profile.constraints.push({ id: `offset-${suffix}`, type: 'offset', sources: [{ entityId: `source-${suffix}`, reversed: false }],
      images: [{ side: 'right', distance: 2, entityIds: [`hole-${suffix}`], joins: [] }], closed: true, cap: 'none', capEntityIds: [] });
  }
  profile.constraints.push({ id: 'shared', type: 'equalOffsetDistance', members: [
    { offsetId: 'offset-a', side: 'right' }, { offsetId: 'offset-b', side: 'right' },
  ] });
  return profile;
}
const identity = (profile = plate(), history = context(), material = region) => createEntityPrismIdentityV2(profile, history, material);
const sideA: PrismFaceRoleV2 = { role: 'side', entityId: 'hole-a', entityType: 'circle' };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type Token = { readonly topology: string };
const equality = { sameFace: (a: Token, b: Token) => a.topology === b.topology, sameEdge: (a: Token, b: Token) => a.topology === b.topology };
function witness(profile = plate(), material = region, prefix = ''): PrismVerifiedWitnessV2<Token, Token> {
  const entities = profile.entities.filter(entity => !entity.construction);
  const faces: PrismVerifiedWitnessV2<Token, Token>['faces'] = [
    { role: { role: 'startCap' }, target: { topology: prefix + 'start' } },
    { role: { role: 'endCap' }, target: { topology: prefix + 'end' } },
    ...entities.map(entity => ({ role: { role: 'side' as const, entityId: entity.id, entityType: entity.type }, target: { topology: prefix + 'side-' + entity.id } })),
  ];
  const edges = entities.flatMap(entity => (['startRim', 'endRim'] as const).map(role => ({
    role: { role, entityId: entity.id, entityType: entity.type }, target: { topology: prefix + role + '-' + entity.id },
  })));
  return { status: 'verified', direction: 'positive', materialRegion: clone(material), faces, edges,
    bodyFaces: faces.map(entry => ({ ...entry.target })),
    bodyEdges: [...edges.map(entry => ({ ...entry.target })), { topology: prefix + 'unnamed-seam' }],
  };
}
const catalog = (id = identity(), targets = witness()) => createEntityPrismReferenceCatalogV2(id, targets, equality);

describe('experimental pure prism v2 identity', () => {
  it('pins an independently written canonical descriptor and the SHA256 namespace with Node crypto', () => {
    const profile: EntityProfile = { kind: 'entities', points: [{ id: 'c', x: 0, y: 0 }], entities: [
      { id: 'ring', type: 'circle', construction: false, center: 'c', radius: 3 },
    ], constraints: [] };
    const ownContext: EntityPrismContextV2 = { sourceFeatureId: 'e', sketchFeatureId: 's', history: [
      { id: 's', type: 'sketch', suppressed: false, plane: 'XY' },
      { id: 'e', type: 'extrude', suppressed: false, sketchId: 's', symmetric: false, direction: 'positive' },
    ] };
    const payload = '["entity-prism-v2",["e","s",[["s","sketch",false,"XY",["principal","XY"]],["e","extrude",false,"s",false,"positive"]]],["c"],[["ring","circle",false,"c"]],[],{"holes":[],"outer":["ring"]}]';
    const digest = createHash('sha256').update(payload).digest('hex');
    const id = createEntityPrismIdentityV2(profile, ownContext, { outer: ['ring'], holes: [] });
    expect(id).toEqual({ sourceFeatureId: 'e', lineageDigest: digest });
    expect(prismFaceReferenceV2(id, { role: 'side', entityId: 'ring', entityType: 'circle' })).toEqual({
      sourceFeatureId: 'e', key: 'face-v2|' + createHash('sha256').update(JSON.stringify(['face-v2', digest, ['side', 'ring', 'circle']])).digest('hex'),
    });
  });

  it('requires canonical lowercase 64hex v2 keys, with no v1 reinterpretation, whitespace or suffix', () => {
    const face = prismFaceReferenceV2(identity(), sideA).key;
    const edge = prismEdgeReferenceV2(identity(), { role: 'startRim', entityId: 'hole-a', entityType: 'circle' }).key;
    expect(isFaceReferenceKeyV2(face)).toBe(true); expect(isEdgeReferenceKeyV2(edge)).toBe(true);
    for (const value of [undefined, '', face.replace('v2', 'v1'), face.toUpperCase(), face.slice(0, -1), face + '\n', face + ' ', ' ' + face, edge]) expect(isFaceReferenceKeyV2(value)).toBe(false);
    for (const value of [null, edge.replace('v2', 'v1'), edge + '\r\n', face]) expect(isEdgeReferenceKeyV2(value)).toBe(false);
  });

  it('preserves keys across radius/position/value edits, array enumeration, cycle rotation/reversal and hole order', () => {
    const original = plate(), changed = plate();
    changed.points.forEach(point => { point.x = point.x * 2 + 123; point.y = point.y * 3 - 57; });
    // Swap the holes' radius order as well as their positions; geometric ordinals are not identity.
    changed.entities.forEach(entity => { if (entity.type === 'circle') entity.radius = entity.id === 'hole-a' ? 16 : 14; });
    const dimension = changed.constraints[0]; if ('value' in dimension) { dimension.value = 100; dimension.driven = true; }
    changed.points.reverse(); changed.entities.reverse(); changed.constraints.reverse();
    const reordered = { outer: ['top', 'right', 'bottom', 'left'], holes: [['hole-b'], ['hole-a']] };
    expect(identity(changed, context(), reordered)).toEqual(identity(original));
    expect(prismFaceReferenceV2(identity(changed, context(), reordered), sideA)).toEqual(prismFaceReferenceV2(identity(original), sideA));
  });

  it('separates caps, source-owned sides and both rims without target indices or token identity in keys', () => {
    const id = identity(), first = catalog(id), second = catalog(id, witness(plate(), region, 'another-build-'));
    expect(new Set([...first.faces, ...first.edges].map(entry => entry.ref.key)).size).toBe(20);
    expect(first.faces.map(entry => entry.ref)).toEqual(second.faces.map(entry => entry.ref));
    expect(first.edges.map(entry => entry.ref)).toEqual(second.edges.map(entry => entry.ref));
    expect(resolvePrismFaceReferenceV2(second, prismFaceReferenceV2(id, sideA))).toEqual({ topology: 'another-build-side-hole-a' });
    expect(first.edges).toHaveLength(12); // The extra symbolic seam has no stored v2 key.
  });

  it('retains discrete offset ownership/side/family/endpoint policy while excluding distance seeds', () => {
    const original = offsetPlate(), changed = clone(original);
    changed.constraints.forEach(constraint => {
      if (constraint.type === 'offset') constraint.images[0].distance = 3;
      if (constraint.type === 'equalOffsetDistance') constraint.members.reverse();
    });
    changed.entities.forEach(entity => { if (entity.type === 'circle') entity.radius += 1; });
    expect(identity(changed)).toEqual(identity(original));
    const flipped = clone(original);
    flipped.constraints.forEach(constraint => {
      if (constraint.type === 'offset' && constraint.id === 'offset-a') constraint.images[0].side = 'left';
      if (constraint.type === 'equalOffsetDistance') constraint.members[0].side = 'left';
    });
    expect(identity(flipped).lineageDigest).not.toBe(identity(original).lineageDigest);
    const line = plate();
    line.points.push({ id: 's0', x: -10, y: -8 }, { id: 's1', x: 40, y: -8 });
    line.entities.push({ id: 'source-line', type: 'line', construction: true, start: 's0', end: 's1' });
    const relation: SketchOffsetRelation = { id: 'line-offset', type: 'offset', sources: [{ entityId: 'source-line', reversed: false }], images: [
      { side: 'right', distance: 2, entityIds: ['bottom'], joins: [] },
    ], closed: false, cap: 'none', capEntityIds: [] };
    line.constraints.push(relation);
    const free = identity(line);
    relation.images[0].lineEndpointMode = 'free'; expect(identity(line)).toEqual(free);
    relation.images[0].lineEndpointMode = 'aligned'; expect(identity(line).lineageDigest).not.toBe(free.lineageDigest);
    delete relation.images[0].lineEndpointMode; relation.images[0].lineEndpointFollowing = [true, false];
    expect(identity(line).lineageDigest).not.toBe(free.lineageDigest);
  });

  it('changes the identity when generating tangent branches or source arc direction changes', () => {
    const profile = plate();
    profile.constraints.push({ id: 'tangent', type: 'tangent', a: 'hole-a', b: 'hole-b', branch: 'external' });
    const initial = identity(profile);
    const tangent = profile.constraints.at(-1)!; if (tangent.type === 'tangent') tangent.branch = 'aContainsB';
    expect(identity(profile).lineageDigest).not.toBe(initial.lineageDigest);
    const arcs: EntityProfile = { kind: 'entities', points: [{ id: 'a', x: 10, y: 0 }, { id: 'b', x: -10, y: 0 }], entities: [
      { id: 'upper', type: 'arc', construction: false, center: 'origin', start: 'a', end: 'b', clockwise: false },
      { id: 'lower', type: 'arc', construction: false, center: 'origin', start: 'b', end: 'a', clockwise: false },
    ], constraints: [] };
    const circleRegion = { outer: ['upper', 'lower'], holes: [] }, before = identity(arcs, context(), circleRegion);
    const upper = arcs.entities[0]; if (upper.type === 'arc') upper.clockwise = true;
    expect(identity(arcs, context(), circleRegion).lineageDigest).not.toBe(before.lineageDigest);
  });

  it('fails closed after source replacement, suppression/history change, region deletion or boundary split', () => {
    const original = identity(), savedFace = prismFaceReferenceV2(original, sideA), savedEdge = prismEdgeReferenceV2(original, { role: 'startRim', entityId: 'bottom', entityType: 'line' });
    const beforeReplacement = context();
    const replacement: EntityPrismContextV2 = { ...beforeReplacement, sketchFeatureId: 'replacement-sketch',
      history: beforeReplacement.history.map(entry => entry.type === 'sketch' ? { ...entry, id: 'replacement-sketch' }
        : entry.type === 'extrude' ? { ...entry, sketchId: 'replacement-sketch' } : entry) };
    expect(() => resolvePrismFaceReferenceV2(catalog(identity(plate(), replacement)), savedFace)).toThrow(/desaparecida/);
    const removed = plate(); removed.entities = removed.entities.filter(entity => entity.id !== 'hole-b');
    const smallerRegion = { outer: region.outer, holes: [['hole-a']] };
    expect(() => resolvePrismFaceReferenceV2(catalog(identity(removed, context(), smallerRegion), witness(removed, smallerRegion)), savedFace)).toThrow(/desaparecida/);
    const split = plate(); split.points.push({ id: 'middle', x: 15, y: -10 });
    const bottom = split.entities[0]; if (bottom.type === 'line') bottom.end = 'middle';
    split.entities.push({ id: 'bottom-new', type: 'line', construction: false, start: 'middle', end: 'p1' });
    const splitRegion = { outer: ['bottom', 'bottom-new', 'right', 'top', 'left'], holes: region.holes };
    expect(() => resolvePrismEdgeReferenceV2(catalog(identity(split, context(), splitRegion), witness(split, splitRegion)), savedEdge)).toThrow(/desaparecida/);
    const planeHistory: EntityPrismContextV2 = { ...context(), history: [
      { id: 'spare-plane', type: 'plane', suppressed: true, support: { kind: 'principal', plane: 'XZ' }, reversed: false }, ...context().history,
    ] };
    expect(identity(plate(), planeHistory).lineageDigest).not.toBe(original.lineageDigest);
  });

  it('distinguishes retyping an entity with the same ID and rejects the old entity-kind role', () => {
    const profile: EntityProfile = { kind: 'entities', points: [{ id: 'a', x: 10, y: 0 }, { id: 'b', x: 0, y: 10 }], entities: [
      { id: 'hole-a', type: 'arc', construction: false, center: 'origin', start: 'a', end: 'b', clockwise: false },
      { id: 'radial-b', type: 'line', construction: false, start: 'b', end: 'origin' },
      { id: 'radial-a', type: 'line', construction: false, start: 'origin', end: 'a' },
    ], constraints: [] };
    const id = identity(profile, context(), { outer: ['hole-a', 'radial-b', 'radial-a'], holes: [] });
    expect(() => prismFaceReferenceV2(id, sideA)).toThrow(/tipo/);
    expect(prismFaceReferenceV2(id, { ...sideA, entityType: 'arc' }).key).not.toBe(prismFaceReferenceV2(identity(), sideA).key);
  });

  it('includes exact historical support, plane reversal, suppression and extrusion direction/symmetry branches', () => {
    const supported: EntityPrismContextV2 = { ...context(), history: [
      { id: 'datum', type: 'plane', suppressed: false, support: { kind: 'principal', plane: 'XY' }, reversed: false },
      { id: 'sketch', type: 'sketch', suppressed: false, plane: 'XY', support: { kind: 'plane', planeId: 'datum' } },
      context().history[1],
    ] };
    const initial = identity(plate(), supported).lineageDigest;
    for (const field of ['direction', 'symmetric', 'reversed'] as const) {
      const changed: EntityPrismContextV2 = { ...supported, history: supported.history.map<PrismHistoryEntryV2>(entry => {
        if (entry.type === 'extrude' && field === 'direction') return { ...entry, direction: 'negative' };
        if (entry.type === 'extrude' && field === 'symmetric') return { ...entry, symmetric: true };
        if (entry.type === 'plane' && field === 'reversed') return { ...entry, reversed: true };
        return entry;
      }) };
      expect(identity(plate(), changed).lineageDigest).not.toBe(initial);
    }
    const suppressed: EntityPrismContextV2 = { ...supported, history: supported.history.map(entry => entry.type === 'plane' ? { ...entry, suppressed: true } : entry) };
    expect(() => identity(plate(), suppressed)).toThrow(/disponible/);
    const dangling: EntityPrismContextV2 = { ...supported, history: supported.history.map<PrismHistoryEntryV2>(entry => entry.type === 'sketch'
      ? { ...entry, support: { kind: 'plane', planeId: 'missing-datum' } } : entry) };
    expect(() => identity(plate(), dangling)).toThrow(/histórico/);
  });

  it('requires complete closed material cycles by IDs or explicit coincident constraints, not equal positions', () => {
    const profile = plate(); profile.points.push({ id: 'duplicate-p1', x: 40, y: -10 });
    const bottom = profile.entities[0]; if (bottom.type === 'line') bottom.end = 'duplicate-p1';
    expect(() => identity(profile)).toThrow(/abierto/);
    profile.constraints.push({ id: 'join', type: 'coincident', a: 'duplicate-p1', b: 'p1' });
    expect(identity(profile).lineageDigest).not.toBe(identity().lineageDigest);
    expect(() => identity(plate(), context(), { outer: region.outer, holes: [['hole-a']] })).toThrow(/cubre/);
    expect(() => identity(plate(), context(), { outer: region.outer, holes: [['hole-a'], ['hole-a'], ['hole-b']] })).toThrow(/repetida/);
    expect(() => identity(plate(), context(), { outer: ['bottom', 'top', 'right', 'left'], holes: region.holes })).toThrow(/ciclo/);
  });

  it('does not mutate or retain mutable identity inputs and does not claim same-ID recreation detection', () => {
    const profile = offsetPlate(), history = { ...context(), history: [...context().history] },
      material = { outer: [...region.outer], holes: region.holes.map(ids => [...ids]) }, before = JSON.stringify([profile, history, material]);
    const id = identity(profile, history, material), saved = prismFaceReferenceV2(id, sideA);
    expect(JSON.stringify([profile, history, material])).toBe(before);
    expect(identity(clone(profile), clone(history), clone(material))).toEqual(id); // Identical manual JSON cannot carry an unseen incarnation.
    profile.entities = []; history.history = []; material.outer = [];
    expect(prismFaceReferenceV2(id, sideA)).toEqual(saved);
    expect(() => prismFaceReferenceV2({ ...id }, sideA)).toThrow(/no construida/);
  });
});

describe('pure verified-witness catalog and strict resolution', () => {
  it('accepts independent body/role ordering using supplied exact topology equality, without naming extra seams', () => {
    const targets = witness();
    const reordered = { ...targets, faces: [...targets.faces].reverse(), edges: [...targets.edges].reverse(), bodyFaces: [...targets.bodyFaces].reverse(), bodyEdges: [...targets.bodyEdges].reverse() };
    const result = catalog(identity(), reordered);
    const ref = prismEdgeReferenceV2(identity(), { role: 'endRim', entityId: 'hole-b', entityType: 'circle' });
    expect(resolvePrismEdgeReferenceV2(result, ref)).toEqual({ topology: 'endRim-hole-b' });
  });

  it.each(['missing', 'duplicate-role', 'merged-target', 'split-body', 'absent-target', 'ambiguous-body'] as const)('rejects %s provenance atomically', kind => {
    const targets = witness(), before = JSON.stringify(targets);
    let broken = targets;
    if (kind === 'missing') broken = { ...targets, edges: targets.edges.slice(1) };
    if (kind === 'duplicate-role') broken = { ...targets, faces: targets.faces.map<PrismVerifiedWitnessV2<Token, Token>['faces'][number]>((entry, index) => index === 1 ? { ...entry, role: { role: 'startCap' } } : entry) };
    if (kind === 'merged-target') broken = { ...targets, faces: targets.faces.map((entry, index) => index === 1 ? { ...entry, target: { ...targets.faces[0].target } } : entry) };
    if (kind === 'split-body') broken = { ...targets, bodyFaces: [...targets.bodyFaces, { topology: 'split-descendant' }] };
    if (kind === 'absent-target') broken = { ...targets, bodyFaces: targets.bodyFaces.map((entry, index) => index === 0 ? { topology: 'foreign' } : entry) };
    if (kind === 'ambiguous-body') broken = { ...targets, bodyFaces: targets.bodyFaces.map((entry, index) => index === 1 ? { ...targets.bodyFaces[0] } : entry) };
    expect(() => catalog(identity(), broken)).toThrow();
    expect(JSON.stringify(targets)).toBe(before);
  });

  it('rejects unavailable/wrong-direction/wrong-region witnesses and never falls back from stored v2 to v1', () => {
    const targets = witness();
    expect(() => catalog(identity(), { ...targets, status: 'unavailable' } as never)).toThrow(/no disponible/);
    expect(() => catalog(identity(), { ...targets, direction: 'negative' })).toThrow(/sentido/);
    expect(() => catalog(identity(), { ...targets, materialRegion: { outer: ['hole-a'], holes: [region.outer, ['hole-b']] } })).toThrow(/región/);
    const result = catalog(), face = prismFaceReferenceV2(identity(), sideA);
    expect(() => resolvePrismFaceReferenceV2(result, { ...face, key: face.key.replace('face-v2|', 'face-v1|') })).toThrow(/versión/);
    expect(() => resolvePrismFaceReferenceV2(result, { ...face, sourceFeatureId: 'another-feature' })).toThrow(/histórico/);
    expect(() => resolvePrismFaceReferenceV2(result, { ...face, key: 'face-v2|' + '0'.repeat(64) })).toThrow(/desaparecida/);
    expect(() => resolvePrismFaceReferenceV2({ ...result, faces: [...result.faces, result.faces.find(entry => entry.ref.key === face.key)!] }, face)).toThrow(/ambigua/);
  });

  it('bounds history, sparse/oversized witnesses and malformed context before target comparisons', () => {
    const history = context();
    expect(() => identity(plate(), { ...history, history: Array(SEMANTIC_PRISM_LIMITS.maxHistory + 1).fill(history.history[0]) })).toThrow(/límite/);
    expect(() => identity(plate(), { ...history, position: [0, 0, 0] } as never)).toThrow(/desconocido/);
    expect(() => identity(plate(), { ...history, sourceFeatureId: 'wrong-id' })).toThrow();
    expect(() => identity(plate(), { ...history, history: [...history.history].reverse() })).toThrow(/histórico/);
    expect(() => identity(plate(), { ...history, history: [{ ...history.history[0], suppressed: true }, history.history[1]] })).toThrow(/disponible/);
    expect(() => identity(plate(), { ...history, history: [{ id: 'foreign', type: 'importedSolid', suppressed: false }, ...history.history] } as never)).toThrow(/historia/);
    const earlier = { ...history.history[1], id: 'earlier-solid' };
    expect(() => identity(plate(), { ...history, history: [history.history[0], earlier, history.history[1]] })).toThrow(/autónoma/);
    const targets = witness(), compareFace = vi.fn(equality.sameFace), compareEdge = vi.fn(equality.sameEdge);
    expect(() => createEntityPrismReferenceCatalogV2(identity(), { ...targets, faces: Array(131).fill(targets.faces[0]) }, { sameFace: compareFace, sameEdge: compareEdge })).toThrow(/límite/);
    expect(compareFace).not.toHaveBeenCalled(); expect(compareEdge).not.toHaveBeenCalled();
    const sparse = [...targets.edges]; delete sparse[0];
    expect(() => catalog(identity(), { ...targets, edges: sparse })).toThrow(/ausentes/);
  });
});
