'use strict';
const fsp = require('node:fs/promises');

// Separate real STEP reader. Literal rectangle/cylinder/half-cylinder oracles;
// no production sketch, extrusion, transform or measurement helper is imported.
module.exports = async function measurePrimitiveStep(bytes, kind, check) {
  check(['rectangle', 'circle', 'semicircle'].includes(kind), 'One fixed original primitive kind');
  const text = bytes.toString('utf8'); check(text.startsWith('ISO-10303-21;') && /END-ISO-10303-21;\s*$/.test(text)
    && /SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/.test(text), 'Complete millimetre primitive STEP');
  const expected = kind === 'rectangle' ? { volume: 36, area: 72, min: [0, 0, 0], max: [6, 2, 3], center: [3, 1, 1.5] }
    : kind === 'circle' ? { volume: 12 * Math.PI, area: 20 * Math.PI, min: [-2, -2, 0], max: [2, 2, 3], center: [0, 0, 1.5] }
      : { volume: 6 * Math.PI, area: 10 * Math.PI + 12, min: [-2, 0, 0], max: [2, 2, 3], center: [0, 8 / (3 * Math.PI), 1.5] };
  const wasmBinary = await fsp.readFile(require.resolve('replicad-opencascadejs/wasm'));
  const oc = await require('replicad-opencascadejs')({ wasmBinary, print: () => undefined });
  const owners = [], cleanupErrors = [], file = '/original-sketch-primitive.step';
  const own = value => { owners.push(value); return value; }, tuple = value => [value.X(), value.Y(), value.Z()];
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    label + ': actual=' + actual + ', expected=' + wanted + ', tolerance=' + tolerance);
  const boundsOf = shape => { const box = own(new oc.Bnd_Box()); oc.BRepBndLib.AddOptimal(shape, box, false, false);
    return { min: [box.GetXMin(), box.GetYMin(), box.GetZMin()], max: [box.GetXMax(), box.GetYMax(), box.GetZMax()] }; };
  let primary, result;
  try {
    own({ delete() { if (oc.FS.readdir('/').includes(file.slice(1))) oc.FS.unlink(file); } }); oc.FS.writeFile(file, bytes);
    const reader = own(new oc.STEPControl_Reader()); check(reader.ReadFile(file) === oc.IFSelect_ReturnStatus.IFSelect_RetDone, 'Separate reader accepts actual pointer-authored STEP');
    reader.SetSystemLengthUnit(1); near(reader.SystemLengthUnit(), 1, 0, 'Primitive STEP uses millimetres');
    const roots = reader.NbRootsForTransfer(); check(roots > 0 && reader.TransferRoots() === roots, 'All actual primitive roots transfer');
    const shape = own(reader.OneShape()), valid = own(new oc.BRepCheck_Analyzer(shape, true, false, false));
    check(!shape.IsNull() && valid.IsValid(), 'Actual exported primitive BRep is valid');
    const solids = own(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    check(solids.More(), 'One actual primitive solid exists'); const solid = own(solids.Current()); solids.Next(); check(!solids.More(), 'No additional primitive solid');
    const volume = own(new oc.GProp_GProps()), area = own(new oc.GProp_GProps()); oc.BRepGProp.VolumeProperties(solid, volume, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(solid, area, false, false);
    const center = own(volume.CentreOfMass()), measured = { volume: volume.Mass(), area: area.Mass(), center: tuple(center), ...boundsOf(solid) };
    check(measured.volume > 0, 'Actual primitive has positive material volume'); near(measured.volume, expected.volume, 1e-5, 'Independent primitive STEP volume'); near(measured.area, expected.area, 1e-5, 'Independent exact primitive STEP area');
    for (const key of ['min', 'max', 'center']) expected[key].forEach((value, axis) => near(measured[key][axis], value, 1e-6, 'Literal primitive STEP ' + key));
    const faces = own(new oc.TopExp_Explorer(solid, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE)), planes = [], cylinders = [];
    while (faces.More()) {
      const raw = own(faces.Current()), face = own(oc.TopoDS.Face(raw)), surface = own(new oc.BRepAdaptor_Surface(face, false)), mass = own(new oc.GProp_GProps());
      oc.BRepGProp.SurfaceProperties(face, mass, false, false); const physical = { area: mass.Mass(), ...boundsOf(face) };
      if (surface.GetType() === oc.GeomAbs_SurfaceType.GeomAbs_Plane) {
        const uv = oc.BRepTools.UVBounds(face, 0, 0, 0, 0), p = own(new oc.gp_Pnt()), du = own(new oc.gp_Vec()), dv = own(new oc.gp_Vec());
        surface.D1((uv.UMin + uv.UMax) / 2, (uv.VMin + uv.VMax) / 2, p, du, dv);
        const u = tuple(du), v = tuple(dv), cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], length = Math.hypot(...cross), orientation = face.Orientation();
        check(Number.isFinite(length) && length > 0 && [oc.TopAbs_Orientation.TopAbs_FORWARD, oc.TopAbs_Orientation.TopAbs_REVERSED].includes(orientation), 'Native planar face has nondegenerate material normal');
        const sign = orientation === oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1; planes.push({ ...physical, normal: cross.map(value => sign * value / length) });
      } else {
        check(surface.GetType() === oc.GeomAbs_SurfaceType.GeomAbs_Cylinder && kind !== 'rectangle', 'Only the expected actual circular cylinder is present');
        const cylinder = own(surface.Cylinder()), frame = own(cylinder.Position()), location = own(frame.Location()), direction = own(frame.Direction());
        cylinders.push({ ...physical, radius: cylinder.Radius(), location: tuple(location), direction: tuple(direction) });
      }
      faces.Next();
    }
    const expectedPlanes = kind === 'rectangle' ? [
      { area: 12, normal: [0, 0, -1], min: [0, 0, 0], max: [6, 2, 0] }, { area: 12, normal: [0, 0, 1], min: [0, 0, 3], max: [6, 2, 3] },
      { area: 6, normal: [-1, 0, 0], min: [0, 0, 0], max: [0, 2, 3] }, { area: 6, normal: [1, 0, 0], min: [6, 0, 0], max: [6, 2, 3] },
      { area: 18, normal: [0, -1, 0], min: [0, 0, 0], max: [6, 0, 3] }, { area: 18, normal: [0, 1, 0], min: [0, 2, 0], max: [6, 2, 3] },
    ] : [
      { area: kind === 'circle' ? 4 * Math.PI : 2 * Math.PI, normal: [0, 0, -1], min: [-2, expected.min[1], 0], max: [2, 2, 0] },
      { area: kind === 'circle' ? 4 * Math.PI : 2 * Math.PI, normal: [0, 0, 1], min: [-2, expected.min[1], 3], max: [2, 2, 3] },
      ...(kind === 'semicircle' ? [{ area: 12, normal: [0, -1, 0], min: [-2, 0, 0], max: [2, 0, 3] }] : []),
    ];
    check(planes.length === expectedPlanes.length && cylinders.length === (kind === 'rectangle' ? 0 : 1), 'Exact physical cap/wall/cylinder topology');
    for (const plane of expectedPlanes) {
      const matches = planes.filter(actual => ['min', 'max'].every(key => plane[key].every((value, axis) => Math.abs(actual[key][axis] - value) <= 1e-6))
        && plane.normal.every((value, axis) => Math.abs(actual.normal[axis] - value) <= 1e-8));
      check(matches.length === 1, 'One literal physical trimmed cap or wall with correct outward normal'); near(matches[0].area, plane.area, 1e-5, 'Independent physical cap/wall area');
    }
    if (cylinders.length) {
      const cylinder = cylinders[0]; near(cylinder.radius, 2, 1e-8, 'Actual cylindrical surface radius');
      near(cylinder.location[0], 0, 1e-6, 'Literal cylinder axis X'); near(cylinder.location[1], 0, 1e-6, 'Literal cylinder axis Y');
      near(cylinder.direction[0], 0, 1e-8, 'Cylinder direction X'); near(cylinder.direction[1], 0, 1e-8, 'Cylinder direction Y'); near(Math.abs(cylinder.direction[2]), 1, 1e-8, 'Actual cylinder axis parallel Z');
      near(cylinder.area, (kind === 'circle' ? 12 : 6) * Math.PI, 1e-5, 'Independent full/half cylindrical face area');
      for (const key of ['min', 'max']) expected[key].forEach((value, axis) => near(cylinder[key][axis], value, 1e-6, 'Literal full/upper-half cylindrical trim bounds'));
    }
    result = { kind, reader: 'Separate native STEP instance, same kernel family; not independent interoperability', measured, expected, planes, cylinders,
      tolerances: { volumeMm3: 1e-5, areaMm2: 1e-5, positionMm: 1e-6, normal: 1e-8 } };
  } catch (error) { primary = error; }
  finally { for (const owner of owners.reverse()) { try { owner.delete(); } catch (error) { cleanupErrors.push(error); } } }
  if (primary || cleanupErrors.length) throw new AggregateError(primary ? [primary, ...cleanupErrors] : cleanupErrors, 'Primitive STEP measurement or cleanup failed', { cause: primary ?? cleanupErrors[0] });
  return result;
};
