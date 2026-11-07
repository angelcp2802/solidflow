'use strict';
const fsp = require('node:fs/promises');

// Actual exported bytes, separate native instance, original formula oracles.
// Same OpenCascade family: no independent-kernel interoperability claim.
module.exports = async function measureHoleStep(bytes, check) {
  const text = bytes.toString('utf8');
  check(text.startsWith('ISO-10303-21;') && /END-ISO-10303-21;\s*$/.test(text)
    && /SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/.test(text), 'Complete millimetre hole STEP');
  const wasmBinary = await fsp.readFile(require.resolve('replicad-opencascadejs/wasm'));
  const oc = await require('replicad-opencascadejs')({ wasmBinary, print: () => undefined });
  const owners = [], cleanupErrors = [], file = '/original-hole.step';
  const own = item => { owners.push(item); return item; };
  const near = (actual, expected, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    label + ': actual=' + actual + ', expected=' + expected + ', tolerance=' + tolerance);
  let primary, result;
  try {
    own({ delete() { if (oc.FS.readdir('/').includes(file.slice(1))) oc.FS.unlink(file); } }); oc.FS.writeFile(file, bytes);
    const reader = own(new oc.STEPControl_Reader());
    check(reader.ReadFile(file) === oc.IFSelect_ReturnStatus.IFSelect_RetDone, 'Separate reader accepts actual hole STEP');
    reader.SetSystemLengthUnit(1); near(reader.SystemLengthUnit(), 1, 0, 'Hole STEP reader uses millimetres');
    const roots = reader.NbRootsForTransfer();
    check(roots > 0 && reader.TransferRoots() === roots, 'Every hole STEP root transfers');
    const shape = own(reader.OneShape()), analyzer = own(new oc.BRepCheck_Analyzer(shape, true, false, false));
    check(!shape.IsNull() && analyzer.IsValid(), 'Actual exported hole aggregate BRep is valid');
    const explorer = own(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    check(explorer.More(), 'One native exported hole solid exists');
    const solid = own(explorer.Current()), valid = own(new oc.BRepCheck_Analyzer(solid, true, false, false));
    check(valid.IsValid(), 'Exported plate with both counterbores has valid BRep'); explorer.Next();
    check(!explorer.More(), 'No additional exported hole solid');
    const volume = own(new oc.GProp_GProps()), area = own(new oc.GProp_GProps()), bounds = own(new oc.Bnd_Box());
    oc.BRepGProp.VolumeProperties(solid, volume, 1e-10, false, false);
    oc.BRepGProp.SurfaceProperties(solid, area, false, false); oc.BRepBndLib.AddOptimal(solid, bounds, false, false);
    const measured = { volume: volume.Mass(), area: area.Mass(),
      min: [bounds.GetXMin(), bounds.GetYMin(), bounds.GetZMin()], max: [bounds.GetXMax(), bounds.GetYMax(), bounds.GetZMax()] };
    const analytical = { volume: 2400 - 32 * Math.PI, area: 1120 + 44 * Math.PI, min: [-10, -6, 0], max: [10, 6, 10] };
    near(measured.volume, analytical.volume, 1e-5, 'Independent two-counterbore STEP volume');
    near(measured.area, analytical.area, 1e-5, 'Independent two-counterbore STEP area');
    for (const side of ['min', 'max']) analytical[side].forEach((value, axis) => near(measured[side][axis], value, 1e-6, 'Literal hole STEP bounds'));
    // Aggregate mass/area cannot distinguish displaced axes or a counterbore
    // cut from the wrong side. Query the actual trimmed cylindrical faces.
    const faceExplorer = own(new oc.TopExp_Explorer(solid, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE)), cylinders = [];
    while (faceExplorer.More()) {
      const raw = own(faceExplorer.Current()), face = own(oc.TopoDS.Face(raw)), surface = own(new oc.BRepAdaptor_Surface(face, false));
      if (surface.GetType() === oc.GeomAbs_SurfaceType.GeomAbs_Cylinder) {
        const cylinder = own(surface.Cylinder()), position = own(cylinder.Position()), origin = own(position.Location()), axis = own(position.Direction());
        const trimmed = own(new oc.Bnd_Box()); oc.BRepBndLib.AddOptimal(face, trimmed, false, false);
        cylinders.push({ radius: cylinder.Radius(), point: [origin.X(), origin.Y(), origin.Z()], axis: [axis.X(), axis.Y(), axis.Z()],
          min: [trimmed.GetXMin(), trimmed.GetYMin(), trimmed.GetZMin()], max: [trimmed.GetXMax(), trimmed.GetYMax(), trimmed.GetZMax()] });
      }
      faceExplorer.Next();
    }
    check(cylinders.length === 4, 'Exactly two through-bore and two counterbore cylindrical faces');
    const expectedCylinders = [-4, 4].flatMap(x => [{ x, radius: 1, zMin: 0, zMax: 8 }, { x, radius: 2, zMin: 8, zMax: 10 }]);
    for (const expected of expectedCylinders) {
      const matches = cylinders.filter(cylinder => Math.abs(cylinder.point[0] - expected.x) <= 1e-6
        && Math.abs(cylinder.point[1]) <= 1e-6 && Math.abs(cylinder.radius - expected.radius) <= 1e-6);
      check(matches.length === 1, 'One actual cylindrical face at each literal axis and radius');
      const cylinder = matches[0];
      near(cylinder.axis[0], 0, 1e-8, 'Actual cylindrical axis has no X tilt');
      near(cylinder.axis[1], 0, 1e-8, 'Actual cylindrical axis has no Y tilt');
      near(Math.abs(cylinder.axis[2]), 1, 1e-8, 'Actual cylindrical axis is parallel to world Z');
      for (const [side, values] of [['min', [expected.x - expected.radius, -expected.radius, expected.zMin]],
        ['max', [expected.x + expected.radius, expected.radius, expected.zMax]]])
        values.forEach((value, index) => near(cylinder[side][index], value, 1e-6, 'Literal trimmed bore/counterbore bounds'));
    }
    result = { reader: 'Separate native STEP reader; same kernel family, not independent interoperability',
      solidCount: 1, measured, analytical, cylinders, expectedCylinders,
      tolerances: { volumeMm3: 1e-5, areaMm2: 1e-5, boundsMm: 1e-6, cylinderAxisDirection: 1e-8 } };
  } catch (error) { primary = error; }
  finally { for (const owner of owners.reverse()) { try { owner.delete(); } catch (error) { cleanupErrors.push(error); } } }
  if (primary || cleanupErrors.length) throw new AggregateError(primary ? [primary, ...cleanupErrors] : cleanupErrors,
    'Hole STEP measurement or cleanup failed', { cause: primary ?? cleanupErrors[0] });
  return result;
};
