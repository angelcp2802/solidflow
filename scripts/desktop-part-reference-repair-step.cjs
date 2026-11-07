'use strict';
const fsp = require('node:fs/promises');

// Actual STEP geometry is checked with a separate native instance and literal
// stepped-prism oracles. No independent-kernel interoperability claim.
module.exports = async function measureReferenceRepairStep(bytes, check) {
  const kind = 'support-repair';
  const text = bytes.toString('utf8');
  check(text.startsWith('ISO-10303-21;') && /END-ISO-10303-21;\s*$/.test(text)
    && /SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/.test(text), 'Complete millimetre support-recovery STEP');
  const wasmBinary = await fsp.readFile(require.resolve('replicad-opencascadejs/wasm'));
  const oc = await require('replicad-opencascadejs')({ wasmBinary, print: () => undefined });
  const owners = [], cleanupErrors = [], file = '/original-support-recovery.step';
  const own = item => { owners.push(item); return item; };
  const near = (actual, expected, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    label + ': actual=' + actual + ', expected=' + expected + ', tolerance=' + tolerance);
  const tuple = value => [value.X(), value.Y(), value.Z()];
  let primary, result;
  try {
    own({ delete() { if (oc.FS.readdir('/').includes(file.slice(1))) oc.FS.unlink(file); } }); oc.FS.writeFile(file, bytes);
    const reader = own(new oc.STEPControl_Reader());
    check(reader.ReadFile(file) === oc.IFSelect_ReturnStatus.IFSelect_RetDone, 'Separate reader accepts actual support-recovery STEP');
    reader.SetSystemLengthUnit(1); near(reader.SystemLengthUnit(), 1, 0, 'Support-recovery STEP uses millimetres');
    const roots = reader.NbRootsForTransfer(); check(roots > 0 && reader.TransferRoots() === roots, 'All support-recovery STEP roots transfer');
    const shape = own(reader.OneShape()), valid = own(new oc.BRepCheck_Analyzer(shape, true, false, false));
    check(!shape.IsNull() && valid.IsValid(), 'Exported support-recovery BRep is valid');
    const solids = own(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    check(solids.More(), 'One actual exported support-recovery solid exists'); const solid = own(solids.Current()); solids.Next();
    check(!solids.More(), 'No additional exported support-recovery solid');
    const mass = own(new oc.GProp_GProps()), area = own(new oc.GProp_GProps()), bounds = own(new oc.Bnd_Box());
    oc.BRepGProp.VolumeProperties(solid, mass, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(solid, area, false, false);
    oc.BRepBndLib.AddOptimal(solid, bounds, false, false);
    const measured = { volume: mass.Mass(), area: area.Mass(), min: [bounds.GetXMin(), bounds.GetYMin(), bounds.GetZMin()], max: [bounds.GetXMax(), bounds.GetYMax(), bounds.GetZMax()] };
    const analytical = { volume: 368, area: 328, min: [-5,-3,-8], max: [5,3,0], centroid: [0,0,-71/23] };
    near(measured.volume, analytical.volume, 1e-5, 'Literal repaired STEP volume');
    near(measured.area, analytical.area, 1e-5, 'Literal repaired STEP area');
    const centre = own(mass.CentreOfMass()); measured.centroid = tuple(centre);
    for (const side of ['min','max','centroid']) analytical[side].forEach((v,i)=>near(measured[side][i],v,1e-6,'Literal repaired STEP '+side));
    const faceExplorer = own(new oc.TopExp_Explorer(solid, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE)), planes = [];
    while (faceExplorer.More()) {
      const raw = own(faceExplorer.Current()), face = own(oc.TopoDS.Face(raw)), surface = own(new oc.BRepAdaptor_Surface(face, false));
      check(surface.GetType() === oc.GeomAbs_SurfaceType.GeomAbs_Plane, 'Every original support-recovery face remains an actual native plane');
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
    const expectedPlanes = [
      {area:60,normal:[0,0,1],min:[-5,-3,0],max:[5,3,0]},
      {area:56,normal:[0,0,-1],min:[-5,-3,-6],max:[5,3,-6]},
      {area:4,normal:[0,0,-1],min:[-1,-1,-8],max:[1,1,-8]},
      {area:36,normal:[1,0,0],min:[5,-3,-6],max:[5,3,0]},
      {area:36,normal:[-1,0,0],min:[-5,-3,-6],max:[-5,3,0]},
      {area:60,normal:[0,1,0],min:[-5,3,-6],max:[5,3,0]},
      {area:60,normal:[0,-1,0],min:[-5,-3,-6],max:[5,-3,0]},
      {area:4,normal:[1,0,0],min:[1,-1,-8],max:[1,1,-6]},
      {area:4,normal:[-1,0,0],min:[-1,-1,-8],max:[-1,1,-6]},
      {area:4,normal:[0,1,0],min:[-1,1,-8],max:[1,1,-6]},
      {area:4,normal:[0,-1,0],min:[-1,-1,-8],max:[1,-1,-6]},
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
    'Support-recovery STEP measurement or cleanup failed', { cause: primary ?? cleanupErrors[0] });
  return result;
};
