import { describe, expect, it } from 'vitest';
import type { Feature, LoftFeature, SketchFeature, SweepFeature } from '../cad/kernel.types';
import { buildPartFeatureTree, partTreeChildrenId, revealPartSketchOwners, treeOccurrenceKey } from './partFeatureTree';
import { validateDocument } from './document';

// Original declarations for tree presentation, including unresolved inputs; no geometry claims.
const sketch = (id: string, name = id): SketchFeature => ({ id, name, type: 'sketch', plane: 'XY',
  offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [0, 0], width: 2, height: 2 } });
const extrude = (id: string, sketchId: string): Feature => ({ id, name: id, type: 'extrude', sketchId,
  depth: 4, symmetric: false, suppressed: false });
const sweep = (profileSketchId: string, pathSketchId: string): SweepFeature => ({ id: 'sweep', name: 'Sweep',
  type: 'sweep', suppressed: false, profileSketchId, pathSketchId, path: [], orientation: 'followPath', merge: true });
const loft = (...ids: string[]): LoftFeature => ({ id: 'loft', name: 'Loft', type: 'loft', suppressed: false,
  sections: ids.map(sketchId => ({ sketchId, startEntityId: null, reversed: false })), ruled: false, merge: true });

describe('part feature tree presentation', () => {
  it('keeps unused sketches at the root and shared profiles beneath each owner in document order', () => {
    const shared = sketch('shared'), unused = sketch('unused');
    const first = extrude('first', shared.id), second = { ...extrude('second', shared.id), suppressed: true };
    const groups = buildPartFeatureTree([shared, first, unused, second], new Set(['first']), '');
    expect(groups.map(group => group.feature.id)).toEqual(['first', 'unused', 'second']);
    expect(groups.map(group => group.children)).toEqual([[shared], [], [shared]]);
    expect(groups.map(group => group.expanded)).toEqual([true, false, false]);
    expect(groups.every(group => !group.forcedOpen)).toBe(true);
    expect(groups[2].feature.suppressed).toBe(true);
  });

  it('deduplicates sweep and loft inputs, preserving input order and excluding missing or non-sketch references', () => {
    const a = sketch('a'), b = sketch('b'), body = extrude('body', 'a');
    const features = [a, b, body, sweep('b', 'b'), loft('b', 'missing', 'a', 'b', 'body')];
    const groups = buildPartFeatureTree(features, new Set(['sweep', 'loft']), '');
    expect(groups.map(group => [group.feature.id, group.children.map(child => child.id)]))
      .toEqual([['body', ['a']], ['sweep', ['b']], ['loft', ['b', 'a']]]);
    expect(buildPartFeatureTree([a, b, sweep('b', 'a')], new Set(), '')[0].children).toEqual([b, a]);
  });

  it('opens all inputs for a matching parent and only matching inputs for a child search', () => {
    const profile = sketch('profile', 'Ring profile'), path = sketch('path', 'Guide path');
    const features = [profile, path, sweep(profile.id, path.id), sketch('unused', 'Ring spare')];
    const parentMatch = buildPartFeatureTree(features, new Set(), '  sWeEp  ');
    expect(parentMatch).toHaveLength(1);
    expect(parentMatch[0]).toMatchObject({ children: [profile, path], expanded: true, forcedOpen: true });
    const childMatch = buildPartFeatureTree(features, new Set(), ' RING ');
    expect(childMatch.map(group => group.feature.id)).toEqual(['sweep', 'unused']);
    expect(childMatch[0]).toMatchObject({ children: [profile], expanded: true, forcedOpen: true });
    expect(childMatch[1]).toMatchObject({ children: [], expanded: false, forcedOpen: false });
    expect(buildPartFeatureTree(features, new Set(), 'absent')).toEqual([]);
  });

  it('restores persisted expansion after filtering without mutating features or the supplied set', () => {
    const features = [sketch('a'), sketch('b'), extrude('first', 'a'), extrude('second', 'b')];
    const original = structuredClone(features), expanded = new Set(['first', 'stale-id']);
    expect(buildPartFeatureTree(features, expanded, 'second')[0].expanded).toBe(true);
    const cleared = buildPartFeatureTree(features, expanded, '   ');
    expect(cleared.map(group => group.expanded)).toEqual([true, false]);
    expect(cleared.every(group => !group.forcedOpen)).toBe(true);
    expect([...expanded]).toEqual(['first', 'stale-id']);
    expect(features).toEqual(original);
    expect(buildPartFeatureTree([sketch('leaf')], new Set(['leaf']), '')[0].expanded).toBe(false);
  });

  it('identifies occurrences independently of delimiters and distinguishes root and shared child occurrences', () => {
    const keys = [treeOccurrenceKey('shared'), treeOccurrenceKey('shared', 'first'),
      treeOccurrenceKey('shared', 'second'), treeOccurrenceKey('a:b', 'c'), treeOccurrenceKey('b', 'c:a')];
    expect(new Set(keys).size).toBe(keys.length);
    expect(JSON.parse(keys[0])).toEqual([null, 'shared']);
    expect(JSON.parse(keys[1])).toEqual(['first', 'shared']);
  });

  it('reveals a valid preferred owner or all owners in order without inventing ownership', () => {
    const features = [sketch('shared'), sketch('unused'), extrude('first', 'shared'),
      sweep('shared', 'shared'), loft('shared'), extrude('dangling', 'missing')];
    expect(revealPartSketchOwners(features, 'shared')).toEqual(['first', 'sweep', 'loft']);
    expect(revealPartSketchOwners(features, 'shared', 'sweep')).toEqual(['sweep']);
    expect(revealPartSketchOwners(features, 'shared', 'unused')).toEqual(['first', 'sweep', 'loft']);
    expect(revealPartSketchOwners(features, 'unused')).toEqual([]);
    expect(revealPartSketchOwners(features, 'missing')).toEqual([]);
    expect(revealPartSketchOwners(features, 'first')).toEqual([]);
  });

  it('creates lossless, distinct ARIA container IDs for every accepted text representation', () => {
    const ids = ['with spaces', 'punctuation:[]/"%#', 'perfil-ñ-中-😀', '\ud800', '\udfff', '\\ud800', '%22', '"'];
    const doc = validateDocument({ version: 1, id: 'tree-text-identities', name: 'Tree text identities', units: 'mm',
      createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z',
      features: [sketch('profile'), ...ids.map(id => extrude(id, 'profile'))] });
    const groups = buildPartFeatureTree(doc.features, new Set(), '');
    expect(groups.map(group => group.feature.id)).toEqual(ids);
    const containers = groups.map(group => partTreeChildrenId(group.feature.id));
    expect(new Set(containers).size).toBe(ids.length);
    expect(containers.every(id => !/\s/.test(id))).toBe(true);
    expect(containers.map(id => JSON.parse(decodeURIComponent(id.slice('part-tree-children-'.length)))))
      .toEqual(ids);
  });
});
