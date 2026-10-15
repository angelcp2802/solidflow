import { expect, it, vi } from 'vitest';
import { CadEngine } from './kernel.engine';
import * as solves from './kernel.sketch-solves';
import type { CadResult, Feature, RepetitionFeature, SketchFeature } from './kernel.types';

// Actual sketch-only engine calls. No OC initialization, native body, CAD stub,
// alternate solver, timeout setting or subprocess is used by these cases.
function source(id: string): SketchFeature {
  return { id, type: 'sketch', name: 'Original raw-boundary circle', suppressed: false, plane: 'XY', offset: 0,
    profile: { kind: 'entities', points: [{ id: 'c', x: 3, y: 0 }],
      entities: [{ id: 'circle', type: 'circle', center: 'c', radius: 1, construction: false }],
      constraints: [{ id: 'fix', type: 'fix', pointId: 'c', x: 3, y: 0 },
        { id: 'radius', type: 'radius', entityId: 'circle', value: 2 }] } };
}
type Issued = { id: string; result: solves.SourceSketchStageResult; view?: solves.SourceSketchSolveView };
function realBuild(features: Feature[], check: (result: CadResult, issued: Issued[]) => void): void {
  const engine = new CadEngine(), realFactory = solves.createSourceSketchSolveRegistry, issued: Issued[] = [];
  const observer = vi.spyOn(solves, 'createSourceSketchSolveRegistry').mockImplementation((definitions, context) => {
    const controller = realFactory(definitions, context);
    return { ...controller, solveAndStage(...args: Parameters<typeof controller.solveAndStage>) {
      const result = controller.solveAndStage(...args);
      const view = result.kind === 'staged' && result.handle ? controller.reader.read(result.handle, definitions) : undefined;
      issued.push({ id: args[0].id, result, view });
      return result;
    } };
  });
  let primary: { error: unknown } | undefined;
  try { check(engine.build(features), issued); } catch (error) { primary = { error }; }
  observer.mockRestore();
  try { engine.dispose(); } catch (error) {
    throw new AggregateError(primary ? [primary.error, error] : [error], 'Original raw-boundary fixture or release failed.',
      { cause: primary?.error ?? error });
  }
  if (primary) throw primary.error;
}
function expectCircle(result: CadResult, id: string): void {
  const visual = result.sketches?.find(item => item.id === id);
  expect(visual).toBeDefined();
  expect(visual!.frame).toEqual({ origin: [0, 0, 0], xDirection: [1, 0, 0], normal: [0, 0, 1] });
  expect(visual!.lines.length).toBeGreaterThan(6);
  for (let offset = 0; offset < visual!.lines.length; offset += 3) {
    const [x, y, z] = visual!.lines.slice(offset, offset + 3);
    expect(Math.abs((x - 3) ** 2 + y ** 2 - 4)).toBeLessThan(1e-6);
    expect(z).toBe(0);
  }
}

it('keeps a rejected pattern getter unread and preserves only its already reconstructed prefix', () => {
  const first = source('first-source'), last = source('later-source');
  let getterReads = 0;
  const operation = { mode: 'regenerate' as const, scope: 'selected' as const,
    targets: [{ bodyId: 'missing-body', sourceFeatureId: 'missing-feature' }],
    bindings: [{ source: { bodyId: 'missing-body', sourceFeatureId: 'missing-feature' }, targetBodyIds: ['missing-body'] }],
    referencePolicies: [], variation: { kind: 'none' as const } };
  Object.defineProperty(operation, 'referencePolicies', { enumerable: true, get() {
    getterReads++; throw new Error('Must not evaluate rejected pattern getter.');
  } });
  const bad: RepetitionFeature = { id: 'rejected-pattern', type: 'linearPattern', name: 'Raw rejected declaration', suppressed: false,
    baseFeatureId: 'missing-feature', source: { mode: 'features', featureIds: ['missing-feature'], geometryPattern: false },
    featurePattern: operation, first: { direction: [1, 0, 0], spacing: 3, count: 2 }, second: null,
    secondSeedOnly: false, skipped: [] };
  realBuild([first, bad, last], (result, issued) => {
    expect(getterReads).toBe(0);
    expect(result.featureErrors).toHaveLength(1);
    expect(result.featureErrors[0].id).toBe(bad.id);
    expect(result.sketches?.map(item => item.id)).toEqual([first.id]);
    expectCircle(result, first.id);
    expect(issued).toHaveLength(1);
    expect(issued[0].id).toBe(first.id);
    expect(issued[0].result.kind).toBe('staged');
    if (issued[0].result.kind !== 'staged') throw new Error('First source must stage.');
    expect(issued[0].result.handle).not.toBeNull();
    expect(issued[0].view!.result.status).toBe('fullyDefined');
  });
});

it('does not evaluate an ignored getter of a later suppressed raw sketch', () => {
  const first = source('first-source'), suppressed = source('suppressed-source');
  suppressed.suppressed = true;
  let getterReads = 0;
  Object.defineProperty(suppressed, 'ignoredRawExtra', { enumerable: true, get() {
    getterReads++; throw new Error('Suppressed extra getter must remain unread.');
  } });
  realBuild([first, suppressed], (result, issued) => {
    expect(getterReads).toBe(0); expect(result.featureErrors).toEqual([]);
    expectCircle(result, first.id);
    expect(result.sketches?.map(item => item.id)).toEqual([first.id]);
    expect(issued).toHaveLength(1);
    expect(issued[0].result.kind).toBe('staged');
    if (issued[0].result.kind !== 'staged') throw new Error('First source must stage.');
    expect(issued[0].result.handle).not.toBeNull();
  });
});

it('preserves an ordinary raw noncloneable extra while withholding its solve certificate', () => {
  const feature = source('function-extra-source'), independent = source('independent-source');
  const ignored = () => 'Original raw extra';
  Object.defineProperty(feature, 'ignoredRawExtra', { enumerable: true, value: ignored });
  realBuild([feature, independent], (result, issued) => {
    expect(result.featureErrors).toEqual([]);
    expect(result.sketches?.map(item => item.id)).toEqual([feature.id, independent.id]);
    expectCircle(result, feature.id); expectCircle(result, independent.id);
    expect(Object.getOwnPropertyDescriptor(feature, 'ignoredRawExtra')!.value).toBe(ignored);
    expect(issued).toHaveLength(2);
    expect(issued).toMatchObject([
      { id: feature.id, result: { kind: 'staged', handle: null } },
      { id: independent.id, result: { kind: 'staged', handle: null } },
    ]);
  });
});

it('keeps a throwing ordinary source getter local and never constructs sketches after its error', () => {
  const first = source('first-source'), bad = source('throwing-source'), last = source('later-source');
  const primary = new Error('Original ordinary source getter failed.');
  let getterReads = 0;
  Object.defineProperty(bad, 'ordinaryRawExtra', { enumerable: true, get() { getterReads++; throw primary; } });
  realBuild([first, bad, last], (result, issued) => {
    expect(getterReads).toBe(1);
    expect(result.featureErrors).toEqual([{ id: bad.id, message: primary.message }]);
    expect(result.sketches?.map(item => item.id)).toEqual([first.id]);
    expectCircle(result, first.id);
    expect(issued).toHaveLength(1);
    expect(issued[0].id).toBe(first.id);
    expect(issued[0].result.kind).toBe('staged');
    if (issued[0].result.kind !== 'staged') throw new Error('First source must stage.');
    expect(issued[0].result.handle).not.toBeNull();
    expect(issued[0].view!.result.status).toBe('fullyDefined');
  });
});
