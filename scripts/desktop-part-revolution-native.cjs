'use strict';
const fsp = require('node:fs/promises');

// Independent native reader of the actual exported bytes. This runtime has no
// access to the application worker's shapes, previews or retained capabilities.
module.exports = async function verifyRevolutionStep(bytes, check) {
  const text = bytes.toString('utf8');
  check(text.startsWith('ISO-10303-21;') && /END-ISO-10303-21;\s*$/.test(text), 'Complete real STEP exchange file');
  check(/SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/.test(text), 'Actual STEP uses millimetres');
  check((text.match(/=\s*MANIFOLD_SOLID_BREP\s*\(/g) ?? []).length === 1, 'Actual STEP contains one manifold solid entity');
  const oc = await require('replicad-opencascadejs')({
    wasmBinary: await fsp.readFile(require.resolve('replicad-opencascadejs/wasm')), print: () => undefined,
  });
  const owners = [], cleanup = [], path = '/original-revolved-sleeve.step';
  const own = value => { owners.push(value); return value; };
  const near = (value, expected, tolerance, label) => check(Number.isFinite(value) && Math.abs(value - expected) <= tolerance, label);
  let result, primary;
  try {
    own({ delete: () => { if (oc.FS.readdir('/').includes(path.slice(1))) oc.FS.unlink(path); } });
    oc.FS.writeFile(path, bytes);
    const reader = own(new oc.STEPControl_Reader());
    check(reader.ReadFile(path) === oc.IFSelect_ReturnStatus.IFSelect_RetDone, 'Separate native reader accepts exported STEP');
    reader.SetSystemLengthUnit(1); near(reader.SystemLengthUnit(), 1, 0, 'Native reader targets millimetres');
    const roots = reader.NbRootsForTransfer();
    check(roots > 0 && reader.TransferRoots() === roots, 'All actual STEP roots transfer');
    const shape = own(reader.OneShape()), valid = own(new oc.BRepCheck_Analyzer(shape, true, false, false));
    check(!shape.IsNull() && valid.IsValid(), 'Exported aggregate is a valid BRep');
    const explorer = own(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE)), solids = [];
    while (explorer.More()) {
      check(solids.length === 0, 'Exported sleeve has no extra solids');
      const solid = own(explorer.Current()), analyzer = own(new oc.BRepCheck_Analyzer(solid, true, false, false));
      check(!solid.IsNull() && analyzer.IsValid(), 'Exported sleeve solid is a valid BRep');
      const volume = own(new oc.GProp_GProps()), area = own(new oc.GProp_GProps()), bounds = own(new oc.Bnd_Box());
      oc.BRepGProp.VolumeProperties(solid, volume, 1e-10, false, false);
      oc.BRepGProp.SurfaceProperties(solid, area, false, false);
      oc.BRepBndLib.AddOptimal(solid, bounds, false, false);
      const min = [bounds.GetXMin(), bounds.GetYMin(), bounds.GetZMin()], max = [bounds.GetXMax(), bounds.GetYMax(), bounds.GetZMax()];
      near(volume.Mass(), 150 * Math.PI, 1e-5, 'Independent tube volume pi*(4²-1²)*10');
      near(area.Mass(), 130 * Math.PI, 1e-5, 'Independent tube area 2*pi*(4+1)*10+2*pi*(4²-1²)');
      for (let axis = 0; axis < 3; axis++) {
        near(min[axis], [-4, -5, -4][axis], 1e-6, 'Independent exported sleeve minimum');
        near(max[axis], [4, 5, 4][axis], 1e-6, 'Independent exported sleeve maximum');
      }
      solids.push({ volume: volume.Mass(), area: area.Mass(), bounds: { min, max }, valid: true });
      explorer.Next();
    }
    check(solids.length === 1, 'One native exported sleeve solid');
    result = { kind: 'separate-native-step-reader', units: 'mm', valid: true, solidCount: 1, solids };
  } catch (error) { primary = error; }
  finally { for (const owner of owners.reverse()) { try { owner.delete(); } catch (error) { cleanup.push(error); } } }
  if (primary || cleanup.length) throw new AggregateError(primary ? [primary, ...cleanup] : cleanup,
    'Revolution STEP verification or native/file cleanup failed.', { cause: primary ?? cleanup[0] });
  return result;
};
