import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { exportSTEP, getOC, importSTEP, setOC, type Shape3D } from 'replicad';
import { buildThinWallEndCaps } from './kernel.thin-caps';
import { prepareThinSection } from './kernel.thin-wall';
import { resolveThinWall } from './thinWall';
import { withNativeOwners } from './kernel.native-ownership';
import { validateBodyShape } from './kernel.bodies';
import type { PlaneFrame, SketchFeature, ThinWallDefinition, Vec3 } from './kernel.types';

// Original Cartesian boxes and concentric circles. Oracles describe the outer
// envelope minus a shortened core; no expected value uses the builder under test.
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
  print: () => undefined,
})), 60_000);

const rectangle: SketchFeature['profile'] = { kind: 'rectangle', center: [6, 4], width: 12, height: 8 };
const outside: ThinWallDefinition = { kind: 'one-side', thickness: 2, reversed: false, endCaps: { enabled: true, thickness: 1 } };
function sketch(profile: SketchFeature['profile'] = rectangle): SketchFeature {
  return { id: 'profile', name: 'Original cap fixture', type: 'sketch', suppressed: false,
    plane: 'XY', offset: 0, profile: structuredClone(profile) };
}
interface Oracle {
  name: string; wall: ThinWallDefinition; depth: number; offset?: number; frame?: PlaneFrame;
  profile?: SketchFeature['profile']; volume: number; area: number; center: Vec3; min: Vec3; max: Vec3;
}
const a = Math.SQRT1_2;
const oracles: Oracle[] = [
  { name: 'outside rectangle', wall: outside, depth: 20, volume: 2112, area: 2416, center: [6, 4, 10], min: [-2, -2, 0], max: [14, 10, 20] },
  { name: 'inside rectangle', wall: { kind: 'one-side', thickness: 2, reversed: true, endCaps: { enabled: true, thickness: 1 } },
    depth: 20, volume: 1344, area: 1488, center: [6, 4, 10], min: [0, 0, 0], max: [12, 8, 20] },
  { name: 'wall midpoint total4', wall: { kind: 'mid-plane', thickness: 4, endCaps: { enabled: true, thickness: 1 } },
    depth: 20, volume: 3264, area: 2000, center: [6, 4, 10], min: [-2, -2, 0], max: [14, 10, 20] },
  { name: 'two wall sides2/1', wall: { kind: 'two-sides', firstThickness: 2, secondThickness: 1, endCaps: { enabled: true, thickness: 1 } },
    depth: 20, volume: 2760, area: 2200, center: [6, 4, 10], min: [-2, -2, 0], max: [14, 10, 20] },
  { name: 'circle R5/out1', wall: { kind: 'one-side', thickness: 1, reversed: false, endCaps: { enabled: true, thickness: 2 } },
    depth: 10, profile: { kind: 'circle', center: [0, 0], radius: 5 }, volume: 210 * Math.PI, area: 302 * Math.PI,
    center: [0, 0, 5], min: [-6, -6, 0], max: [6, 6, 10] },
  { name: 'negative depth with offset7', wall: outside, depth: -20, offset: 7,
    volume: 2112, area: 2416, center: [6, 4, -3], min: [-2, -2, -13], max: [14, 10, 7] },
  { name: 'oblique translated frame', wall: outside, depth: 20,
    frame: { origin: [30, -20, 12], xDirection: [1, 0, 0], normal: [0, a, a] },
    volume: 2112, area: 2416, center: [36, -20 + 14 * a, 12 + 6 * a],
    min: [28, -20 - 2 * a, 12 - 10 * a], max: [44, -20 + 30 * a, 12 + 22 * a] },
  { name: 'small positive cap within declaration range', wall: { ...outside, endCaps: { enabled: true, thickness: .000001 } },
    depth: 20, volume: 1920.000192, area: 2495.99992, center: [6, 4, 10], min: [-2, -2, 0], max: [14, 10, 20] },
  { name: 'small positive core above join tolerance', wall: { ...outside, endCaps: { enabled: true, thickness: 9.99999 } },
    depth: 20, volume: 3839.99808, area: 1696.0008, center: [6, 4, 10], min: [-2, -2, 0], max: [14, 10, 20] },
];
const close = (actual: number, expected: number, tolerance = 1e-5) => expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
function inspect(shape: Shape3D, oracle: Oracle): void {
  withNativeOwners(owners => {
    validateBodyShape(shape);
    expect(owners.ownAll(shape.solids)).toHaveLength(1);
    const oc = getOC(), mass = owners.own(new oc.GProp_GProps()), area = owners.own(new oc.GProp_GProps()), box = owners.own(new oc.Bnd_Box());
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
    oc.BRepGProp.SurfaceProperties(shape.wrapped, area, false, false);
    oc.BRepBndLib.AddOptimal(shape.wrapped, box, false, false);
    close(mass.Mass(), oracle.volume); close(area.Mass(), oracle.area);
    const center = owners.own(mass.CentreOfMass());
    [center.X(), center.Y(), center.Z()].forEach((value, i) => close(value, oracle.center[i], 1e-6));
    [box.GetXMin(), box.GetYMin(), box.GetZMin(), box.GetXMax(), box.GetYMax(), box.GetZMax()]
      .forEach((value, i) => close(value, [...oracle.min, ...oracle.max][i], 1e-6));
  });
}

describe('single-region internal axial caps', () => {
  it.each(oracles)('preserves live and STEP BRep, V/A/centroid/bounds for $name', async oracle => {
    const source = sketch(oracle.profile), before = structuredClone(source);
    const section = prepareThinSection(source, resolveThinWall({ thinWall: oracle.wall })!);
    expect(section.openComponents).toBe(0); expect(section.closedRegions).toHaveLength(1);
    const result = buildThinWallEndCaps(section, oracle.wall, 'XY', oracle.offset ?? 0, oracle.depth, oracle.frame);
    try {
      inspect(result, oracle);
      const reopened = (await importSTEP(exportSTEP([{ shape: result, name: oracle.name }]))).asShape3D();
      try { inspect(reopened, oracle); } finally { reopened.delete(); }
    } finally { result.delete(); }
    expect(source).toEqual(before);
  });

  it.each([10, 10.1, 9.999999, NaN, Infinity])('rejects a vanished, inverted or sub-tolerance core for cap%s', thickness => {
    const section = prepareThinSection(sketch(), resolveThinWall({ thinWall: outside })!);
    expect(() => buildThinWallEndCaps(section, { ...outside, endCaps: { enabled: true, thickness } }, 'XY', 0, 20)).toThrow(/núcleo axial/);
  });

  it('rejects an open, mixed, disjoint or nested source without selecting a first region', () => {
    const line: SketchFeature['profile'] = { kind: 'entities', constraints: [], points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 12, y: 0 }],
      entities: [{ id: 'line', type: 'line', start: 'a', end: 'b', construction: false }] };
    const circles = (nested: boolean): SketchFeature['profile'] => ({ kind: 'entities', constraints: [],
      points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: nested ? 0 : 40, y: 0 }],
      entities: [{ id: 'first', type: 'circle', center: 'a', radius: 10, construction: false },
        { id: 'second', type: 'circle', center: 'b', radius: 5, construction: false }] });
    const mixed = structuredClone(line);
    mixed.points.push({ id: 'c', x: 30, y: 0 }); mixed.entities.push({ id: 'circle', type: 'circle', center: 'c', radius: 5, construction: false });
    for (const profile of [line, mixed, circles(false), circles(true)]) {
      const source = sketch(profile), before = structuredClone(source);
      expect(() => prepareThinSection(source, resolveThinWall({ thinWall: outside })!)).toThrow(/único contorno/);
      expect(source).toEqual(before);
    }
  });

  it('does not let cap metadata bypass ordinary closed-profile collapse validation', () => {
    const wall: ThinWallDefinition = { kind: 'one-side', thickness: 5, reversed: true, endCaps: { enabled: true, thickness: 1 } };
    expect(() => prepareThinSection(sketch(), resolveThinWall({ thinWall: wall })!)).toThrow(/colaps|invierte|cruz|toca/);
  });

  it('detaches explicit outer/core metadata while keeping cap absence geometry identical to OFF', () => {
    const legacy: ThinWallDefinition = { kind: 'one-side', thickness: 2, reversed: false };
    const before = prepareThinSection(sketch(), resolveThinWall({ thinWall: legacy })!);
    const off = prepareThinSection(sketch(), resolveThinWall({ thinWall: { ...legacy, endCaps: { enabled: false, thickness: 1 } } })!);
    expect(off.sketch).toEqual(before.sketch);
    expect(off.identity).not.toEqual(before.identity);
    const material = structuredClone(before.sketch.profile);
    before.closedRegions[0].outer.points[0].x = 999;
    expect(before.sketch.profile).toEqual(material);
  });
});
