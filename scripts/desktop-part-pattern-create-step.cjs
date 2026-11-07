'use strict';
const fsp = require('node:fs/promises');

// Independent literal cube poses. No production pattern/transform helper or
// saved native result supplies expected locations, axes, normals or dimensions.
module.exports = async function measurePatternStep(bytes, kind, check) {
  check(['linear', 'circular', 'mirror'].includes(kind), 'One fixed original pattern kind');
  const text = bytes.toString('utf8');
  check(text.startsWith('ISO-10303-21;') && /END-ISO-10303-21;\s*$/.test(text)
    && /SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/.test(text), 'Complete millimetre pattern STEP');
  const root3 = Math.sqrt(3), seed = { center: [6, 0, 2], u: [1, 0, 0], v: [0, 1, 0] };
  const poses = [seed, ...(kind === 'linear' ? [
    { center: [14, 0, 2], u: [1, 0, 0], v: [0, 1, 0] }, { center: [22, 0, 2], u: [1, 0, 0], v: [0, 1, 0] },
  ] : kind === 'circular' ? [
    { center: [-3, 3 * root3, 2], u: [-0.5, root3 / 2, 0], v: [-root3 / 2, -0.5, 0] },
    { center: [-3, -3 * root3, 2], u: [-0.5, -root3 / 2, 0], v: [root3 / 2, -0.5, 0] },
  ] : [{ center: [-2, 0, 2], u: [1, 0, 0], v: [0, 1, 0] }])];
  const expectedPlanes = pose => {
    const basis = [pose.u, pose.v, [0, 0, 1]], planes = [];
    for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
      const points = [];
      for (const a of [-1, 1]) for (const b of [-1, 1]) {
        const signs = [a, b]; signs.splice(axis, 0, sign);
        points.push(pose.center.map((value, index) => value + basis.reduce((sum, vector, j) => sum + 2 * signs[j] * vector[index], 0)));
      }
      planes.push({ area: 16, normal: basis[axis].map(value => sign * value),
        min: [0, 1, 2].map(index => Math.min(...points.map(point => point[index]))),
        max: [0, 1, 2].map(index => Math.max(...points.map(point => point[index]))) });
    }
    return planes;
  };
  const wasmBinary = await fsp.readFile(require.resolve('replicad-opencascadejs/wasm'));
  const oc = await require('replicad-opencascadejs')({ wasmBinary, print: () => undefined });
  const owners = [], cleanupErrors = [], file = '/original-pattern.step';
  const own = item => { owners.push(item); return item; };
  const tuple = value => [value.X(), value.Y(), value.Z()];
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    label + ': actual=' + actual + ', expected=' + wanted + ', tolerance=' + tolerance);
  const boundsOf = shape => {
    const bounds = own(new oc.Bnd_Box()); oc.BRepBndLib.AddOptimal(shape, bounds, false, false);
    return { min: [bounds.GetXMin(), bounds.GetYMin(), bounds.GetZMin()], max: [bounds.GetXMax(), bounds.GetYMax(), bounds.GetZMax()] };
  };
  let primary, result;
  try {
    own({ delete() { if (oc.FS.readdir('/').includes(file.slice(1))) oc.FS.unlink(file); } }); oc.FS.writeFile(file, bytes);
    const reader = own(new oc.STEPControl_Reader());
    check(reader.ReadFile(file) === oc.IFSelect_ReturnStatus.IFSelect_RetDone, 'Separate reader accepts actual pattern STEP');
    reader.SetSystemLengthUnit(1); near(reader.SystemLengthUnit(), 1, 0, 'Pattern STEP uses millimetres');
    const roots = reader.NbRootsForTransfer(); check(roots > 0 && reader.TransferRoots() === roots, 'All actual pattern roots transfer');
    const shape = own(reader.OneShape()), valid = own(new oc.BRepCheck_Analyzer(shape, true, false, false));
    check(!shape.IsNull() && valid.IsValid(), 'Complete exported pattern BRep is valid');
    const explorer = own(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE)), solids = [];
    while (explorer.More()) {
      const solid = own(explorer.Current()), solidValid = own(new oc.BRepCheck_Analyzer(solid, true, false, false));
      check(solidValid.IsValid(), 'Each separate pattern solid is BRep-valid');
      const mass = own(new oc.GProp_GProps()), area = own(new oc.GProp_GProps());
      oc.BRepGProp.VolumeProperties(solid, mass, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(solid, area, false, false);
      const center = own(mass.CentreOfMass()), measured = { volume: mass.Mass(), area: area.Mass(), center: tuple(center), ...boundsOf(solid), planes: [] };
      check(measured.volume > 0, 'Every pattern copy has positive material volume');
      const faces = own(new oc.TopExp_Explorer(solid, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
      while (faces.More()) {
        const raw = own(faces.Current()), face = own(oc.TopoDS.Face(raw)), surface = own(new oc.BRepAdaptor_Surface(face, false)), faceArea = own(new oc.GProp_GProps());
        check(surface.GetType() === oc.GeomAbs_SurfaceType.GeomAbs_Plane, 'Every positioned cube face is an actual native plane');
        oc.BRepGProp.SurfaceProperties(face, faceArea, false, false);
        const uv = oc.BRepTools.UVBounds(face, 0, 0, 0, 0), p = own(new oc.gp_Pnt()), du = own(new oc.gp_Vec()), dv = own(new oc.gp_Vec());
        surface.D1((uv.UMin + uv.UMax) / 2, (uv.VMin + uv.VMax) / 2, p, du, dv);
        const u = tuple(du), v = tuple(dv), cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], length = Math.hypot(...cross);
        check(Number.isFinite(length) && length > 0, 'Native plane derivatives define a nondegenerate normal');
        const orientation = face.Orientation();
        check(orientation === oc.TopAbs_Orientation.TopAbs_FORWARD || orientation === oc.TopAbs_Orientation.TopAbs_REVERSED, 'Each physical cube face has a material orientation');
        const sign = orientation === oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1;
        measured.planes.push({ area: faceArea.Mass(), normal: cross.map(value => sign * value / length), ...boundsOf(face) }); faces.Next();
      }
      solids.push(measured); explorer.Next();
    }
    check(solids.length === poses.length, 'Exact independent exported pattern solid count');
    for (const pose of poses) {
      const matches = solids.filter(solid => pose.center.every((value, axis) => Math.abs(solid.center[axis] - value) <= 1e-6));
      check(matches.length === 1, 'One physical STEP solid at each literal expected centroid');
      const solid = matches[0], planes = expectedPlanes(pose);
      near(solid.volume, 64, 1e-5, 'Independent exported 4 mm cube volume'); near(solid.area, 96, 1e-5, 'Independent exported cube area');
      check(solid.planes.length === 6, 'Exactly six physical planar faces per copy');
      for (const expected of planes) {
        const matching = solid.planes.filter(plane => ['min', 'max'].every(side => expected[side].every((value, axis) => Math.abs(plane[side][axis] - value) <= 1e-6))
          && expected.normal.every((value, axis) => Math.abs(plane.normal[axis] - value) <= 1e-8));
        check(matching.length === 1, 'Literal rotated/translated trimmed cube face and outward normal match once');
        near(matching[0].area, 16, 1e-5, 'Independent positioned physical face area');
      }
      for (const side of ['min', 'max']) for (let axis = 0; axis < 3; axis++) near(solid[side][axis],
        (side === 'min' ? Math.min : Math.max)(...planes.map(plane => plane[side][axis])), 1e-6, 'Literal oriented solid bounds');
    }
    const aggregateBounds = boundsOf(shape), global = kind === 'linear' ? { min: [4, -2, 0], max: [24, 2, 4] }
      : kind === 'circular' ? { min: [-4 - root3, -4 * root3 - 1, 0], max: [8, 4 * root3 + 1, 4] }
        : { min: [-4, -2, 0], max: [8, 2, 4] };
    for (const side of ['min', 'max']) global[side].forEach((value, axis) => near(aggregateBounds[side][axis], value, 1e-6, 'Independent complete pattern bounds'));
    near(solids.reduce((sum, solid) => sum + solid.volume, 0), 64 * poses.length, 1e-5, 'Complete independent pattern STEP volume');
    near(solids.reduce((sum, solid) => sum + solid.area, 0), 96 * poses.length, 1e-5, 'Complete independent pattern STEP surface area');
    result = { kind, reader: 'Separate native STEP instance; same kernel family, not independent interoperability', solids, poses, aggregateBounds,
      mirrorLimit: 'Symmetric cube proves reflected placement and plane alignment; no general chirality claim',
      tolerances: { volumeMm3: 1e-5, areaMm2: 1e-5, positionMm: 1e-6, normal: 1e-8 } };
  } catch (error) { primary = error; }
  finally { for (const owner of owners.reverse()) { try { owner.delete(); } catch (error) { cleanupErrors.push(error); } } }
  if (primary || cleanupErrors.length) throw new AggregateError(primary ? [primary, ...cleanupErrors] : cleanupErrors,
    'Pattern STEP measurement or native cleanup failed', { cause: primary ?? cleanupErrors[0] });
  return result;
};
