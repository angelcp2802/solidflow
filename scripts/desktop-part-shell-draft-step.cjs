'use strict';
const fsp = require('node:fs/promises');

// Actual STEP geometry is checked with a separate native instance and literal
// cube/square-frustum oracles. No independent-kernel interoperability claim.
module.exports = async function measureFaceOperationStep(bytes, kind, check) {
  check(kind === 'shell' || kind === 'draft', 'One fixed original face-operation kind');
  const text = bytes.toString('utf8');
  check(text.startsWith('ISO-10303-21;') && /END-ISO-10303-21;\s*$/.test(text)
    && /SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/.test(text), 'Complete millimetre face-operation STEP');
  const wasmBinary = await fsp.readFile(require.resolve('replicad-opencascadejs/wasm'));
  const oc = await require('replicad-opencascadejs')({ wasmBinary, print: () => undefined });
  const owners = [], cleanupErrors = [], file = '/original-face-operation.step';
  const own = item => { owners.push(item); return item; };
  const near = (actual, expected, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    label + ': actual=' + actual + ', expected=' + expected + ', tolerance=' + tolerance);
  const tuple = value => [value.X(), value.Y(), value.Z()];
  let primary, result;
  try {
    own({ delete() { if (oc.FS.readdir('/').includes(file.slice(1))) oc.FS.unlink(file); } }); oc.FS.writeFile(file, bytes);
    const reader = own(new oc.STEPControl_Reader());
    check(reader.ReadFile(file) === oc.IFSelect_ReturnStatus.IFSelect_RetDone, 'Separate reader accepts actual face-operation STEP');
    reader.SetSystemLengthUnit(1); near(reader.SystemLengthUnit(), 1, 0, 'Face-operation STEP uses millimetres');
    const roots = reader.NbRootsForTransfer(); check(roots > 0 && reader.TransferRoots() === roots, 'All face-operation STEP roots transfer');
    const shape = own(reader.OneShape()), valid = own(new oc.BRepCheck_Analyzer(shape, true, false, false));
    check(!shape.IsNull() && valid.IsValid(), 'Exported face-operation BRep is valid');
    const solids = own(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    check(solids.More(), 'One actual exported face-operation solid exists'); const solid = own(solids.Current()); solids.Next();
    check(!solids.More(), 'No additional exported face-operation solid');
    const mass = own(new oc.GProp_GProps()), area = own(new oc.GProp_GProps()), bounds = own(new oc.Bnd_Box());
    oc.BRepGProp.VolumeProperties(solid, mass, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(solid, area, false, false);
    oc.BRepBndLib.AddOptimal(solid, bounds, false, false);
    const measured = { volume: mass.Mass(), area: area.Mass(), min: [bounds.GetXMin(), bounds.GetYMin(), bounds.GetZMin()], max: [bounds.GetXMax(), bounds.GetYMax(), bounds.GetZMax()] };
    const analytical = kind === 'shell'
      ? { volume: 424, area: 888, min: [-5, -5, 0], max: [5, 5, 10] }
      : { volume: 3640 / 3, area: 244 + 44 * Math.sqrt(101), min: [-6, -6, 0], max: [6, 6, 10] };
    near(measured.volume, analytical.volume, 1e-5, 'Independent exported ' + kind + ' volume');
    near(measured.area, analytical.area, 1e-5, 'Independent exported ' + kind + ' area');
    for (const side of ['min', 'max']) analytical[side].forEach((value, index) => near(measured[side][index], value, 1e-6, 'Literal exported ' + kind + ' bounds'));
    const faceExplorer = own(new oc.TopExp_Explorer(solid, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE)), planes = [];
    while (faceExplorer.More()) {
      const raw = own(faceExplorer.Current()), face = own(oc.TopoDS.Face(raw)), surface = own(new oc.BRepAdaptor_Surface(face, false));
      check(surface.GetType() === oc.GeomAbs_SurfaceType.GeomAbs_Plane, 'Every original face-operation face remains an actual native plane');
      const faceBounds = own(new oc.Bnd_Box()), faceArea = own(new oc.GProp_GProps());
      oc.BRepBndLib.AddOptimal(face, faceBounds, false, false); oc.BRepGProp.SurfaceProperties(face, faceArea, false, false);
      const uv = oc.BRepTools.UVBounds(face, 0, 0, 0, 0), p = own(new oc.gp_Pnt()), du = own(new oc.gp_Vec()), dv = own(new oc.gp_Vec());
      surface.D1((uv.UMin + uv.UMax) / 2, (uv.VMin + uv.VMax) / 2, p, du, dv);
      const u = tuple(du), v = tuple(dv), cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], length = Math.hypot(...cross);
      check(Number.isFinite(length) && length > 0, 'Native planar derivatives define a nondegenerate normal');
      const orientation = face.Orientation();
      check(orientation === oc.TopAbs_Orientation.TopAbs_FORWARD || orientation === oc.TopAbs_Orientation.TopAbs_REVERSED, 'Exported plane has material orientation');
      const sign = orientation === oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1;
      planes.push({ area: faceArea.Mass(), normal: cross.map(value => sign * value / length),
        min: [faceBounds.GetXMin(), faceBounds.GetYMin(), faceBounds.GetZMin()], max: [faceBounds.GetXMax(), faceBounds.GetYMax(), faceBounds.GetZMax()] });
      faceExplorer.Next();
    }
    const expectedPlanes = kind === 'shell' ? [
      { area: 100, normal: [0, 0, -1], min: [-5, -5, 0], max: [5, 5, 0] },
      { area: 36, normal: [0, 0, 1], min: [-5, -5, 10], max: [5, 5, 10] },
      { area: 64, normal: [0, 0, 1], min: [-4, -4, 1], max: [4, 4, 1] },
      { area: 100, normal: [1, 0, 0], min: [5, -5, 0], max: [5, 5, 10] },
      { area: 100, normal: [-1, 0, 0], min: [-5, -5, 0], max: [-5, 5, 10] },
      { area: 100, normal: [0, 1, 0], min: [-5, 5, 0], max: [5, 5, 10] },
      { area: 100, normal: [0, -1, 0], min: [-5, -5, 0], max: [5, -5, 10] },
      { area: 72, normal: [-1, 0, 0], min: [4, -4, 1], max: [4, 4, 10] },
      { area: 72, normal: [1, 0, 0], min: [-4, -4, 1], max: [-4, 4, 10] },
      { area: 72, normal: [0, -1, 0], min: [-4, 4, 1], max: [4, 4, 10] },
      { area: 72, normal: [0, 1, 0], min: [-4, -4, 1], max: [4, -4, 10] },
    ] : [
      { area: 100, normal: [0, 0, -1], min: [-5, -5, 0], max: [5, 5, 0] },
      { area: 144, normal: [0, 0, 1], min: [-6, -6, 10], max: [6, 6, 10] },
      { area: 11 * Math.sqrt(101), normal: [10 / Math.sqrt(101), 0, -1 / Math.sqrt(101)], min: [5, -6, 0], max: [6, 6, 10] },
      { area: 11 * Math.sqrt(101), normal: [-10 / Math.sqrt(101), 0, -1 / Math.sqrt(101)], min: [-6, -6, 0], max: [-5, 6, 10] },
      { area: 11 * Math.sqrt(101), normal: [0, 10 / Math.sqrt(101), -1 / Math.sqrt(101)], min: [-6, 5, 0], max: [6, 6, 10] },
      { area: 11 * Math.sqrt(101), normal: [0, -10 / Math.sqrt(101), -1 / Math.sqrt(101)], min: [-6, -6, 0], max: [6, -5, 10] },
    ];
    check(planes.length === expectedPlanes.length, 'Exact native planar face count proves bounded ' + kind + ' topology');
    for (const expected of expectedPlanes) {
      const matches = planes.filter(plane => ['min', 'max'].every(side => expected[side].every((value, index) => Math.abs(plane[side][index] - value) <= 1e-6)));
      check(matches.length === 1, 'One native trimmed plane for each literal opening/wall/section');
      near(matches[0].area, expected.area, 1e-5, 'Independent physical plane area');
      expected.normal.forEach((value, index) => near(matches[0].normal[index], value, 1e-8, 'Independent outward/material plane normal'));
    }
    result = { kind, reader: 'Separate native STEP reader; same kernel family, not independent interoperability',
      solidCount: 1, measured, analytical, planes, expectedPlanes, tolerances: { volumeMm3: 1e-5, areaMm2: 1e-5, boundsMm: 1e-6, normal: 1e-8 } };
  } catch (error) { primary = error; }
  finally { for (const owner of owners.reverse()) { try { owner.delete(); } catch (error) { cleanupErrors.push(error); } } }
  if (primary || cleanupErrors.length) throw new AggregateError(primary ? [primary, ...cleanupErrors] : cleanupErrors,
    'Face-operation STEP measurement or cleanup failed', { cause: primary ?? cleanupErrors[0] });
  return result;
};
