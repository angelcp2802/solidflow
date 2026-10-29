import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { exportSTEP, getOC, importSTEP, setOC, type Shape3D } from 'replicad';
import { entityProfileSolid } from './kernel.profiles';
import { withNativeOwners } from './kernel.native-ownership';
import { prepareThinSection } from './kernel.thin-wall';
import { resolveThinWall } from './thinWall';
import { cornerOracles, cornerSketch, type CornerOracle } from './kernel.thin-corners.test-helpers';

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
  print: () => undefined,
})), 60_000);

function close(actual: number, expected: number, tolerance = 1e-5) {
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
}
function inspect(shape: Shape3D, row: CornerOracle): void {
  withNativeOwners(owners => {
    const oc = getOC(), analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
    expect(analyzer.IsValid()).toBe(true);
    const explorer = owners.own(new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    let solids = 0; while (explorer.More()) { solids++; explorer.Next(); }
    expect(solids).toBe(row.solids ?? 1);
    const mass = owners.own(new oc.GProp_GProps()), surface = owners.own(new oc.GProp_GProps()), box = owners.own(new oc.Bnd_Box());
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
    oc.BRepGProp.SurfaceProperties(shape.wrapped, surface, false, false);
    oc.BRepBndLib.AddOptimal(shape.wrapped, box, false, false);
    close(mass.Mass(), row.volume); close(surface.Mass(), row.area);
    const bounds = [box.GetXMin(), box.GetYMin(), box.GetZMin(), box.GetXMax(), box.GetYMax(), box.GetZMax()];
    bounds.forEach((value, index) => close(value, [...row.min, ...row.max][index], 1e-6));
    // Read all native circles independently of generated section identifiers.
    // The least radius in these original cases is the requested inner fillet.
    const radii: number[] = [];
    for (const edge of owners.ownAll(shape.edges)) {
      const curve = owners.own(new oc.BRepAdaptor_Curve(edge.wrapped));
      if (curve.GetType() === oc.GeomAbs_CurveType.GeomAbs_Circle) radii.push(owners.own(curve.Circle()).Radius());
    }
    expect(radii.length).toBeGreaterThanOrEqual(4);
    close(Math.min(...radii), row.wall.autoCorners!.radius, 1e-7);
  }, undefined, 'Automatic-corner native measurements or release failed.');
}

describe('native constant-thickness automatic corners', () => {
  it.each(cornerOracles())('retains BRep, V/A/bounds, radius and STEP for $name', async row => {
    const source = cornerSketch(row.profile), before = structuredClone(source);
    const section = prepareThinSection(source, resolveThinWall({ thinWall: row.wall })!);
    if (section.sketch.profile.kind !== 'entities') throw Error('Expected derived entity section');
    const shape = entityProfileSolid(section.sketch.profile, 'XY', 0, { type: 'extrude', depth: row.depth }, undefined, true);
    try {
      inspect(shape, row);
      const reopened = (await importSTEP(exportSTEP([{ shape, name: row.name }]))).asShape3D();
      try { inspect(reopened, row); } finally { reopened.delete(); }
    } finally { shape.delete(); }
    expect(source).toEqual(before);
  });
});
