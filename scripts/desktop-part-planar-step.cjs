'use strict';
const fsp = require('node:fs/promises');

// Same-family native reader. The caller supplies independently derived planar
// geometry oracles. Native STEP objects are owned and retired in this function.
module.exports = async function measurePlanarStep(bytes, check, analytical, { label, volume, area }) {
  const text = bytes.toString('utf8');
  check(text.startsWith('ISO-10303-21;') && /END-ISO-10303-21;\s*$/.test(text)
    && /SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/.test(text), 'Complete millimetre ' + label + ' STEP');
  const wasmBinary = await fsp.readFile(require.resolve('replicad-opencascadejs/wasm'));
  const oc = await require('replicad-opencascadejs')({ wasmBinary, print: () => undefined });
  const owners = [], cleanupErrors = [], file = '/original-planar-proof.step';
  const own = value => { owners.push(value); return value; };
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    label + ': actual=' + actual + ', expected=' + wanted + ', tolerance=' + tolerance);
  const tuple = value => [value.X(), value.Y(), value.Z()];
  const box = b => ({ min: [b.GetXMin(), b.GetYMin(), b.GetZMin()], max: [b.GetXMax(), b.GetYMax(), b.GetZMax()] });
  let primary, result;
  try {
    own({ delete() { if (oc.FS.readdir('/').includes(file.slice(1))) oc.FS.unlink(file); } }); oc.FS.writeFile(file, bytes);
    const reader = own(new oc.STEPControl_Reader());
    check(reader.ReadFile(file) === oc.IFSelect_ReturnStatus.IFSelect_RetDone, 'Separate reader accepts actual ' + label + ' STEP');
    reader.SetSystemLengthUnit(1); near(reader.SystemLengthUnit(), 1, 0, 'Positive ALL STEP uses millimetres');
    const roots = reader.NbRootsForTransfer(); check(roots > 0 && reader.TransferRoots() === roots, 'All ' + label + ' STEP roots transfer');
    const shape = own(reader.OneShape()), validity = own(new oc.BRepCheck_Analyzer(shape, true, false, false));
    check(!shape.IsNull() && validity.IsValid(), 'Exported ' + label + ' compound is a valid BRep');
    const solids = own(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE)), measured = [];
    while (solids.More()) {
      const solid = own(solids.Current()), valid = own(new oc.BRepCheck_Analyzer(solid, true, false, false));
      check(valid.IsValid(), 'Each exported ' + label + ' solid is independently valid');
      const mass = own(new oc.GProp_GProps()), area = own(new oc.GProp_GProps()), bounds = own(new oc.Bnd_Box());
      oc.BRepGProp.VolumeProperties(solid, mass, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(solid, area, false, false);
      oc.BRepBndLib.AddOptimal(solid, bounds, false, false);
      const center = own(mass.CentreOfMass()), value = { volume: mass.Mass(), area: area.Mass(), centroid: tuple(center), ...box(bounds), planes: [] };
      check(Number.isFinite(value.volume) && value.volume > 0, 'Each actual exported owner has strictly positive volume');
      const faces = own(new oc.TopExp_Explorer(solid, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
      while (faces.More()) {
        const raw = own(faces.Current()), face = own(oc.TopoDS.Face(raw)), surface = own(new oc.BRepAdaptor_Surface(face, false));
        check(surface.GetType() === oc.GeomAbs_SurfaceType.GeomAbs_Plane, 'Every original planar face is an actual native plane');
        const faceArea = own(new oc.GProp_GProps()), faceBounds = own(new oc.Bnd_Box());
        oc.BRepGProp.SurfaceProperties(face, faceArea, false, false); oc.BRepBndLib.AddOptimal(face, faceBounds, false, false);
        const uv = oc.BRepTools.UVBounds(face, 0, 0, 0, 0), p = own(new oc.gp_Pnt()), du = own(new oc.gp_Vec()), dv = own(new oc.gp_Vec());
        surface.D1((uv.UMin + uv.UMax) / 2, (uv.VMin + uv.VMax) / 2, p, du, dv);
        const u = tuple(du), v = tuple(dv), cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], length = Math.hypot(...cross);
        check(Number.isFinite(length) && length > 0, 'Actual exported plane has nondegenerate derivatives');
        const orientation = face.Orientation();
        check(orientation === oc.TopAbs_Orientation.TopAbs_FORWARD || orientation === oc.TopAbs_Orientation.TopAbs_REVERSED, 'Actual plane has material orientation');
        const sign = orientation === oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1;
        value.planes.push({ area: faceArea.Mass(), normal: cross.map(component => sign * component / length), ...box(faceBounds) });
        faces.Next();
      }
      measured.push(value); solids.Next();
    }
    measured.sort((a, b) => Math.round(a.min[0] * 1e6) - Math.round(b.min[0] * 1e6) || a.min[2] - b.min[2]);
    check(measured.length === analytical.length, 'Every original current owner survives ' + label + ' export');
    for (const [index, wanted] of analytical.entries()) {
      const actual = measured[index];
      near(actual.volume, wanted.volume, 1e-5, 'Independent ' + wanted.name + ' volume');
      near(actual.area, wanted.area, 1e-5, 'Independent ' + wanted.name + ' surface area');
      for (const key of ['min', 'max', 'centroid']) wanted[key].forEach((v, axis) => near(actual[key][axis], v, 1e-6, 'Literal ' + wanted.name + ' ' + key));
      check(actual.planes.length === wanted.planes.length, 'Exact physical plane count for ' + wanted.name);
      const used = new Set();
      for (const expected of wanted.planes) {
        const matches = actual.planes.flatMap((plane, index) => ['min', 'max'].every(side => expected[side].every((v, axis) => Math.abs(plane[side][axis] - v) <= 1e-6)) ? [index] : []);
        check(matches.length === 1 && !used.has(matches[0]), 'One unique actual trimmed plane for each literal planar wall'); used.add(matches[0]);
        const match = actual.planes[matches[0]];
        near(match.area, expected.area, 1e-5, 'Literal planar trimmed plane area');
        expected.normal.forEach((v, axis) => near(match.normal[axis], v, 1e-8, 'Actual outward planar material normal'));
      }
    }
    near(measured.reduce((sum, item) => sum + item.volume, 0), volume, 1e-5, 'Independent total exported volume');
    near(measured.reduce((sum, item) => sum + item.area, 0), area, 1e-5, 'Independent total exported area');
    result = { reader: 'Separate native STEP instance of the same kernel family; not independent interoperability', measured, analytical,
      tolerances: { volumeMm3: 1e-5, areaMm2: 1e-5, positionMm: 1e-6, normal: 1e-8 } };
  } catch (error) { primary = error; }
  finally { for (const owner of owners.reverse()) { try { owner.delete(); } catch (error) { cleanupErrors.push(error); } } }
  if (primary || cleanupErrors.length) throw new AggregateError(primary ? [primary, ...cleanupErrors] : cleanupErrors,
    '' + label + ' STEP measurement or cleanup failed', { cause: primary ?? cleanupErrors[0] });
  return result;
};
