import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, setOC, type Edge } from 'replicad';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { EntityProfile } from '../sketch/types';
import { entityProfilePrismWithProvenance } from './kernel.provenance';
import type { EntityPrismContextV2 } from './kernel.semantic-references';
import {
  createSemanticEdgeCatalog, createSemanticFaceCatalog, preparePrismReferencesV2,
  resolveSemanticEdgeReferences, resolveSemanticFaceReference, resolveSemanticSelectedFaces,
} from './kernel.semantic-catalogs';

beforeAll(async () => {
  const wasmBinary = await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'));
  setOC(await initOpenCascade({ wasmBinary }));
}, 60_000);

// Original Cartesian fixture, millimeters; no private model or native artifact is read.
function plate(radiusA = 3, radiusB = 6, centerAX = 0): EntityProfile {
  return { kind: 'entities', points: [
    { id: 'p0', x: -10, y: -10 }, { id: 'p1', x: 40, y: -10 },
    { id: 'p2', x: 40, y: 10 }, { id: 'p3', x: -10, y: 10 },
    { id: 'center-a', x: centerAX, y: 0 }, { id: 'center-b', x: 20, y: 0 },
  ], entities: [
    { id: 'bottom', type: 'line', start: 'p0', end: 'p1', construction: false },
    { id: 'right', type: 'line', start: 'p1', end: 'p2', construction: false },
    { id: 'top', type: 'line', start: 'p2', end: 'p3', construction: false },
    { id: 'left', type: 'line', start: 'p3', end: 'p0', construction: false },
    { id: 'hole-a', type: 'circle', center: 'center-a', radius: radiusA, construction: false },
    { id: 'hole-b', type: 'circle', center: 'center-b', radius: radiusB, construction: false },
  ], constraints: [] };
}
const context: EntityPrismContextV2 = {
  sourceFeatureId: 'extrude', sketchFeatureId: 'sketch', history: [
    { id: 'sketch', type: 'sketch', suppressed: false, plane: 'XY' },
    { id: 'extrude', type: 'extrude', suppressed: false, sketchId: 'sketch', symmetric: false, direction: 'positive' },
  ],
};
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing expected fixture role.');
  return value;
}
function specimen(profile = plate()) {
  const owner = entityProfilePrismWithProvenance(profile, 'XY', 0, 4);
  let faces: ReturnType<typeof createSemanticFaceCatalog> | undefined;
  let edges: ReturnType<typeof createSemanticEdgeCatalog> | undefined;
  try {
    const prepared = preparePrismReferencesV2(profile, context, owner.provenance);
    if (prepared.status !== 'verified') throw new Error(prepared.diagnostic);
    faces = createSemanticFaceCatalog(owner.shape, 'extrude', 'legacy-lineage', prepared.references);
    edges = createSemanticEdgeCatalog(owner.shape, 'extrude', 'legacy-lineage', prepared.references);
    const faceCatalog = faces, edgeCatalog = edges;
    return { owner, references: prepared.references, faces: faceCatalog, edges: edgeCatalog,
      dispose() { faceCatalog.dispose(); edgeCatalog.dispose(); owner.dispose(); } };
  } catch (error) {
    faces?.dispose(); edges?.dispose(); owner.dispose(); throw error;
  }
}
function rimBounds(edge: Edge, center: number, radius: number, z: number): void {
  const box = edge.boundingBox;
  try {
    const [minimum, maximum] = box.bounds;
    [center - radius, -radius, z].forEach((value, axis) => expect(Math.abs(minimum[axis] - value)).toBeLessThanOrEqual(5e-7));
    [center + radius, radius, z].forEach((value, axis) => expect(Math.abs(maximum[axis] - value)).toBeLessThanOrEqual(5e-7));
  } finally { box.delete(); }
}

describe('opt-in semantic catalogs on actual native prism topology', () => {
  it('resolves the same source hole after radius, position and radius-order edits, retaining conservative v1 rejection', () => {
    const first = specimen();
    try {
      const rim = required(first.references.edges.find(entry => entry.role.entityId === 'hole-a' && entry.role.role === 'startRim')).ref;
      const oldAlias = required(first.edges.entries.find(entry => entry.ref.key === rim.key)).aliases[0];
      const cap = required(first.references.faces.find(entry => entry.role.role === 'endCap')).ref;
      for (const [a, b, x] of [[3.5, 6.5, 0], [7, 2, 0], [3.5, 6.5, -1]]) {
        const edited = specimen(plate(a, b, x));
        try {
          expect(edited.edges.semanticStatus).toBe('applied');
          rimBounds(resolveSemanticEdgeReferences(edited.edges, [rim], 'extrude')[0], x, a, 0);
          const frame = resolveSemanticFaceReference(edited.faces, cap, 'extrude');
          expect(frame.origin).toEqual([0, 0, 4]);
          expect(frame.normal).toEqual([0, 0, 1]);
          expect(() => resolveSemanticEdgeReferences(edited.edges, [oldAlias], 'extrude')).toThrow();
        } finally { edited.dispose(); }
      }
    } finally { first.dispose(); }
  }, 60_000);

  it('keeps one actual entry with an exact legacy alias and rejects mixed-version duplicate selections', () => {
    const current = specimen();
    try {
      expect(current.faces.semanticStatus).toBe('applied');
      expect(current.edges.semanticStatus).toBe('applied');
      expect(current.faces.entries).toHaveLength(8);
      expect(current.edges.entries).toHaveLength(18);
      const edge = required(current.edges.entries.find(entry => entry.ref.key.startsWith('edge-v2|')));
      const face = required(current.faces.entries.find(entry => entry.ref.key.startsWith('face-v2|')));
      const byV1 = resolveSemanticEdgeReferences(current.edges, [edge.aliases[0]], 'extrude')[0];
      const byV2 = resolveSemanticEdgeReferences(current.edges, [edge.ref], 'extrude')[0];
      expect(byV1.isSame(byV2)).toBe(true);
      expect(() => resolveSemanticEdgeReferences(current.edges, [edge.ref, edge.aliases[0]], 'extrude')).toThrow(/duplicada/);
      expect(() => resolveSemanticSelectedFaces(current.faces, [face.aliases[0], face.ref], 'extrude')).toThrow(/duplicada/);
      // Unclaimed vertical edges/seams retain their existing version instead of receiving invented roles.
      expect(current.edges.entries.filter(entry => entry.ref.key.startsWith('edge-v1|'))).toHaveLength(6);
      const negativeContext: EntityPrismContextV2 = { ...context, history: context.history.map(entry =>
        entry.type === 'extrude' ? { ...entry, direction: 'negative' as const } : entry) };
      expect(preparePrismReferencesV2(plate(), negativeContext, current.owner.provenance)).toMatchObject({ status: 'unavailable' });
      const analyzer = new (getOC().BRepCheck_Analyzer)(current.owner.shape.wrapped, true, false, false);
      try { expect(analyzer.IsValid()).toBe(true); } finally { analyzer.delete(); }
    } finally { current.dispose(); }
  }, 60_000);

  it('rejects deleted/replaced source identity even when current geometry and a v1 alias agree', () => {
    const before = specimen(), profile = plate();
    profile.entities = profile.entities.map(entity => entity.id === 'hole-a' ? { ...entity, id: 'replacement-a' } : entity);
    try {
      const after = specimen(profile);
      try {
        const saved = required(before.references.edges.find(entry => entry.role.entityId === 'hole-a' && entry.role.role === 'startRim')).ref;
        const alias = required(before.edges.entries.find(entry => entry.ref.key === saved.key)).aliases[0];
        expect(resolveSemanticEdgeReferences(after.edges, [alias], 'extrude')).toHaveLength(1);
        expect(() => resolveSemanticEdgeReferences(after.edges, [saved], 'extrude')).toThrow(/identificar/);
        expect(() => resolveSemanticEdgeReferences(before.edges, [{ ...saved, sourceFeatureId: 'another-body' }], 'extrude')).toThrow();
        expect(() => resolveSemanticEdgeReferences(before.edges, [{ ...saved, key: 'edge-v2|' + 'F'.repeat(64) }], 'extrude')).toThrow();
        expect(() => resolveSemanticEdgeReferences(before.edges, [{ ...saved, key: 'edge-v3|' + 'f'.repeat(64) }], 'extrude')).toThrow();
      } finally { after.dispose(); }
    } finally { before.dispose(); }
  }, 60_000);

  it('discards the whole edge overlay when two semantic keys claim the same actual target', () => {
    const current = specimen();
    try {
      const corrupt = { ...current.references, edges: current.references.edges.map((entry, index) =>
        index === 1 ? { ...entry, target: current.references.edges[0].target } : entry) };
      const catalog = createSemanticEdgeCatalog(current.owner.shape, 'extrude', 'legacy-lineage', corrupt);
      try {
        expect(catalog.semanticStatus).toBe('unavailable');
        expect(catalog.entries.every(entry => entry.ref.key.startsWith('edge-v1|'))).toBe(true);
        expect(() => resolveSemanticEdgeReferences(catalog, [current.references.edges[0].ref], 'extrude')).toThrow(/identificar/);
        expect(resolveSemanticEdgeReferences(catalog, [catalog.entries[0].ref], 'extrude')).toHaveLength(1);
      } finally { catalog.dispose(); }
    } finally { current.dispose(); }
  }, 60_000);

  it('owns catalog wrappers independently and copies historical frames without native handles', () => {
    const current = specimen();
    const body = current.owner.takeShape();
    try {
      const rim = required(current.references.edges.find(entry => entry.role.entityId === 'hole-a' && entry.role.role === 'startRim')).ref;
      const cap = required(current.references.faces.find(entry => entry.role.role === 'endCap')).ref;
      const historical = { entries: current.faces.entries.map(({ ref, aliases, frame }) => ({
        ref: { ...ref }, aliases: aliases.map(alias => ({ ...alias })),
        frame: frame ? { origin: [...frame.origin] as [number, number, number],
          normal: [...frame.normal] as [number, number, number], xDirection: [...frame.xDirection] as [number, number, number] } : null,
      })) };
      current.owner.dispose();
      rimBounds(resolveSemanticEdgeReferences(current.edges, [rim], 'extrude')[0], 0, 3, 0);
      current.dispose(); current.dispose();
      const frame = resolveSemanticFaceReference(historical, cap, 'extrude');
      expect(frame.origin).toEqual([0, 0, 4]);
      frame.origin[2] = 123;
      expect(resolveSemanticFaceReference(historical, cap, 'extrude').origin).toEqual([0, 0, 4]);
      expect(historical.entries.every(entry => Object.keys(entry).sort().join(',') === 'aliases,frame,ref')).toBe(true);
    } finally { current.dispose(); body.delete(); }
  }, 60_000);
  it.each(['face', 'edge'] as const)('attempts every owned %s release once when one release reports an error', kind => {
    const current = specimen();
    const catalog = kind === 'face'
      ? createSemanticFaceCatalog(current.owner.shape, 'extrude', 'legacy-lineage', current.references)
      : createSemanticEdgeCatalog(current.owner.shape, 'extrude', 'legacy-lineage', current.references);
    const targets = catalog.entries.map(entry => 'face' in entry ? entry.face : entry.edge);
    const releaseFirst = targets[0].delete.bind(targets[0]);
    const releases = targets.map(target => vi.spyOn(target, 'delete'));
    const notification = new Error('Injected release notification');
    releases[0].mockImplementation(() => { releaseFirst(); throw notification; });
    try {
      let cleanupError: unknown;
      try { catalog.dispose(); } catch (error) { cleanupError = error; }
      expect(cleanupError).toBeInstanceOf(AggregateError);
      expect((cleanupError as AggregateError).errors).toEqual([notification]);
      expect(releases.every(release => release.mock.calls.length === 1)).toBe(true);
      expect(() => catalog.dispose()).not.toThrow();
      expect(releases.every(release => release.mock.calls.length === 1)).toBe(true);
      const analyzer = new (getOC().BRepCheck_Analyzer)(current.owner.shape.wrapped, true, false, false);
      try { expect(analyzer.IsValid()).toBe(true); } finally { analyzer.delete(); }
    } finally { catalog.dispose(); vi.restoreAllMocks(); current.dispose(); }
  }, 60_000);

});
