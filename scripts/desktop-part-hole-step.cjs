'use strict';
const fsp = require('node:fs/promises');
let nativePromise;

// Actual exported bytes, separate native instance, original formula oracles.
// Same OpenCascade family: no independent-kernel interoperability claim.
module.exports = async function measureHoleStep(bytes, check, variantState = null) {
  const text = bytes.toString('utf8');
  check(text.startsWith('ISO-10303-21;') && /END-ISO-10303-21;\s*$/.test(text)
    && /SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/.test(text), 'Complete millimetre hole STEP');
  nativePromise ??= fsp.readFile(require.resolve('replicad-opencascadejs/wasm')).then(wasmBinary => require('replicad-opencascadejs')({ wasmBinary, print: () => undefined }));
  const oc = await nativePromise;
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
    check(valid.IsValid(), 'Exported plate with both holes has valid BRep'); explorer.Next();
    check(!explorer.More(), 'No additional exported hole solid');
    const volume = own(new oc.GProp_GProps()), area = own(new oc.GProp_GProps()), bounds = own(new oc.Bnd_Box());
    oc.BRepGProp.VolumeProperties(solid, volume, 1e-10, false, false);
    oc.BRepGProp.SurfaceProperties(solid, area, false, false); oc.BRepBndLib.AddOptimal(solid, bounds, false, false);
    const measured = { volume: volume.Mass(), area: area.Mass(),
      min: [bounds.GetXMin(), bounds.GetYMin(), bounds.GetZMin()], max: [bounds.GetXMax(), bounds.GetYMax(), bounds.GetZMax()] };
    const analytical = variantState ? require('./desktop-part-hole-variants-oracles.cjs')(variantState)
      : { volume: 2400 - 32 * Math.PI, area: 1120 + 44 * Math.PI, min: [-10, -6, 0], max: [10, 6, 10] };
    near(measured.volume, analytical.volume, 1e-5, 'Independent two-hole STEP volume');
    near(measured.area, analytical.area, 1e-5, 'Independent two-hole STEP area');
    for (const side of ['min', 'max']) analytical[side].forEach((value, axis) => near(measured[side][axis], value, 1e-6, 'Literal hole STEP bounds'));
    // Aggregate mass/area cannot distinguish displaced axes or a counterbore
    // cut from the wrong side. Query the actual trimmed cylindrical faces.
    const faceExplorer = own(new oc.TopExp_Explorer(solid, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE)), cylinders = [], cones = [], planes = [];
    while (faceExplorer.More()) {
      const raw = own(faceExplorer.Current()), face = own(oc.TopoDS.Face(raw)), surface = own(new oc.BRepAdaptor_Surface(face, false));
      if (surface.GetType() === oc.GeomAbs_SurfaceType.GeomAbs_Cylinder) {
        const cylinder = own(surface.Cylinder()), position = own(cylinder.Position()), origin = own(position.Location()), axis = own(position.Direction());
        const trimmed = own(new oc.Bnd_Box()); oc.BRepBndLib.AddOptimal(face, trimmed, false, false);
        cylinders.push({ radius: cylinder.Radius(), point: [origin.X(), origin.Y(), origin.Z()], axis: [axis.X(), axis.Y(), axis.Z()],
          min: [trimmed.GetXMin(), trimmed.GetYMin(), trimmed.GetZMin()], max: [trimmed.GetXMax(), trimmed.GetYMax(), trimmed.GetZMax()] });
      } else if (variantState && surface.GetType() === oc.GeomAbs_SurfaceType.GeomAbs_Cone) {
        const trimmed = own(new oc.Bnd_Box()), properties = own(new oc.GProp_GProps());
        oc.BRepBndLib.AddOptimal(face, trimmed, false, false); oc.BRepGProp.SurfaceProperties(face, properties, false, false);
        const edges = own(new oc.TopExp_Explorer(face, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE)), rings = [], vertices = [];
        while (edges.More()) {
          const edge = own(oc.TopoDS.Edge(own(edges.Current())));
          if (!oc.BRep_Tool.Degenerated(edge)) {
            const curve = own(new oc.BRepAdaptor_Curve(edge));
            if (curve.GetType() === oc.GeomAbs_CurveType.GeomAbs_Circle) {
              const circle = own(curve.Circle()), location = own(circle.Location());
              rings.push({ radius: circle.Radius(), point: [location.X(), location.Y(), location.Z()] });
            }
          }
          edges.Next();
        }
        const points = own(new oc.TopExp_Explorer(face, oc.TopAbs_ShapeEnum.TopAbs_VERTEX, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
        while (points.More()) {
          const vertex = own(oc.TopoDS.Vertex(own(points.Current()))), point = own(oc.BRep_Tool.Pnt(vertex));
          vertices.push([point.X(), point.Y(), point.Z()]); points.Next();
        }
        // gp_Cone is unbound in the shipped WASM. The actual circular boundary
        // radii, apex vertex and trimmed axial extent independently give its angle.
        const min = [trimmed.GetXMin(), trimmed.GetYMin(), trimmed.GetZMin()], max = [trimmed.GetXMax(), trimmed.GetYMax(), trimmed.GetZMax()];
        const radii = [...new Set(rings.map(ring => ring.radius))].sort((a, b) => a - b), hasApex = vertices.some(point => Math.abs(point[2] - min[2]) <= 1e-6
          && Math.abs(point[0] - (min[0] + max[0]) / 2) <= 1e-6 && Math.abs(point[1] - (min[1] + max[1]) / 2) <= 1e-6);
        const radiusMin = hasApex ? 0 : radii[0], radiusMax = radii.at(-1);
        check(Number.isFinite(radiusMin) && Number.isFinite(radiusMax) && max[2] > min[2], 'Actual conical boundary radii and nonzero depth');
        cones.push({ semiAngle: Math.atan((radiusMax - radiusMin) / (max[2] - min[2])), area: properties.Mass(), min, max, rings, vertices, hasApex,
          angleSource: 'Native circular boundary radii/apex and trimmed axial extent; no gp_Cone binding' });
      } else if (variantState && surface.GetType() === oc.GeomAbs_SurfaceType.GeomAbs_Plane) {
        const properties = own(new oc.GProp_GProps()); oc.BRepGProp.SurfaceProperties(face, properties, false, false);
        const center = own(properties.CentreOfMass()); planes.push({ area: properties.Mass(), center: [center.X(), center.Y(), center.Z()] });
      }
      faceExplorer.Next();
    }
    const expectedCylinders = variantState ? analytical.cylinders
      : [-4, 4].flatMap(x => [{ x, radius: 1, zMin: 0, zMax: 8 }, { x, radius: 2, zMin: 8, zMax: 10 }]);
    check(cylinders.length === expectedCylinders.length, 'Exactly the announced physical cylindrical faces');
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
    if (variantState) {
      check(cones.length === analytical.cones.length, 'Exactly the announced physical conical faces');
      for (const expected of analytical.cones) {
        const matches = cones.filter(cone => Math.abs((cone.min[0] + cone.max[0]) / 2 - expected.x) <= 1e-6 && Math.abs((cone.min[1] + cone.max[1]) / 2) <= 1e-6);
        check(matches.length === 1, 'One physical cone at each original axis'); const cone = matches[0];
        near(cone.semiAngle, expected.semiAngle, 1e-8, 'Physical cone semi-angle'); near(cone.area, expected.lateralArea, 1e-5, 'Independent cone lateral area');
        for (const [side, wanted] of [['min', [expected.x - expected.radiusMax, -expected.radiusMax, expected.zMin]],
          ['max', [expected.x + expected.radiusMax, expected.radiusMax, expected.zMax]]]) wanted.forEach((value, i) => near(cone[side][i], value, 1e-6, 'Literal trimmed cone bounds'));
      }
      for (const expected of analytical.floors) {
        const matches = planes.filter(plane => Math.abs(plane.center[0] - expected.x) <= 1e-6 && Math.abs(plane.center[1]) <= 1e-6 && Math.abs(plane.center[2] - expected.z) <= 1e-6);
        check(matches.length === 1, 'One actual blind floor at each original axis/depth'); near(matches[0].area, expected.area, 1e-5, 'Independent blind-floor disk area');
      }
    }
    result = { reader: 'Separate native STEP reader; same kernel family, not independent interoperability',
      solidCount: 1, measured, analytical, cylinders, expectedCylinders, ...(variantState ? { variantState, cones, planes } : {}),
      tolerances: { volumeMm3: 1e-5, areaMm2: 1e-5, boundsMm: 1e-6, cylinderAxisDirection: 1e-8,
        ...(variantState ? { coneSemiAngleRadians: 1e-8 } : {}) } };
  } catch (error) { primary = error; }
  finally { for (const owner of owners.reverse()) { try { owner.delete(); } catch (error) { cleanupErrors.push(error); } } }
  if (primary || cleanupErrors.length) throw new AggregateError(primary ? [primary, ...cleanupErrors] : cleanupErrors,
    'Hole STEP measurement or cleanup failed', { cause: primary ?? cleanupErrors[0] });
  return result;
};
