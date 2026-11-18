import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { cast, getOC, setOC, Shape, type AnyShape, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { NativeCleanupError, withNativeOwners, type NativeOwner, type NativeOwners } from './kernel.native-ownership';
import * as ownership from './kernel.native-ownership';
import { ownedNativeTopology } from './kernel.native-topology';
import { NativeValidationContextError, withNativeValidationContext, type NativeValidationContext } from './kernel.native-validation';
import { NativeBodyCatalog, type NativeBodyEntry, type NativeBodyMetadata, type NativeBodyTransaction } from './kernel.bodies';
import { CadEngine } from './kernel.engine';
import { validateAssemblyShape } from './kernel.assembly-placements';
import type { Feature } from './kernel.types';

// Original synthetic geometry and analytical expectations are documented in
// docs/PROVENANCE.md. Fault adapters delegate actual native calls/deletes before
// throwing; native validity is never substituted.
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(
  createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000);
const CONTEXT = 'Native validation context or analyzer release failed.';
type Analyzer = InstanceType<ReturnType<typeof getOC>['BRepCheck_Analyzer']>;
type RawShape = Shape3D['wrapped'];
type EventKind = 'Init' | 'IsValid' | 'IsParallel' | 'IsExactMethod' | 'delete';
interface Record {
  value: Analyzer; releases: number; physicalDeletes: number; fallbackReleases: number;
  calls: { kind: EventKind; value?: unknown; target?: RawShape }[];
  allTargetsLiveAtDelete: boolean;
}
interface Event { kind: EventKind; call: number; value?: unknown; target?: RawShape }

function caught(operation: () => unknown): { error: unknown } {
  try { operation(); } catch (error) { return { error }; }
  throw new Error('Expected the operation to fail.');
}
function leaves(error: unknown): unknown[] {
  return error instanceof AggregateError ? [...error.errors].flatMap(leaves) : [error];
}
function released(records: Record[]): void {
  for (const record of records) {
    expect(record.releases).toBe(1); expect(record.physicalDeletes).toBe(1);
    expect(record.fallbackReleases).toBe(0); expect(record.allTargetsLiveAtDelete).toBe(true);
  }
}
/** Fallback is after assertions and separately counted: it cannot repair a pass. */
function observe<T>(operation: (records: Record[]) => T,
  hook: (record: Record, event: Event) => void = () => {}, beforeRetire: (record: Record) => void = () => {},
  observeArena: (owners: NativeOwners, context?: string) => void = () => {}): T {
  return withNativeOwners(fallback => {
    const real = ownership.withNativeOwners, oc = getOC(), records: Record[] = [];
    const replacement: typeof real = <R>(action: (owners: NativeOwners) => R,
      retained: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => real(owners => {
      if (context === CONTEXT) {
        const own = owners.own.bind(owners);
        owners.own = <S extends NativeOwner>(value: S): S => {
          if (value instanceof oc.BRepCheck_Analyzer) {
            const analyzer = value as unknown as Analyzer, record: Record = {
              value: analyzer, releases: 0, physicalDeletes: 0, fallbackReleases: 0, calls: [], allTargetsLiveAtDelete: false,
            };
            records.push(record);
            const physicalDelete = analyzer.delete.bind(analyzer);
            fallback.own({ delete: () => { if (record.releases === 0) { record.fallbackReleases++; physicalDelete(); } } });
            for (const kind of ['Init', 'IsValid', 'IsParallel', 'IsExactMethod'] as const) {
              const native = analyzer[kind].bind(analyzer) as (...args: unknown[]) => unknown;
              Object.defineProperty(analyzer, kind, { configurable: true, value: (...args: unknown[]) => {
                const answer = native(...args), event: Event = { kind,
                  call: record.calls.filter(value => value.kind === kind).length + 1, value: answer,
                  target: kind === 'Init' ? args[0] as RawShape : undefined };
                record.calls.push({ ...event }); hook(record, event); return event.value;
              } });
            }
            Object.defineProperty(analyzer, 'delete', { configurable: true, value: () => {
              record.releases++;
              record.allTargetsLiveAtDelete = record.calls.filter(call => call.kind === 'Init').every(call => !call.target!.IsNull());
              // The timing observer cannot prevent physical retirement if an
              // assertion in that observer fails. Fault hooks remain AFTER it.
              try { beforeRetire(record); } finally { physicalDelete(); record.physicalDeletes++; }
              const event: Event = { kind: 'delete', call: record.releases }; record.calls.push(event); hook(record, event);
            } });
          }
          return own(value);
        };
      }
      observeArena(owners, context);
      return action(owners);
    }, retained, context);
    const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(replacement);
    try { return operation(records); } finally { spy.mockRestore(); }
  });
}
function box(owners: NativeOwners, corner = [-5, -3, 0], size = [10, 6, 4]): Shape3D {
  const oc = getOC(), point = owners.own(new oc.gp_Pnt(...corner as [number, number, number])),
    builder = owners.own(new oc.BRepPrimAPI_MakeBox(point, ...size as [number, number, number])), raw = owners.own(builder.Solid());
  expect(builder.IsDone()).toBe(true); return owners.own(cast(raw)).asShape3D();
}
function cylinder(owners: NativeOwners): Shape3D {
  const oc = getOC(), builder = owners.own(new oc.BRepPrimAPI_MakeCylinder(2, 3)), raw = owners.own(builder.Shape());
  expect(builder.IsDone()).toBe(true); return owners.own(cast(raw)).asShape3D();
}
function openBox(owners: NativeOwners, source: Shape3D): Shape3D {
  const oc = getOC(), faces = owners.ownAll(ownedNativeTopology(source, 'face'));
  const top = faces.filter(face => withNativeOwners(temporary => {
    const bounds = temporary.own(face.boundingBox).bounds;
    return bounds.every(side => Math.abs(side[2] - 4) <= 1e-6);
  }));
  expect(faces).toHaveLength(6); expect(top).toHaveLength(1);
  const shell = owners.own(new oc.TopoDS_Shell()), builder = owners.own(new oc.TopoDS_Builder()); builder.MakeShell(shell);
  for (const face of faces) if (face !== top[0]) builder.Add(shell, face.wrapped);
  const maker = owners.own(new oc.BRepBuilderAPI_MakeSolid(shell)), raw = owners.own(maker.Solid());
  expect(maker.IsDone()).toBe(true); return owners.own(cast(raw)).asShape3D();
}
function nativeValid(shape: Shape3D): boolean {
  return withNativeOwners(owners => owners.own(new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false)).IsValid());
}
function metrics(shape: Shape3D, volume: number, area: number, bounds: number[][], solids = 1): void {
  withNativeOwners(owners => {
    expect(nativeValid(shape)).toBe(true); expect(owners.ownAll(ownedNativeTopology(shape, 'solid'))).toHaveLength(solids);
    const oc = getOC(), mass = owners.own(new oc.GProp_GProps()), surface = owners.own(new oc.GProp_GProps());
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(shape.wrapped, surface, false, false);
    expect(Math.abs(mass.Mass() - volume)).toBeLessThan(1e-5); expect(Math.abs(surface.Mass() - area)).toBeLessThan(1e-5);
    owners.own(shape.boundingBox).bounds.forEach((side, i) => side.forEach((value, axis) => expect(Math.abs(value - bounds[i][axis])).toBeLessThan(1e-6)));
  });
}
function openProof(shape: Shape3D): void {
  withNativeOwners(owners => {
    const oc = getOC(), faces = owners.ownAll(ownedNativeTopology(shape, 'face')), edges = owners.ownAll(ownedNativeTopology(shape, 'edge'));
    expect(faces).toHaveLength(5); expect(edges).toHaveLength(12);
    const counts = edges.map(() => 0);
    for (const face of faces) for (const edge of owners.ownAll(ownedNativeTopology(face, 'edge'))) {
      const index = edges.findIndex(value => value.wrapped.IsSame(edge.wrapped)); expect(index).toBeGreaterThanOrEqual(0); counts[index]++;
    }
    expect(counts.filter(value => value === 1)).toHaveLength(4); expect(counts.filter(value => value === 2)).toHaveLength(8);
    expect(nativeValid(shape)).toBe(false);
    expect(owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, false, false, false)).IsValid()).toBe(false);
  });
}

it('reuses one analyzer for valid seed, real open solid, placed box and cylinder, then retires before borrowed inputs', () => withNativeOwners(owners => {
  const a = box(owners), b = openBox(owners, a), c = box(owners, [7, -5, 11], [3, 2, 5]), d = cylinder(owners); openProof(b);
  observe(records => {
    const answer = withNativeValidationContext(a, context => [a, b, c, d].map(shape => context.check(shape)));
    expect(answer).toEqual([true, false, true, true]); expect(records).toHaveLength(1); released(records);
    expect(records[0].calls.filter(call => call.kind === 'Init')).toHaveLength(8);
    expect(records[0].calls.filter(call => call.kind === 'IsValid')).toHaveLength(8);
  });
  metrics(a, 240, 248, [[-5, -3, 0], [5, 3, 4]]); metrics(c, 30, 62, [[7, -5, 11], [10, -3, 16]]);
  metrics(d, 12 * Math.PI, 20 * Math.PI, [[-2, -2, 0], [2, 2, 3]]); openProof(b);
}), 60_000);

it('returns false and retires an invalid first seed without treating its false validity as reset failure', () => withNativeOwners(owners => {
  const a = box(owners), b = openBox(owners, a), ordinary = new Error('ordinary feature geometry rejection'); openProof(b);
  observe(records => {
    const failure = caught(() => withNativeValidationContext(b, context => {
      expect(context.check(b)).toBe(false); expect(records[0].physicalDeletes).toBe(1); throw ordinary;
    }));
    expect(failure.error).toBe(ordinary); expect(failure.error).not.toBeInstanceOf(AggregateError); released(records);
    expect(records[0].calls.filter(call => call.kind === 'Init')).toHaveLength(1);
    expect(records[0].calls.filter(call => call.kind === 'IsValid')).toHaveLength(1);
  });
  openProof(b); metrics(a, 240, 248, [[-5, -3, 0], [5, 3, 4]]);
}), 60_000);

it('withholds a callback result after it swallows first-seed rejection and forbids invalid-seed reuse', () => withNativeOwners(owners => {
  const a = box(owners), b = openBox(owners, a); let published = false;
  observe(records => {
    const failure = caught(() => { withNativeValidationContext(b, context => {
      expect(context.check(b)).toBe(false); expect(caught(() => context.check(a)).error).not.toBeInstanceOf(AggregateError); return 'candidate';
    }); published = true; });
    expect(failure.error).toBeInstanceOf(Error); expect(failure.error).not.toBeInstanceOf(AggregateError); expect(published).toBe(false); released(records);
  });
}), 60_000);

it('rejects a non-seed first target before constructing an analyzer and keeps caught protocol failures fatal', () => withNativeOwners(owners => {
  const a = box(owners), c = box(owners, [7, -5, 11], [3, 2, 5]); let published = false;
  observe(records => {
    const failure = caught(() => { withNativeValidationContext(a, context => {
      expect(caught(() => context.check(c)).error).toBeInstanceOf(NativeValidationContextError); return 'candidate';
    }); published = true; });
    expect(failure.error).toBeInstanceOf(AggregateError); expect(published).toBe(false); expect(records).toHaveLength(0);
  });
}), 60_000);

it('closes an escaped checker before final analyzer retirement and cannot acquire more native work', () => withNativeOwners(owners => {
  const a = box(owners); let escaped!: NativeValidationContext, early: { threw: boolean; error?: unknown; nativeCalls: number } | undefined;
  observe(records => {
    escaped = withNativeValidationContext(a, context => { escaped = context; expect(context.check(a)).toBe(true); return context; });
    expect(early?.threw).toBe(true); expect(early?.nativeCalls).toBe(0);
    expect(leaves(early?.error).some(error => error instanceof Error && error.message === 'Native validation context is closed.')).toBe(true);
    const before = records[0].calls.length; expect(caught(() => escaped.check(a)).error).toBeInstanceOf(NativeValidationContextError);
    expect(records[0].calls).toHaveLength(before); released(records);
  }, undefined, record => {
    const before = record.calls.length;
    try { escaped.check(a); early = { threw: false, nativeCalls: record.calls.length - before }; }
    catch (error) { early = { threw: true, error, nativeCalls: record.calls.length - before }; }
  });
}), 60_000);

it('poisons reentry even when a native-query adapter catches the nested guard failure', () => withNativeOwners(owners => {
  const a = box(owners); let context!: NativeValidationContext, entered = false, published = false;
  observe(records => {
    const failure = caught(() => { withNativeValidationContext(a, value => { context = value; value.check(a); return 'candidate'; }); published = true; });
    expect(failure.error).toBeInstanceOf(AggregateError); expect(entered).toBe(true); expect(published).toBe(false); released(records);
  }, (_record, event) => {
    if (event.kind === 'IsValid' && !entered) { entered = true; expect(caught(() => context.check(a)).error).toBeInstanceOf(AggregateError); }
  });
}), 60_000);

it('rejects changed OC identity while disposing its captured analyzer before input owners', () => withNativeOwners(owners => {
  const original = getOC(), a = box(owners); let published = false;
  try {
    observe(records => {
      const failure = caught(() => { withNativeValidationContext(a, context => {
        expect(context.check(a)).toBe(true); setOC({} as ReturnType<typeof getOC>); context.check(a); return 'candidate';
      }); published = true; });
      expect(failure.error).toBeInstanceOf(AggregateError); expect(published).toBe(false); released(records);
    });
  } finally { setOC(original); }
  metrics(a, 240, 248, [[-5, -3, 0], [5, 3, 4]]);
}), 60_000);

it.each([0, false, undefined])('preserves callback primary %s and physical delete failure in a fatal aggregate', primary => withNativeOwners(owners => {
  const a = box(owners), cleanup = new Error('original actual delete-then-error'); let published = false;
  observe(records => {
    const failure = caught(() => { withNativeValidationContext(a, context => { context.check(a); throw primary; }); published = true; });
    expect(failure.error).toBeInstanceOf(NativeCleanupError); expect((failure.error as Error).cause).toBe(primary);
    expect(leaves(failure.error)).toContain(primary); expect(leaves(failure.error)).toContain(cleanup); expect(published).toBe(false); released(records);
  }, (_record, event) => { if (event.kind === 'delete') throw cleanup; });
}), 60_000);

it.each([
  { label: 'target Init', kind: 'Init' as const, call: 1, primary: 0 },
  { label: 'target IsValid', kind: 'IsValid' as const, call: 1, primary: false },
  { label: 'reset Init', kind: 'Init' as const, call: 2, primary: null },
  { label: 'reset IsValid', kind: 'IsValid' as const, call: 2, primary: undefined },
])('makes real native $label-then-failure fatal and retires once with borrowed sources alive', ({ kind, call, primary }) => withNativeOwners(owners => {
  const a = box(owners); let published = false, injected = false;
  observe(records => {
    const failure = caught(() => { withNativeValidationContext(a, context => context.check(a)); published = true; });
    expect(injected).toBe(true); expect(failure.error).toBeInstanceOf(AggregateError); expect(leaves(failure.error)).toContain(primary);
    expect(published).toBe(false); released(records);
  }, (_record, event) => { if (event.kind === kind && event.call === call) { injected = true; throw primary; } });
  metrics(a, 240, 248, [[-5, -3, 0], [5, 3, 4]]);
}), 60_000);

it.each(['IsParallel', 'IsExactMethod'] as const)('fails closed for a changed %s report without changing a real native validity result', kind => withNativeOwners(owners => {
  const a = box(owners); let published = false;
  observe(records => {
    const failure = caught(() => { withNativeValidationContext(a, context => {
      expect(caught(() => context.check(a)).error).toBeInstanceOf(AggregateError); return 'candidate';
    }); published = true; });
    expect(failure.error).toBeInstanceOf(AggregateError); expect(published).toBe(false); released(records);
  }, (_record, event) => { if (event.kind === kind) event.value = true; });
}), 60_000);

it('does not downgrade a caught native fault when the callback subsequently throws a different falsy primary', () => withNativeOwners(owners => {
  const a = box(owners), original = new Error('real validity-query then failure');
  observe(records => {
    const failure = caught(() => withNativeValidationContext(a, context => { caught(() => context.check(a)); throw 0; }));
    expect(failure.error).toBeInstanceOf(AggregateError); expect(leaves(failure.error)).toContain(0); expect(leaves(failure.error)).toContain(original); released(records);
  }, (_record, event) => { if (event.kind === 'IsValid' && event.call === 1) throw original; });
}), 60_000);

it('withholds a returned object when its then getter catches a late protocol poison', () => withNativeOwners(owners => {
  const a = box(owners), c = box(owners, [7, -5, 11], [3, 2, 5]); let published = false, entered = false;
  observe(records => {
    const failure = caught(() => { withNativeValidationContext(a, context => ({ get then() {
      entered = true; expect(caught(() => context.check(c)).error).toBeInstanceOf(AggregateError); return undefined;
    } })); published = true; });
    expect(entered).toBe(true); expect(failure.error).toBeInstanceOf(AggregateError); expect(published).toBe(false); expect(records).toHaveLength(0);
  });
}), 60_000);

it('keeps late invalid-seed rejection ordinary while withholding a then-getter result', () => withNativeOwners(owners => {
  const a = box(owners), b = openBox(owners, a); let published = false;
  observe(records => {
    const failure = caught(() => { withNativeValidationContext(b, context => ({ get then() {
      expect(context.check(b)).toBe(false); return undefined;
    } })); published = true; });
    expect(failure.error).toBeInstanceOf(Error); expect(failure.error).not.toBeInstanceOf(AggregateError); expect(published).toBe(false); released(records);
  });
  openProof(b);
}), 60_000);

it('checks OC identity again after a result then getter and retires the old analyzer before its inputs', () => withNativeOwners(owners => {
  const original = getOC(), a = box(owners); let published = false;
  try {
    observe(records => {
      const failure = caught(() => { withNativeValidationContext(a, context => { context.check(a); return { get then() {
        setOC({} as ReturnType<typeof getOC>); return undefined;
      } }; }); published = true; });
      expect(failure.error).toBeInstanceOf(AggregateError); expect(published).toBe(false); released(records);
    });
  } finally { setOC(original); }
  metrics(a, 240, 248, [[-5, -3, 0], [5, 3, 4]]);
}), 60_000);

it('detects OC drift during reset before the caller can start downstream native work', () => withNativeOwners(owners => {
  const original = getOC(), a = box(owners); let downstream = false;
  try {
    observe(records => {
      const failure = caught(() => withNativeValidationContext(a, context => { context.check(a); downstream = true; return 'candidate'; }));
      expect(failure.error).toBeInstanceOf(AggregateError); expect(downstream).toBe(false); released(records);
    }, (_record, event) => { if (event.kind === 'IsValid' && event.call === 2) setOC({} as ReturnType<typeof getOC>); });
  } finally { setOC(original); }
  metrics(a, 240, 248, [[-5, -3, 0], [5, 3, 4]]);
}), 60_000);

it('rejects a returned Promise and closes its checker synchronously before releasing the analyzer', () => withNativeOwners(owners => {
  const a = box(owners); let escaped!: NativeValidationContext, published = false;
  observe(records => {
    const failure = caught(() => { withNativeValidationContext(a, context => { escaped = context; context.check(a); return Promise.resolve('candidate'); }); published = true; });
    expect(failure.error).toBeInstanceOf(AggregateError); expect(published).toBe(false); released(records);
    expect(caught(() => escaped.check(a)).error).toBeInstanceOf(AggregateError);
  });
}), 60_000);

it('preserves falsy target, reset and physical deletion failures together and attempts retirement once', () => withNativeOwners(owners => {
  const a = box(owners);
  observe(records => {
    const failure = caught(() => withNativeValidationContext(a, context => context.check(a)));
    expect(failure.error).toBeInstanceOf(NativeCleanupError);
    expect(leaves(failure.error)).toContain(false); expect(leaves(failure.error)).toContain(0); expect(leaves(failure.error)).toContain(undefined); released(records);
  }, (_record, event) => {
    if (event.kind === 'IsValid' && event.call === 1) throw false;
    if (event.kind === 'Init' && event.call === 2) throw 0;
    if (event.kind === 'delete') throw undefined;
  });
  metrics(a, 240, 248, [[-5, -3, 0], [5, 3, 4]]);
}), 60_000);

const refA = { bodyId: 'batch-a', sourceFeatureId: 'create-batch-a' }, refC = { bodyId: 'batch-c', sourceFeatureId: 'create-batch-c' };
function metadata(ref = refA): NativeBodyMetadata { return { ref, createdByFeatureId: ref.sourceFeatureId, name: ref.bodyId, lineage: 'original-batch-seed' }; }
function catalog(owners: NativeOwners): NativeBodyCatalog { const value = new NativeBodyCatalog(); owners.own({ delete: () => value.dispose() }); return value; }
function commit(owners: NativeOwners, transaction: NativeBodyTransaction) {
  owners.own({ delete: () => transaction.dispose() }); const value = transaction.commit();
  owners.own({ delete: () => value.catalog.dispose() }); owners.own(value.aggregate); return value;
}
function snapshot(source: NativeBodyCatalog) {
  return source.entries().map(entry => ({ entry, shape: entry.shape, wrapped: entry.shape.wrapped,
    metadata: { ref: { ...entry.ref }, createdByFeatureId: entry.createdByFeatureId, name: entry.name, lineage: entry.lineage } }));
}
function unchanged(source: NativeBodyCatalog, before: ReturnType<typeof snapshot>): void {
  const entries = source.entries(); expect(entries).toHaveLength(before.length);
  entries.forEach((entry: NativeBodyEntry, index) => {
    expect(entry).toBe(before[index].entry); expect(entry.shape).toBe(before[index].shape); expect(entry.shape.wrapped).toBe(before[index].wrapped);
    expect({ ref: { ...entry.ref }, createdByFeatureId: entry.createdByFeatureId, name: entry.name, lineage: entry.lineage }).toEqual(before[index].metadata);
  });
}

it('uses one final-batch analyzer for entries and aggregate and closes it before staged authority can transfer', () => withNativeOwners(owners => {
  const a = box(owners), c = box(owners, [7, -5, 11], [3, 2, 5]), source = commit(owners, catalog(owners).stageNew(metadata(), a)), before = snapshot(source.catalog);
  observe(records => {
    const transaction = source.catalog.stageNew(metadata(refC), c); owners.own({ delete: () => transaction.dispose() });
    expect(records).toHaveLength(1); released(records); expect(source.catalog.entries().map(value => value.ref)).toEqual([refA]);
    expect(records[0].calls.filter(value => value.kind === 'IsValid')).toHaveLength(6);
    const next = commit(owners, transaction); expect(next.catalog.entries().map(value => value.ref)).toEqual([refA, refC]);
    metrics(next.aggregate, 270, 310, [[-5, -5, 0], [10, 3, 16]], 2);
    next.catalog.dispose(); metrics(next.aggregate, 270, 310, [[-5, -5, 0], [10, 3, 16]], 2);
  });
  unchanged(source.catalog, before);
  metrics(source.catalog.resolve(refA).shape, 240, 248, [[-5, -3, 0], [5, 3, 4]]); metrics(c, 30, 62, [[7, -5, 11], [10, -3, 16]]);
}), 60_000);

it.each([false, true])('keeps actual invalid entry first/later=%s an ordinary rejection with unchanged source catalog', later => withNativeOwners(owners => {
  const a = box(owners), bad = openBox(owners, a), empty = catalog(owners), current = later ? commit(owners, empty.stageNew(metadata(), a)).catalog : empty;
  const before = snapshot(current); let published = false; openProof(bad);
  observe(records => {
    const failure = caught(() => { const transaction = current.stageNew(metadata(later ? refC : refA), bad);
      owners.own({ delete: () => transaction.dispose() }); published = true; });
    expect(failure.error).toBeInstanceOf(Error); expect(failure.error).not.toBeInstanceOf(AggregateError); expect(published).toBe(false);
    expect(records).toHaveLength(1); expect(records[0].calls.some(value => value.kind === 'IsValid' && value.value === false)).toBe(true);
    expect(records[0].calls.filter(value => value.kind === 'IsValid')).toHaveLength(later ? 4 : 1); released(records);
  });
  unchanged(current, before);
  expect(current.entries().map(value => value.ref)).toEqual(later ? [refA] : []);
  if (later) metrics(current.resolve(refA).shape, 240, 248, [[-5, -3, 0], [5, 3, 4]]); openProof(bad);
}), 60_000);

it.each([
  { kind: 'reset', invalidFirst: false }, { kind: 'delete', invalidFirst: false }, { kind: 'delete', invalidFirst: true },
])('withholds a transaction for $kind failure with invalid-first=$invalidFirst and keeps source ownership unchanged', ({ kind, invalidFirst }) => withNativeOwners(owners => {
  const a = box(owners), c = box(owners, [7, -5, 11], [3, 2, 5]), bad = openBox(owners, a), empty = catalog(owners),
    current = invalidFirst ? empty : commit(owners, empty.stageNew(metadata(), a)).catalog, primary = new Error('actual stage context retirement failure');
  const before = snapshot(current); let injected = false, published = false;
  observe(records => {
    const failure = caught(() => { const transaction = current.stageNew(metadata(invalidFirst ? refA : refC), invalidFirst ? bad : c);
      owners.own({ delete: () => transaction.dispose() }); published = true; });
    expect(injected).toBe(true); expect(failure.error).toBeInstanceOf(AggregateError); expect(leaves(failure.error)).toContain(primary);
    expect(published).toBe(false); released(records);
  }, (_record, event) => {
    if (!injected && ((kind === 'reset' && event.kind === 'Init' && event.call === 2) || (kind === 'delete' && event.kind === 'delete'))) {
      injected = true; throw primary;
    }
  });
  unchanged(current, before);
  expect(current.entries().map(value => value.ref)).toEqual(invalidFirst ? [] : [refA]);
  if (!invalidFirst) metrics(current.resolve(refA).shape, 240, 248, [[-5, -3, 0], [5, 3, 4]]);
  metrics(a, 240, 248, [[-5, -3, 0], [5, 3, 4]]); metrics(c, 30, 62, [[7, -5, 11], [10, -3, 16]]); openProof(bad);
}), 60_000);

it('withholds aggregate authority after a real aggregate validity query fails, preserving the original catalog', () => withNativeOwners(owners => {
  const a = box(owners), c = box(owners, [7, -5, 11], [3, 2, 5]), source = commit(owners, catalog(owners).stageNew(metadata(), a)), primary = new Error('aggregate check then failure');
  const before = snapshot(source.catalog); let published = false, injected = false;
  observe(records => {
    const failure = caught(() => { const transaction = source.catalog.stageNew(metadata(refC), c);
      owners.own({ delete: () => transaction.dispose() }); published = true; });
    expect(failure.error).toBeInstanceOf(AggregateError); expect(leaves(failure.error)).toContain(primary); expect(injected).toBe(true); expect(published).toBe(false); released(records);
  }, (record, event) => {
    const target = record.calls.filter(value => value.kind === 'Init').at(-1)?.target;
    if (event.kind === 'IsValid' && target?.ShapeType() === getOC().TopAbs_ShapeEnum.TopAbs_COMPOUND && !injected) { injected = true; throw primary; }
  });
  unchanged(source.catalog, before);
  expect(source.catalog.entries().map(value => value.ref)).toEqual([refA]); metrics(source.catalog.resolve(refA).shape, 240, 248, [[-5, -3, 0], [5, 3, 4]]);
}), 60_000);

it('preserves a real compound Add callback failure before publication and still retires the context', () => withNativeOwners(owners => {
  const a = box(owners), primary = new Error('compound Add then failure'), current = catalog(owners), oc = getOC(), actual = oc.TopoDS_Builder.prototype.Add;
  const before = snapshot(current);
  observe(records => {
    const spy = vi.spyOn(oc.TopoDS_Builder.prototype, 'Add').mockImplementation(function (this: InstanceType<typeof oc.TopoDS_Builder>, ...args: Parameters<InstanceType<typeof oc.TopoDS_Builder>['Add']>) {
      actual.apply(this, args); throw primary;
    });
    try { expect(caught(() => current.stageNew(metadata(), a)).error).toBe(primary); } finally { spy.mockRestore(); }
    expect(records).toHaveLength(1); released(records); expect(current.entries()).toEqual([]);
  });
  unchanged(current, before);
  metrics(a, 240, 248, [[-5, -3, 0], [5, 3, 4]]);
}), 60_000);

it('propagates a fatal context fault through rebuild, revokes native copy authority and recovers on a fresh valid rebuild', () => withNativeOwners(owners => {
  const features: Feature[] = [
    { id: 'profile', name: 'Original batch rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 6 } },
    { id: 'base', name: 'Original batch extrusion', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false,
      bodyOperation: { mode: 'new', bodyId: 'block-body' } },
  ];
  const engine = new CadEngine(), reference = { bodyId: 'block-body', sourceFeatureId: 'base' }; owners.own({ delete: () => engine.dispose() });
  observe(records => {
    const failure = caught(() => engine.rebuildForAssemblyReferences(features));
    expect(failure.error).toBeInstanceOf(AggregateError); expect(() => engine.copyCurrentBodyShape(reference)).toThrow(/reconstrucción completa y vigente/); released(records);
  }, (_record, event) => { if (event.kind === 'Init' && event.call === 1) throw 0; });
  const fresh = engine.rebuildForAssemblyReferences(features); expect(fresh.featureErrors).toEqual([]);
  const copy = owners.own(engine.copyCurrentBodyShape(reference)); engine.dispose();
  expect(() => engine.copyCurrentBodyShape(reference)).toThrow(/reconstrucción completa y vigente/);
  metrics(copy, 240, 248, [[-5, -3, 0], [5, 3, 4]]);
}), 60_000);

interface AssemblySolidObservation { value: NativeOwner; releases: number; physicalDeletes: number; fallbackReleases: number }
interface AssemblyObservation { analyzers: Record[]; solids: AssemblySolidObservation[]; sequence: string[] }
/** Extend the same real-owner observer: no second fixture/analysis framework. */
function observeAssembly<T>(operation: (observation: AssemblyObservation) => T,
  hook: (record: Record, event: Event) => void = () => {}): T {
  return withNativeOwners(fallback => {
    const solids: AssemblySolidObservation[] = [], sequence: string[] = [], seen = new WeakSet<NativeOwner>();
    return observe(analyzers => operation({ analyzers, solids, sequence }), (record, event) => {
      if (event.kind === 'delete') sequence.push('analyzer-deleted');
      hook(record, event);
    }, undefined, (owners, context) => {
      if (context !== 'Assembly aggregate validation or release failed.') return;
      const own = owners.own.bind(owners);
      owners.own = <S extends NativeOwner>(value: S): S => {
        if (value instanceof Shape && !seen.has(value)) {
          seen.add(value);
          const solid: AssemblySolidObservation = { value, releases: 0, physicalDeletes: 0, fallbackReleases: 0 }, physical = value.delete.bind(value);
          solids.push(solid);
          fallback.own({ delete: () => { if (solid.releases === 0) { solid.fallbackReleases++; physical(); } } });
          Object.defineProperty(value, 'delete', { configurable: true, value: () => {
            solid.releases++; sequence.push('solid-retiring'); physical(); solid.physicalDeletes++; sequence.push('solid-deleted');
          } });
        }
        return own(value);
      };
    });
  });
}
function assemblyReleased(observation: AssemblyObservation, count: number): void {
  expect(observation.analyzers).toHaveLength(1); released(observation.analyzers); expect(observation.solids).toHaveLength(count);
  for (const solid of observation.solids) {
    expect(solid.releases).toBe(1); expect(solid.physicalDeletes).toBe(1); expect(solid.fallbackReleases).toBe(0);
  }
  const analyzer = observation.sequence.indexOf('analyzer-deleted'); expect(analyzer).toBeGreaterThanOrEqual(0);
  observation.sequence.forEach((event, index) => { if (event === 'solid-retiring') expect(index).toBeGreaterThan(analyzer); });
}
function aggregate(owners: NativeOwners, children: readonly AnyShape[]): Shape3D {
  const oc = getOC(), builder = owners.own(new oc.TopoDS_Builder()), raw = owners.own(new oc.TopoDS_Compound()); builder.MakeCompound(raw);
  for (const child of children) builder.Add(raw, child.wrapped);
  return owners.own(cast(raw)).asShape3D();
}

it.each([false, true])('validates an assembly with multiple=%s using one checker before retiring its owned solid wrappers', multiple => withNativeOwners(owners => {
  const a = box(owners), c = box(owners, [7, -5, 11], [3, 2, 5]), shape = multiple ? aggregate(owners, [a, c]) : a, raw = shape.wrapped;
  observeAssembly(observation => {
    expect(validateAssemblyShape(shape)).toBe(multiple ? 2 : 1); assemblyReleased(observation, multiple ? 2 : 1);
    expect(observation.analyzers[0].calls.filter(value => value.kind === 'IsValid')).toHaveLength(multiple ? 6 : 4);
  });
  expect(shape.wrapped).toBe(raw);
  if (multiple) metrics(shape, 270, 310, [[-5, -5, 0], [10, 3, 16]], 2);
  else metrics(shape, 240, 248, [[-5, -3, 0], [5, 3, 4]]);
}), 60_000);

it('rejects a real open assembly solid as ordinary geometry before acquiring child wrappers', () => withNativeOwners(owners => {
  const a = box(owners), bad = openBox(owners, a), raw = bad.wrapped; openProof(bad);
  observeAssembly(observation => {
    const failure = caught(() => validateAssemblyShape(bad));
    expect(failure.error).toBeInstanceOf(Error); expect(failure.error).not.toBeInstanceOf(AggregateError);
    expect((failure.error as Error).message).toBe('El agregado del ensamblaje no es un BRep válido.'); assemblyReleased(observation, 0);
    const queries = observation.analyzers[0].calls.filter(value => value.kind === 'IsValid'); expect(queries).toHaveLength(1); expect(queries[0].value).toBe(false);
  });
  expect(bad.wrapped).toBe(raw); openProof(bad); metrics(a, 240, 248, [[-5, -3, 0], [5, 3, 4]]);
}), 60_000);

it.each(['query', 'reset', 'delete'] as const)('makes assembly child-validation %s faults fatal and retires its analyzer before every child', fault => withNativeOwners(owners => {
  const a = box(owners), c = box(owners, [7, -5, 11], [3, 2, 5]), shape = aggregate(owners, [a, c]), raw = shape.wrapped,
    primary = new Error('Original real assembly context operation then failure'); let injected = false, returned = false;
  observeAssembly(observation => {
    const failure = caught(() => { validateAssemblyShape(shape); returned = true; });
    expect(injected).toBe(true); expect(returned).toBe(false); expect(failure.error).toBeInstanceOf(AggregateError); expect(leaves(failure.error)).toContain(primary);
    assemblyReleased(observation, 2);
  }, (_record, event) => {
    if (!injected && ((fault === 'query' && event.kind === 'IsValid' && event.call === 3)
      || (fault === 'reset' && event.kind === 'Init' && event.call === 4) || (fault === 'delete' && event.kind === 'delete'))) {
      injected = true; throw primary;
    }
  });
  expect(shape.wrapped).toBe(raw); metrics(shape, 270, 310, [[-5, -5, 0], [10, 3, 16]], 2);
}), 60_000);

it('retains loose-geometry rejection after checking the real valid aggregate and its complete solid', () => withNativeOwners(owners => {
  const a = box(owners), c = box(owners, [7, -5, 11], [3, 2, 5]), faces = owners.ownAll(ownedNativeTopology(c, 'face')),
    shape = aggregate(owners, [a, faces[0]]); expect(nativeValid(shape)).toBe(true);
  observeAssembly(observation => {
    const failure = caught(() => validateAssemblyShape(shape));
    expect(failure.error).toBeInstanceOf(Error); expect(failure.error).not.toBeInstanceOf(AggregateError);
    expect((failure.error as Error).message).toContain('geometría suelta'); assemblyReleased(observation, 1);
    expect(observation.analyzers[0].calls.filter(value => value.kind === 'IsValid')).toHaveLength(4);
  });
  metrics(a, 240, 248, [[-5, -3, 0], [5, 3, 4]]); metrics(c, 30, 62, [[7, -5, 11], [10, -3, 16]]);
}), 60_000);

it('retains the no-solid rejection after a genuine valid face-only compound check', () => withNativeOwners(owners => {
  const a = box(owners), faces = owners.ownAll(ownedNativeTopology(a, 'face')), shape = aggregate(owners, [faces[0]]); expect(nativeValid(shape)).toBe(true);
  observeAssembly(observation => {
    const failure = caught(() => validateAssemblyShape(shape));
    expect(failure.error).toBeInstanceOf(Error); expect(failure.error).not.toBeInstanceOf(AggregateError);
    expect((failure.error as Error).message).toContain('al menos un sólido cerrado'); assemblyReleased(observation, 0);
    expect(observation.analyzers[0].calls.filter(value => value.kind === 'IsValid')).toHaveLength(2);
  });
  metrics(a, 240, 248, [[-5, -3, 0], [5, 3, 4]]);
}), 60_000);
