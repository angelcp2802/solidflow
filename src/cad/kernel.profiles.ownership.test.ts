import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as replicad from 'replicad';
import initOpenCascade from 'replicad-opencascadejs';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { EntityProfile } from '../sketch/types';
import type { PlaneFrame } from './kernel.types';
import { validateBodyShape } from './kernel.bodies';
import * as ownership from './kernel.native-ownership';
import { entityProfileSolid } from './kernel.profiles';

// Original synthetic native fixtures, in mm: one or two radius-1 circles at
// (3, 0) and (9, 0), depth 4; each region has V=4*pi and A=10*pi.
// These cases exercise the actual SDK/WASM, not fake BReps or solver success.
// Instance-only throwing construction accessors and each project scope's private
// registration Map cause lifecycle faults; SDK factories and geometry stay real.
// Every received wrapper's real delete runs before a release notification fault.
const constructorFault = vi.hoisted(() => ({ error: undefined as Error | undefined, failures: 0 }));
vi.mock('replicad', async importOriginal => {
  const actual = await importOriginal<typeof import('replicad')>();
  return { ...actual, Compound: class extends actual.Compound {
    constructor(wrapped: ConstructorParameters<typeof actual.Compound>[0]) {
      if (constructorFault.error) { constructorFault.failures++; throw constructorFault.error; }
      super(wrapped);
    }
  } };
});
const realWithNativeOwners = ownership.withNativeOwners;
beforeAll(async () => replicad.setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
afterEach(() => { constructorFault.error = undefined; constructorFault.failures = 0; vi.restoreAllMocks(); });

function circles(count = 1): EntityProfile {
  return { kind: 'entities', points: Array.from({ length: count }, (_, i) => ({ id: 'c' + i, x: 3 + 6 * i, y: 0 })),
    entities: Array.from({ length: count }, (_, i) => ({ id: 'circle' + i, type: 'circle' as const,
      center: 'c' + i, radius: 1, construction: false })), constraints: [] };
}
const frame = (): PlaneFrame => ({ origin: [4, 5, 6], xDirection: [1, 0, 0], normal: [0, 0, 1] });
type Owner = ownership.NativeOwner;
type ReleaseRecord = { attempted: boolean; release(): void };
type Observation = { registrations: number; attempts: number };
interface Faults {
  received?(owner: Owner): void;
  cleanup?(owner: Owner): Error | undefined;
  rawCleanup?: Error;
  registration?: { select(owner: Owner): boolean; afterInsertion: boolean; error: Error };
}
function observeScopes(faults: Faults = {}) {
  const received = new Map<Owner, Observation>(), rawCompounds: { raw: unknown; release: unknown }[] = [], oc = replicad.getOC();
  let registrationFaults = 0;
  const intercepted: typeof ownership.withNativeOwners = (operation, resultOwners, context) => realWithNativeOwners(owners => {
    const records = (owners as unknown as { records: Map<Owner, ReleaseRecord> }).records,
      realSet = records.set.bind(records);
    Object.defineProperty(records, 'set', { configurable: true, value: (owner: Owner, record: ReleaseRecord) => {
      const observation = received.get(owner) ?? { registrations: 0, attempts: 0 };
      observation.registrations++;
      received.set(owner, observation);
      if (owner instanceof oc.TopoDS_Builder) {
        const rawMake = owner.MakeCompound.bind(owner);
        vi.spyOn(owner, 'MakeCompound').mockImplementation(raw => {
          const rawRelease = raw.delete.bind(raw);
          const release = vi.spyOn(raw, 'delete').mockImplementation(() => { rawRelease(); if (faults.rawCleanup) throw faults.rawCleanup; });
          rawCompounds.push({ raw, release });
          return rawMake(raw);
        });
      }
      faults.received?.(owner);
      const rawRelease = record.release;
      record.release = () => {
        observation.attempts++;
        rawRelease();
        const failure = faults.cleanup?.(owner);
        if (failure) throw failure;
      };
      if (!registrationFaults && faults.registration?.select(owner)) {
        registrationFaults++;
        if (faults.registration.afterInsertion) realSet(owner, record);
        throw faults.registration.error;
      }
      return realSet(owner, record);
    } });
    return operation(owners);
  }, resultOwners, context);
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(intercepted);
  return { received, rawCompounds, registrationFaults: () => registrationFaults, restore: () => spy.mockRestore() };
}
function releasedOnce(received: ReadonlyMap<Owner, Observation>): void {
  expect(received.size).toBeGreaterThan(0);
  for (const observation of received.values()) expect(observation.attempts).toBe(1);
}
function borrowedBodyUnchanged(body: replicad.Shape3D): void {
  validateBodyShape(body);
  realWithNativeOwners(owners => {
    expect(Math.abs(owners.own(replicad.measureShapeVolumeProperties(body)).volume - 240)).toBeLessThan(1e-5);
    const bounds = owners.own(body.boundingBox).bounds;
    [[0, 0, 0], [10, 8, 3]].forEach((side, i) => side.forEach((value, j) =>
      expect(Math.abs(bounds[i][j] - value)).toBeLessThan(1e-6)));
  });
}

// This API takes no borrowed native input. The caller-owned body deliberately
// remains outside every intercepted scope; profile/frame are borrowed values.
for (const count of [1, 2]) it('transfers the real ' + count + '-region result only after sibling cleanup', () => realWithNativeOwners(fixture => {
  const profile = circles(count), placement = frame(), before = JSON.stringify([profile, placement]),
    observation = observeScopes();
  let result: replicad.Shape3D;
  try { result = fixture.own(entityProfileSolid(profile, 'XY', 999, { type: 'extrude', depth: 4 }, placement)); }
  finally { observation.restore(); }
  expect(JSON.stringify([profile, placement])).toBe(before);
  expect(observation.received.get(result!)?.attempts).toBe(0);
  for (const [owner, entry] of observation.received) if (owner !== result!) expect(entry.attempts).toBe(1);
  const solids = fixture.ownAll(result!.solids);
  expect(solids).toHaveLength(count);
  for (const solid of solids) validateBodyShape(solid);
  expect(Math.abs(fixture.own(replicad.measureShapeVolumeProperties(result!)).volume - count * 4 * Math.PI)).toBeLessThan(1e-5);
  expect(Math.abs(fixture.own(replicad.measureShapeSurfaceProperties(result!)).area - count * 10 * Math.PI)).toBeLessThan(1e-5);
  const bounds = fixture.own(result!.boundingBox).bounds;
  [[6, 4, 6], [8 + 6 * (count - 1), 6, 10]].forEach((side, i) => side.forEach((value, j) =>
    expect(Math.abs(bounds[i][j] - value)).toBeLessThan(1e-6)));
}), 60_000);

it('preserves a second-contour construction failure and both earlier cleanup failures', () => realWithNativeOwners(fixture => {
  const body = fixture.own(replicad.makeBox([0, 0, 0], [10, 8, 3])),
    primary = new Error('Original second face factory'), faceCleanup = new Error('Original first face release'),
    wireCleanup = new Error('Original first wire release');
  let firstFace: replicad.Face | undefined, firstWire: replicad.Wire | undefined, secondWire: replicad.Wire | undefined, caught: unknown;
  const uniqueWires = new Set<replicad.Wire>(), wireBounds: number[][][] = [];
  let constructionRead: unknown, constructionPhase: unknown;
  const observation = observeScopes({
    received: owner => {
      if (owner instanceof replicad.Face) firstFace ??= owner;
      if (!(owner instanceof replicad.Wire) || uniqueWires.has(owner)) return;
      uniqueWires.add(owner);
      firstWire ??= owner;
      // Inspect the actual newly received wire before installing its one-use
      // accessor fault. Transfer registration of the same wire is not a contour.
      wireBounds.push(realWithNativeOwners(check =>
        check.own(owner.boundingBox).bounds.map(side => [...side])));
      if (uniqueWires.size === 2) {
        secondWire = owner;
        constructionRead = vi.spyOn(owner, 'wrapped', 'get').mockImplementationOnce(() => {
          constructionPhase = {
            firstWireRegistrations: observation.received.get(firstWire!)?.registrations,
            firstFaceRegistrations: observation.received.get(firstFace!)?.registrations,
            firstWireAttempts: observation.received.get(firstWire!)?.attempts,
            firstFaceAttempts: observation.received.get(firstFace!)?.attempts,
            secondWireRegistrations: observation.received.get(secondWire!)?.registrations,
            faces: [...observation.received.keys()].filter(value => value instanceof replicad.Face).length,
            solids: [...observation.received.keys()].filter(value => value instanceof replicad.Solid).length,
          };
          throw primary;
        });
      }
    },
    cleanup: owner => owner === firstFace ? faceCleanup : owner === firstWire ? wireCleanup : undefined,
  });
  try { fixture.own(entityProfileSolid(circles(2), 'XY', 0, { type: 'extrude', depth: 4 })); }
  catch (error) { caught = error; }
  finally { observation.restore(); }
  expect(uniqueWires.size).toBe(2);
  expect(secondWire).toBeDefined();
  expect(secondWire).not.toBe(firstWire);
  expect(constructionRead).toHaveBeenCalledTimes(1);
  expect(constructionPhase).toEqual({ firstWireRegistrations: 2, firstFaceRegistrations: 2,
    firstWireAttempts: 0, firstFaceAttempts: 0, secondWireRegistrations: 1, faces: 1, solids: 0 });
  const expectedBounds = [[[2, -1, 0], [4, 1, 0]], [[8, -1, 0], [10, 1, 0]]];
  expect(wireBounds).toHaveLength(2);
  wireBounds.forEach((bounds, contour) => bounds.forEach((side, index) => side.forEach((value, axis) =>
    expect(Math.abs(value - expectedBounds[contour][index][axis])).toBeLessThan(1e-6))));
  expect(observation.received.get(firstWire!)?.registrations).toBe(2);
  expect(observation.received.get(firstFace!)?.registrations).toBe(2);
  expect(observation.received.get(secondWire!)?.registrations).toBe(1);
  expect([...observation.received.keys()].filter(owner => owner instanceof replicad.Face)).toHaveLength(1);
  expect([...observation.received.keys()].some(owner => owner instanceof replicad.Solid || owner instanceof replicad.Compound)).toBe(false);
  expect(caught).toBeInstanceOf(ownership.NativeCleanupError);
  expect((caught as AggregateError).cause).toBe(primary);
  expect((caught as AggregateError).errors).toEqual([primary, faceCleanup, wireCleanup]);
  releasedOnce(observation.received);
  expect(observation.received.has(body)).toBe(false);
  borrowedBodyUnchanged(body);
}), 60_000);

for (const stage of ['solid-extrude', 'solid-revolve', 'contour-transfer', 'compound-wrapper'] as const) for (const afterInsertion of [false, true])
  it('releases actual received ' + stage + ' on registration failure, afterInsertion=' + afterInsertion, () => realWithNativeOwners(fixture => {
  const body = fixture.own(replicad.makeBox([0, 0, 0], [10, 8, 3])),
    primary = new Error('Original solid registration'), cleanup = new Error('Original received solid release');
  let fresh: Owner | undefined, caught: unknown;
  const wireRegistrations = new Map<Owner, number>();
  const observation = observeScopes({
    registration: { select: owner => {
      if (stage === 'contour-transfer') {
        if (!(owner instanceof replicad.Wire)) return false;
        const count = (wireRegistrations.get(owner) ?? 0) + 1;
        wireRegistrations.set(owner, count);
        if (count !== 2) return false;
      } else if (stage === 'compound-wrapper') {
        if (!(owner instanceof replicad.Compound)) return false;
      } else if (!(owner instanceof replicad.Solid)) return false;
      fresh = owner;
      return true;
    }, afterInsertion, error: primary },
    cleanup: owner => owner === fresh ? cleanup : undefined,
  });
  const operation = stage === 'solid-revolve' ? { type: 'revolve' as const, angle: 360 } : { type: 'extrude' as const, depth: 4 };
  try { fixture.own(entityProfileSolid(circles(stage === 'compound-wrapper' ? 2 : 1), 'XY', 0, operation)); }
  catch (error) { caught = error; }
  finally { observation.restore(); }
  expect(observation.registrationFaults()).toBe(1);
  expect(fresh).toBeDefined();
  if (stage === 'contour-transfer') {
    expect(wireRegistrations.size).toBe(1);
    expect(wireRegistrations.get(fresh!)).toBe(2);
    expect(observation.received.get(fresh!)?.registrations).toBe(2);
    expect([...observation.received.keys()].filter(owner => owner instanceof replicad.Face)).toHaveLength(1);
    expect([...observation.received.keys()].some(owner => owner instanceof replicad.Solid)).toBe(false);
  }
  expect(caught).toBeInstanceOf(ownership.NativeCleanupError);
  expect((caught as AggregateError).cause).toBe(primary);
  expect((caught as AggregateError).errors).toEqual([primary, cleanup]);
  releasedOnce(observation.received);
  if (stage === 'compound-wrapper') {
    expect(observation.rawCompounds).toHaveLength(1);
    expect(observation.rawCompounds[0].release).toHaveBeenCalledTimes(1);
  }
  expect(observation.received.has(body)).toBe(false);
  borrowedBodyUnchanged(body);
}), 60_000);

for (const count of [1, 2]) it('retires a completed ' + count + '-region result when final contour cleanup fails', () => realWithNativeOwners(fixture => {
  const body = fixture.own(replicad.makeBox([0, 0, 0], [10, 8, 3])), profile = circles(count), placement = frame(),
    before = JSON.stringify([profile, placement]), cleanup = new Error('Original retained contour release');
  let firstFace: Owner | undefined, caught: unknown;
  const observation = observeScopes({
    received: owner => { if (owner instanceof replicad.Face) firstFace ??= owner; },
    cleanup: owner => owner === firstFace ? cleanup : undefined,
  });
  try { fixture.own(entityProfileSolid(profile, 'XY', 0, { type: 'extrude', depth: 4 }, placement)); }
  catch (error) { caught = error; }
  finally { observation.restore(); }
  expect(caught).toBeInstanceOf(ownership.NativeCleanupError);
  expect((caught as AggregateError).cause).toBe(cleanup);
  expect((caught as AggregateError).errors).toEqual([cleanup]);
  expect([...observation.received.keys()].filter(owner => owner instanceof replicad.Solid)).toHaveLength(count);
  expect([...observation.received.keys()].filter(owner => owner instanceof replicad.Compound)).toHaveLength(count === 2 ? 1 : 0);
  releasedOnce(observation.received);
  expect(observation.rawCompounds).toHaveLength(count === 2 ? 1 : 0);
  for (const raw of observation.rawCompounds) expect(raw.release).toHaveBeenCalledTimes(1);
  expect(JSON.stringify([profile, placement])).toBe(before);
  expect(observation.received.has(body)).toBe(false);
  borrowedBodyUnchanged(body);
}), 60_000);

it('owns an actual compound before a throwing Shape3D assertion', () => realWithNativeOwners(fixture => {
  const primary = new Error('Original compound type assertion');
  let compound: replicad.Compound | undefined, caught: unknown;
  const observation = observeScopes({ received: owner => {
    if (owner instanceof replicad.Compound) {
      compound = owner;
      vi.spyOn(owner, 'asShape3D').mockImplementationOnce(() => { throw primary; });
    }
  } });
  try { fixture.own(entityProfileSolid(circles(2), 'XY', 0, { type: 'extrude', depth: 4 })); }
  catch (error) { caught = error; }
  finally { observation.restore(); }
  expect(caught).toBe(primary);
  expect(compound).toBeDefined();
  expect(observation.received.has(compound!)).toBe(true);
  releasedOnce(observation.received);
  expect(observation.rawCompounds).toHaveLength(1);
  expect(observation.rawCompounds[0].release).toHaveBeenCalledTimes(1);
}), 60_000);

it('releases the received region face and direction when native prism construction access throws', () => realWithNativeOwners(fixture => {
  const primary = new Error('Original extrusion construction input');
  let constructionRead: unknown, caught: unknown;
  const observation = observeScopes({ received: owner => {
    if (owner instanceof replicad.Vector) constructionRead = vi.spyOn(owner, 'wrapped', 'get').mockImplementationOnce(() => { throw primary; });
  } });
  try { fixture.own(entityProfileSolid(circles(), 'XY', 0, { type: 'extrude', depth: 4 })); }
  catch (error) { caught = error; }
  finally { observation.restore(); }
  expect(caught).toBe(primary);
  expect(constructionRead).toHaveBeenCalledTimes(1);
  expect([...observation.received.keys()].some(owner => owner instanceof replicad.Vector)).toBe(true);
  expect([...observation.received.keys()].some(owner => owner instanceof replicad.Solid)).toBe(false);
  releasedOnce(observation.received);
}), 60_000);

it('retains the created raw compound when wrapper construction fails before adoption', () => realWithNativeOwners(fixture => {
  const primary = new Error('Original compound wrapper construction'), cleanup = new Error('Original retained raw release'),
    observation = observeScopes({ rawCleanup: cleanup });
  let caught: unknown;
  constructorFault.error = primary;
  try { fixture.own(entityProfileSolid(circles(2), 'XY', 0, { type: 'extrude', depth: 4 })); }
  catch (error) { caught = error; }
  finally { constructorFault.error = undefined; observation.restore(); }
  expect(constructorFault.failures).toBe(1);
  expect(caught).toBeInstanceOf(ownership.NativeCleanupError);
  expect((caught as AggregateError).cause).toBe(primary);
  expect((caught as AggregateError).errors).toEqual([primary, cleanup]);
  expect(observation.rawCompounds).toHaveLength(1);
  expect(observation.rawCompounds[0].release).toHaveBeenCalledTimes(1);
  expect([...observation.received.keys()].some(owner => owner instanceof replicad.Compound)).toBe(false);
  releasedOnce(observation.received);
}), 60_000);

it('releases the created raw compound and unconsumed solids when native Add construction throws', () => realWithNativeOwners(fixture => {
  const primary = new Error('Original compound Add construction'), oc = replicad.getOC();
  let addCalls = 0, caught: unknown;
  const observation = observeScopes({ received: owner => {
    if (owner instanceof oc.TopoDS_Builder) {
      const realAdd = owner.Add.bind(owner);
      vi.spyOn(owner, 'Add').mockImplementation((...args) => {
        realAdd(...args);
        if (++addCalls === 1) throw primary;
      });
    }
  } });
  try { fixture.own(entityProfileSolid(circles(2), 'XY', 0, { type: 'extrude', depth: 4 })); }
  catch (error) { caught = error; }
  finally { observation.restore(); }
  expect(addCalls).toBe(1);
  expect(caught).toBe(primary);
  expect(observation.rawCompounds).toHaveLength(1);
  expect(observation.rawCompounds[0].release).toHaveBeenCalledTimes(1);
  expect([...observation.received.keys()].filter(owner => owner instanceof replicad.Solid)).toHaveLength(2);
  releasedOnce(observation.received);
}), 60_000);

it('adopts the same raw embind object into one real wrapper and deletes it once after caller ownership ends', () => {
  let rawRelease: unknown;
  realWithNativeOwners(fixture => {
    const observation = observeScopes();
    let result: replicad.Shape3D;
    try { result = fixture.own(entityProfileSolid(circles(2), 'XY', 0, { type: 'extrude', depth: 4 })); }
    finally { observation.restore(); }
    expect(observation.rawCompounds).toHaveLength(1);
    const raw = observation.rawCompounds[0];
    rawRelease = raw.release;
    expect(result!.wrapped).toBe(raw.raw);
    expect(rawRelease).not.toHaveBeenCalled();
    expect(Math.abs(fixture.own(replicad.measureShapeVolumeProperties(result!)).volume - 8 * Math.PI)).toBeLessThan(1e-5);
    const solids = fixture.ownAll(result!.solids);
    expect(solids).toHaveLength(2);
    for (const solid of solids) validateBodyShape(solid);
    for (const [owner, entry] of observation.received) expect(entry.attempts).toBe(owner === result! ? 0 : 1);
  });
  expect(rawRelease).toHaveBeenCalledTimes(1);
}, 60_000);
