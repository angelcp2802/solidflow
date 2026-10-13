import type { Edge, Face } from 'replicad';
import { describe, expect, it } from 'vitest';
import {
  resolveSemanticEdgeReferences, resolveSemanticSelectedFaces,
  type SemanticEdgeCatalog, type SemanticFaceCatalog,
} from './kernel.semantic-catalogs';

// Synthetic selection/resolution boundary fixtures only. These targets provide
// referential isSame equality; they are not native shapes or geometric evidence.
// No native runtime is initialized and no model is constructed here.
const sourceFeatureId = 'selection-boundary-source';
function syntheticTarget<T extends Edge | Face>(): T {
  const target = { isSame: (other: unknown): boolean => other === target };
  return target as unknown as T;
}
function edges(count: number): SemanticEdgeCatalog {
  return { semanticStatus: 'absent', dispose() {}, entries: Array.from({ length: count }, (_, index) => ({
    edge: syntheticTarget<Edge>(), ref: { sourceFeatureId, key: `edge-v1|synthetic-boundary-${index}` }, aliases: [],
  })) };
}
function faces(count: number): SemanticFaceCatalog {
  return { semanticStatus: 'absent', dispose() {}, entries: Array.from({ length: count }, (_, index) => ({
    face: syntheticTarget<Face>(), ref: { sourceFeatureId, key: `face-v1|synthetic-boundary-${index}` },
    aliases: [], frame: null,
  })) };
}

describe('semantic selection bounds with synthetic referential targets', () => {
  it('resolves 257 distinct edges within the existing edge selection limit', () => {
    const catalog = edges(257);
    const resolved = resolveSemanticEdgeReferences(catalog, catalog.entries.map(entry => entry.ref), sourceFeatureId);
    expect(resolved).toHaveLength(257);
    expect(resolved.every((target, index) => target === catalog.entries[index].edge)).toBe(true);
  });
  it('rejects 4097 edges with the precise edge limit', () => {
    const catalog = edges(4097);
    expect(() => resolveSemanticEdgeReferences(catalog, catalog.entries.map(entry => entry.ref), sourceFeatureId))
      .toThrow('Selecciona entre 1 y 4096 aristas para esta operación.');
  });
  it('resolves 256 distinct faces within the existing face selection limit', () => {
    const catalog = faces(256);
    const resolved = resolveSemanticSelectedFaces(catalog, catalog.entries.map(entry => entry.ref), sourceFeatureId);
    expect(resolved).toHaveLength(256);
    expect(resolved.every((target, index) => target === catalog.entries[index].face)).toBe(true);
  });
  it('rejects 257 faces with the precise face limit', () => {
    const catalog = faces(257);
    expect(() => resolveSemanticSelectedFaces(catalog, catalog.entries.map(entry => entry.ref), sourceFeatureId))
      .toThrow('Selecciona como máximo 256 caras.');
  });
});
