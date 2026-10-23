import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { cast, Shape, getOC, makeBox, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { ownedNativeTopology } from './kernel.native-topology';
import { NativeCleanupError, withNativeOwners, type NativeOwner, type NativeOwners } from './kernel.native-ownership';
import * as ownership from './kernel.native-ownership';
import { CadEngine } from './kernel.engine';
import { NativeBodyCatalog, validateBodyShape } from './kernel.bodies';
import { validateAssemblyShape } from './kernel.assembly-placements';
import type { Feature } from './kernel.types';

// Original Cartesian box; fault adapters delegate real native queries/releases.
// Returned downcasts and every raw Current handle have separate lifetimes.
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(
  createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000);
const CONTEXT = 'Native topology enumeration or release failed.';
interface Observation { value: NativeOwner; kind: 'explorer' | 'raw' | 'result'; releases: number }
function observe<T>(records: Observation[], patch: (record: Observation) => void, operation: () => T): T {
  const real = ownership.withNativeOwners;
  const replacement: typeof real = <R>(action: (owners: NativeOwners) => R,
    retained: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => real(owners => {
      if (context === CONTEXT) {
        const own = owners.own.bind(owners);
        owners.own = <S extends NativeOwner>(value: S): S => {
          const record: Observation = { value, releases: 0, kind: value instanceof Shape ? 'result'
            : 'More' in value ? 'explorer' : 'raw' };
          records.push(record); patch(record);
          const release = value.delete.bind(value);
          Object.defineProperty(value, 'delete', { configurable: true, value: () => { record.releases++; release(); } });
          return own(value);
        };
      }
      return action(owners);
    }, retained, context);
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(replacement);
  try { return operation(); } finally { spy.mockRestore(); }
}
function sourceValid(source: Shape3D): void {
  withNativeOwners(owners => {
    expect(owners.own(new (getOC().BRepCheck_Analyzer)(source.wrapped, true, false, false)).IsValid()).toBe(true);
    owners.own(source.boundingBox).bounds.forEach((side, index) => side.forEach((value, axis) =>
      expect(Math.abs(value - [[0, 0, 0], [2, 3, 4]][index][axis])).toBeLessThan(1e-6)));
  });
}
function caught(operation: () => unknown): unknown { try { operation(); } catch (error) { return error; } return undefined; }

it.each([{ kind: 'face' as const, count: 6 }, { kind: 'edge' as const, count: 12 },
  { kind: 'solid' as const, count: 1 }, { kind: 'wire' as const, count: 6 }])(
  'returns $count independently owned unique box $kind wrappers after releasing all raw explorer values', ({ kind, count }) => withNativeOwners(owners => {
    const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), records: Observation[] = [];
    const result = observe(records, () => {}, () => ownedNativeTopology(source, kind)); owners.ownAll(result);
    expect(result).toHaveLength(count); expect(records.filter(record => record.kind === 'result')).toHaveLength(count);
    for (const record of records) expect(record.releases).toBe(record.kind === 'result' ? 0 : 1);
    result.forEach((value, index) => {
      expect(value.wrapped.IsNull()).toBe(false);
      expect(result.slice(0, index).some(previous => previous.isSame(value))).toBe(false);
    });
    // A box exposes each of its twelve shared edges in more than one face.
    if (kind === 'edge') expect(records.filter(record => record.kind === 'raw').length).toBeGreaterThan(count);
    result.forEach(value => owners.release(value));
    records.forEach(record => expect(record.releases).toBe(1)); sourceValid(source);
  }), 60_000);

it('preserves explorer encounter order while releasing duplicate Current handles', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), oc = getOC(), records: Observation[] = [];
  // A fresh native explorer supplies the order oracle without calling the helper.
  const explorer = owners.own(new oc.TopExp_Explorer(source.wrapped, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
  const expected: ReturnType<typeof explorer.Current>[] = [];
  while (explorer.More()) {
    const raw = owners.own(explorer.Current());
    if (!expected.some(value => value.IsSame(raw))) expected.push(raw);
    explorer.Next();
  }
  const result = observe(records, () => {}, () => ownedNativeTopology(source, 'edge')); owners.ownAll(result);
  expect(result).toHaveLength(expected.length);
  result.forEach((value, index) => expect(value.wrapped.IsSame(expected[index])).toBe(true));
  expect(records.filter(record => record.kind === 'raw').length).toBeGreaterThan(result.length); sourceValid(source);
}), 60_000);

it('releases every acquired raw and downcast wrapper after a real explorer advancement fails', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), records: Observation[] = [], primary = new Error('Original explorer advancement failure');
  let advances = 0;
  const failure = caught(() => observe(records, record => {
    if (record.kind !== 'explorer') return;
    const explorer = record.value as InstanceType<ReturnType<typeof getOC>['TopExp_Explorer']>, advance = explorer.Next.bind(explorer);
    Object.defineProperty(explorer, 'Next', { configurable: true, value: () => { advance(); advances++; throw primary; } });
  }, () => ownedNativeTopology(source, 'edge')));
  expect(failure).toBe(primary); expect(advances).toBe(1);
  expect(records.filter(record => record.kind === 'raw')).toHaveLength(1);
  expect(records.filter(record => record.kind === 'result')).toHaveLength(1);
  records.forEach(record => expect(record.releases).toBe(1)); sourceValid(source);
}), 60_000);

it('withholds all result wrappers and attempts every raw release when one physical raw deletion reports failure', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), records: Observation[] = [], cleanup = new Error('Original topology Current cleanup failure');
  let patched = false;
  const failure = caught(() => observe(records, record => {
    if (record.kind !== 'raw' || patched) return;
    patched = true; const release = record.value.delete.bind(record.value);
    Object.defineProperty(record.value, 'delete', { configurable: true, value: () => { release(); throw cleanup; } });
  }, () => ownedNativeTopology(source, 'edge')));
  expect(failure).toBeInstanceOf(NativeCleanupError); expect((failure as Error).cause).toBe(cleanup);
  expect(records.filter(record => record.kind === 'result')).toHaveLength(12);
  expect(records.filter(record => record.kind === 'raw').length).toBeGreaterThan(12);
  records.forEach(record => expect(record.releases).toBe(1)); sourceValid(source);
}), 60_000);

interface ActualSolidCurrent {
  value: NativeOwner;
  releases: number;
  kind: 'solid-current' | 'compound-builder' | 'raw-compound' | 'primitive-face-builder'
    | 'raw-primitive-face' | 'primitive-vector' | 'primitive-prism-builder' | 'raw-primitive-prism';
}
type ActualExplorer = InstanceType<ReturnType<typeof getOC>['TopExp_Explorer']>;
type ActualCompoundBuilder = InstanceType<ReturnType<typeof getOC>['TopoDS_Builder']>;
type ActualFaceBuilder = InstanceType<ReturnType<typeof getOC>['BRepBuilderAPI_MakeFace']>;
type ActualPrismBuilder = InstanceType<ReturnType<typeof getOC>['BRepPrimAPI_MakePrism']>;
type ActualVector = InstanceType<ReturnType<typeof getOC>['gp_Vec']>;
/** Observe actual native allocations. Prototype delete observers are installed
 * BEFORE construction/adoption, so NativeOwners' captured bound delete methods
 * are counted too. The final fallback only cleans leaks after assertions. */
function observeActualSolidCurrents<T>(operation: (records: ActualSolidCurrent[]) => T,
  reportPrismCompletion: (completed: boolean) => boolean = completed => completed): T {
  return withNativeOwners(observationOwners => {
    const oc = getOC(), records: ActualSolidCurrent[] = [],
      builderRecords = new WeakMap<object, ActualSolidCurrent>(), compoundRecords = new WeakMap<object, ActualSolidCurrent>(),
      faceBuilderRecords = new WeakMap<object, ActualSolidCurrent>(), prismBuilderRecords = new WeakMap<object, ActualSolidCurrent>(),
      vectorRecords = new WeakMap<object, ActualSolidCurrent>(),
      actualCurrent = oc.TopExp_Explorer.prototype.Current, actualMake = oc.TopoDS_Builder.prototype.MakeCompound,
      actualBuilderDelete = oc.TopoDS_Builder.prototype.delete, actualCompoundDelete = oc.TopoDS_Compound.prototype.delete,
      actualFace = oc.BRepBuilderAPI_MakeFace.prototype.Face, actualFaceDelete = oc.BRepBuilderAPI_MakeFace.prototype.delete,
      actualPrismShape = oc.BRepPrimAPI_MakePrism.prototype.Shape, actualPrismDone = oc.BRepPrimAPI_MakePrism.prototype.IsDone,
      actualPrismDelete = oc.BRepPrimAPI_MakePrism.prototype.delete,
      actualVectorMultiply = oc.gp_Vec.prototype.Multiply, actualVectorDelete = oc.gp_Vec.prototype.delete,
      spies: { mockRestore(): void }[] = [];
    const retainObservation = (value: NativeOwner, kind: ActualSolidCurrent['kind']): ActualSolidCurrent => {
      const record: ActualSolidCurrent = { value, releases: 0, kind };
      records.push(record);
      observationOwners.own({ delete: () => { if (record.releases === 0) value.delete(); } });
      return record;
    };
    const observeRaw = <R extends NativeOwner>(raw: R, kind: ActualSolidCurrent['kind']): R => {
      const record = retainObservation(raw, kind), release = raw.delete.bind(raw);
      Object.defineProperty(raw, 'delete', { configurable: true, value: () => { record.releases++; release(); } });
      return raw;
    };
    try {
      spies.push(vi.spyOn(oc.TopoDS_Builder.prototype, 'delete').mockImplementation(function (this: ActualCompoundBuilder) {
        const record = builderRecords.get(this); if (record) record.releases++;
        actualBuilderDelete.call(this);
      }));
      spies.push(vi.spyOn(oc.TopoDS_Compound.prototype, 'delete').mockImplementation(function (this: InstanceType<ReturnType<typeof getOC>['TopoDS_Compound']>) {
        const record = compoundRecords.get(this); if (record) record.releases++;
        actualCompoundDelete.call(this);
      }));
      spies.push(vi.spyOn(oc.BRepBuilderAPI_MakeFace.prototype, 'delete').mockImplementation(function (this: ActualFaceBuilder) {
        const record = faceBuilderRecords.get(this); if (record) record.releases++;
        actualFaceDelete.call(this);
      }));
      spies.push(vi.spyOn(oc.BRepPrimAPI_MakePrism.prototype, 'delete').mockImplementation(function (this: ActualPrismBuilder) {
        const record = prismBuilderRecords.get(this); if (record) record.releases++;
        actualPrismDelete.call(this);
      }));
      spies.push(vi.spyOn(oc.gp_Vec.prototype, 'delete').mockImplementation(function (this: ActualVector) {
        const record = vectorRecords.get(this); if (record) record.releases++;
        actualVectorDelete.call(this);
      }));
      spies.push(vi.spyOn(oc.BRepBuilderAPI_MakeFace.prototype, 'Face').mockImplementation(function (this: ActualFaceBuilder) {
        if (!faceBuilderRecords.has(this)) faceBuilderRecords.set(this, retainObservation(this, 'primitive-face-builder'));
        return observeRaw(actualFace.call(this), 'raw-primitive-face');
      }));
      spies.push(vi.spyOn(oc.gp_Vec.prototype, 'Multiply').mockImplementation(function (this: ActualVector, ...args: Parameters<ActualVector['Multiply']>) {
        if (!vectorRecords.has(this)) vectorRecords.set(this, retainObservation(this, 'primitive-vector'));
        return actualVectorMultiply.apply(this, args);
      }));
      spies.push(vi.spyOn(oc.BRepPrimAPI_MakePrism.prototype, 'IsDone').mockImplementation(function (this: ActualPrismBuilder) {
        if (!prismBuilderRecords.has(this)) prismBuilderRecords.set(this, retainObservation(this, 'primitive-prism-builder'));
        return reportPrismCompletion(actualPrismDone.call(this));
      }));
      spies.push(vi.spyOn(oc.BRepPrimAPI_MakePrism.prototype, 'Shape').mockImplementation(function (this: ActualPrismBuilder) {
        return observeRaw(actualPrismShape.call(this), 'raw-primitive-prism');
      }));
      spies.push(vi.spyOn(oc.TopoDS_Builder.prototype, 'MakeCompound').mockImplementation(function (this: ActualCompoundBuilder, ...args: Parameters<ActualCompoundBuilder['MakeCompound']>) {
        if (!builderRecords.has(this)) builderRecords.set(this, retainObservation(this, 'compound-builder'));
        if (!compoundRecords.has(args[0])) compoundRecords.set(args[0], retainObservation(args[0], 'raw-compound'));
        return actualMake.apply(this, args);
      }));
      spies.push(vi.spyOn(oc.TopExp_Explorer.prototype, 'Current').mockImplementation(function (this: ActualExplorer) {
        const raw = actualCurrent.call(this);
        if (raw.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_SOLID) return raw;
        return observeRaw(raw, 'solid-current');
      }));
      return operation(records);
    } finally { for (const spy of [...spies].reverse()) spy.mockRestore(); }
  }, undefined, 'Actual native allocation observation or fallback cleanup failed.');
}
function assertActualSolidCurrentReleases(records: ActualSolidCurrent[]): void {
  expect(records.some(record => record.kind === 'solid-current')).toBe(true);
  records.forEach(record => expect(record.releases).toBe(1));
}
function assertPrimitiveOwnerReleases(records: ActualSolidCurrent[], completed: boolean): void {
  for (const kind of ['primitive-face-builder', 'raw-primitive-face', 'primitive-vector', 'primitive-prism-builder'] as const) {
    expect(records.some(record => record.kind === kind)).toBe(true);
  }
  expect(records.some(record => record.kind === 'raw-primitive-prism')).toBe(completed);
  records.forEach(record => expect(record.releases).toBe(1));
}

it('releases real raw solid values after repeated body and assembly validation while preserving their borrowed source', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4]));
  observeActualSolidCurrents(records => {
    for (let repeat = 0; repeat < 3; repeat++) {
      expect(validateBodyShape(source)).toBeGreaterThan(0);
      expect(validateAssemblyShape(source)).toBe(1);
      assertActualSolidCurrentReleases(records);
      sourceValid(source);
    }
    expect(records.length).toBeGreaterThanOrEqual(6);
  });
  sourceValid(source);
}), 60_000);

it('releases actual raw solids when a genuine downstream multi-solid validation rejects, preserving the compound and borrowed solids', () => withNativeOwners(owners => {
  const first = owners.own(makeBox([0, 0, 0], [2, 3, 4])), second = owners.own(makeBox([10, 0, 0], [12, 3, 4])), oc = getOC(),
    builder = owners.own(new oc.TopoDS_Builder()), raw = owners.own(new oc.TopoDS_Compound());
  builder.MakeCompound(raw); builder.Add(raw, first.wrapped); builder.Add(raw, second.wrapped);
  const compound = owners.own(cast(raw)).asShape3D();
  observeActualSolidCurrents(records => {
    expect(() => validateBodyShape(compound)).toThrow('exactamente un sólido');
    expect(records).toHaveLength(2);
    assertActualSolidCurrentReleases(records);
    expect(owners.own(new oc.BRepCheck_Analyzer(compound.wrapped, true, false, false)).IsValid()).toBe(true);
    sourceValid(first);
  });
  sourceValid(first);
  expect(owners.own(new oc.BRepCheck_Analyzer(second.wrapped, true, false, false)).IsValid()).toBe(true);
}), 60_000);

it.each(['render', 'references'] as const)('releases every actual raw solid through a real %s CAD rebuild, aggregate staging, native copy and disposal', mode => withNativeOwners(owners => {
  // Original Cartesian 2x3x4 explicit prism; expected bounds match sourceValid.
  const features: Feature[] = [
    { id: 'solid-owner-profile', type: 'sketch', name: 'Original 2x3 ownership rectangle', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [1, 1.5], width: 2, height: 3 } },
    { id: 'solid-owner-prism', type: 'extrude', name: 'Original 4 mm ownership prism', suppressed: false, sketchId: 'solid-owner-profile',
      depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'solid-owner-body' } },
  ];
  const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() });
  observeActualSolidCurrents(records => {
    const reference = mode === 'render' ? (() => {
      const result = engine.build(features); expect(result.featureErrors).toEqual([]); expect(result.bodies).toHaveLength(1);
      return result.bodies![0].ref;
    })() : (() => {
      const result = engine.rebuildForAssemblyReferences(features); expect(result.featureErrors).toEqual([]);
      if (result.kind !== 'explicit') throw new Error('Original explicit body inventory required');
      expect(result.bodies).toHaveLength(1); return result.bodies[0].ref;
    })();
    const copy = owners.own(engine.copyCurrentBodyShape(reference));
    engine.dispose();
    expect(records.some(record => record.kind === 'compound-builder')).toBe(true);
    expect(records.some(record => record.kind === 'raw-compound')).toBe(true);
    assertActualSolidCurrentReleases(records);
    assertPrimitiveOwnerReleases(records, true);
    sourceValid(copy);
  });
}), 60_000);


it('releases actual staged compound owners when a real native Add succeeds and then reports failure, preserving the source and empty catalog', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), catalog = new NativeBodyCatalog(), primary = new Error('Original staged native Add failure');
  owners.own({ delete: () => catalog.dispose() });
  expect(catalog.entries()).toEqual([]);
  observeActualSolidCurrents(records => {
    const oc = getOC(), actualAdd = oc.TopoDS_Builder.prototype.Add; let injected = false;
    const add = vi.spyOn(oc.TopoDS_Builder.prototype, 'Add').mockImplementation(function (this: ActualCompoundBuilder, ...args: Parameters<ActualCompoundBuilder['Add']>) {
      const result = actualAdd.apply(this, args);
      if (!injected && records.some(record => record.kind === 'compound-builder' && record.value === this)) {
        injected = true; throw primary;
      }
      return result;
    });
    try {
      const failure = caught(() => catalog.stageNew({ ref: { bodyId: 'staged-owner-body', sourceFeatureId: 'staged-owner-feature' },
        createdByFeatureId: 'staged-owner-feature', name: 'Original staged box', lineage: 'original-staged-owner-lineage' }, source));
      expect(injected).toBe(true); expect(failure).toBe(primary);
      expect(records.some(record => record.kind === 'compound-builder')).toBe(true);
      expect(records.some(record => record.kind === 'raw-compound')).toBe(true);
      assertActualSolidCurrentReleases(records);
      expect(catalog.entries()).toEqual([]);
      sourceValid(source);
    } finally { add.mockRestore(); }
  });
  sourceValid(source);
}), 60_000);

it('releases primitive face, vector and prism owners after a real prism completes but its completion query rejects, preserving input and withholding current authority', () => withNativeOwners(owners => {
  const features: Feature[] = [
    { id: 'failed-owner-profile', type: 'sketch', name: 'Original 2x3 failure rectangle', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [1, 1.5], width: 2, height: 3 } },
    { id: 'failed-owner-prism', type: 'extrude', name: 'Original 4 mm failure prism', suppressed: false, sketchId: 'failed-owner-profile',
      depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'failed-owner-body' } },
  ];
  const before = JSON.stringify(features), engine = new CadEngine(); owners.own({ delete: () => engine.dispose() });
  let injected = false, nativeCompleted = false;
  observeActualSolidCurrents(records => {
    const result = engine.build(features);
    expect(injected).toBe(true); expect(nativeCompleted).toBe(true);
    expect(result.featureErrors).toHaveLength(1);
    expect(result.featureErrors[0]).toMatchObject({ id: 'failed-owner-prism', message: 'OpenCascade no ha completado la extrusión.' });
    expect(result.vertices).toEqual([]); expect(result.bodies ?? []).toEqual([]);
    expect(JSON.stringify(features)).toBe(before);
    expect(() => engine.copyCurrentBodyShape({ bodyId: 'failed-owner-body', sourceFeatureId: 'failed-owner-prism' })).toThrow('reconstrucción completa y vigente');
    engine.dispose();
    // The fault follows the actual native construction/IsDone query and
    // precedes Shape(), so it never loses a test-created unreturned raw result.
    assertPrimitiveOwnerReleases(records, false);
  }, completed => {
    if (!injected) { injected = true; nativeCompleted = completed; return false; }
    return completed;
  });
}), 60_000);
