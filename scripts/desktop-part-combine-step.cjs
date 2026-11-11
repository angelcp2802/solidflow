'use strict';
const fsp = require('node:fs/promises');

// Measure the actual final B-minus-A STEP and untouchedC with literal box
// formulae. The separate reader is the same kernel family, not interoperability.
module.exports = async function measureCombineStep(bytes, check) {
  const text = bytes.toString('utf8');
  check(text.startsWith('ISO-10303-21;') && /END-ISO-10303-21;\s*$/.test(text)
    && /SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/.test(text), 'Complete millimetre Combine STEP');
  const wasmBinary = await fsp.readFile(require.resolve('replicad-opencascadejs/wasm'));
  const oc = await require('replicad-opencascadejs')({ wasmBinary, print: () => undefined });
  const owners = [], cleanupErrors = [], file = '/original-combine.step';
  const own = item => { owners.push(item); return item; };
  const near = (actual, expected, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    label + ': actual=' + actual + ', expected=' + expected + ', tolerance=' + tolerance);
  let primary, result;
  try {
    own({ delete() { if (oc.FS.readdir('/').includes(file.slice(1))) oc.FS.unlink(file); } }); oc.FS.writeFile(file, bytes);
    const reader = own(new oc.STEPControl_Reader());
    check(reader.ReadFile(file) === oc.IFSelect_ReturnStatus.IFSelect_RetDone, 'Separate reader accepts actual Combine STEP');
    reader.SetSystemLengthUnit(1); near(reader.SystemLengthUnit(), 1, 0, 'Combine STEP uses millimetres');
    const roots = reader.NbRootsForTransfer(); check(roots > 0 && reader.TransferRoots() === roots, 'All Combine STEP roots transfer');
    const shape = own(reader.OneShape()), analyzer = own(new oc.BRepCheck_Analyzer(shape, true, false, false));
    check(!shape.IsNull() && analyzer.IsValid(), 'Exported Combine aggregate BRep is valid');
    const explorer = own(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE)), solids = [];
    while (explorer.More()) {
      check(solids.length < 2, 'No additional Combine exported solids');
      const solid = own(explorer.Current()), valid = own(new oc.BRepCheck_Analyzer(solid, true, false, false));
      check(valid.IsValid(), 'Each actual exported Combine solid has valid BRep');
      const volume = own(new oc.GProp_GProps()), area = own(new oc.GProp_GProps()), bounds = own(new oc.Bnd_Box());
      oc.BRepGProp.VolumeProperties(solid, volume, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(solid, area, false, false);
      oc.BRepBndLib.AddOptimal(solid, bounds, false, false);
      solids.push({ volume: volume.Mass(), area: area.Mass(), min: [bounds.GetXMin(), bounds.GetYMin(), bounds.GetZMin()], max: [bounds.GetXMax(), bounds.GetYMax(), bounds.GetZMax()] });
      explorer.Next();
    }
    check(solids.length === 2, 'Exactly the B-minus-A result and witnessC are exported'); solids.sort((a, b) => a.min[0] - b.min[0]);
    const analytical = [
      { volume: 500, area: 400, min: [10, 0, 0], max: [15, 10, 10] },
      { volume: 64, area: 96, min: [30, 0, 0], max: [34, 4, 4] },
    ];
    solids.forEach((solid, index) => {
      const expected = analytical[index];
      near(solid.volume, expected.volume, 1e-5, 'Independent exported Combine volume');
      near(solid.area, expected.area, 1e-5, 'Independent exported Combine area');
      for (const side of ['min', 'max']) expected[side].forEach((value, axis) => near(solid[side][axis], value, 1e-6, 'Literal exported Combine bounds'));
    });
    result = { reader: 'Separate native STEP reader; same kernel family, not independent interoperability',
      solids, analytical, tolerances: { volumeMm3: 1e-5, areaMm2: 1e-5, boundsMm: 1e-6 } };
  } catch (error) { primary = error; }
  finally { for (const owner of owners.reverse()) { try { owner.delete(); } catch (error) { cleanupErrors.push(error); } } }
  if (primary || cleanupErrors.length) throw new AggregateError(primary ? [primary, ...cleanupErrors] : cleanupErrors,
    'Combine STEP measurement or cleanup failed', { cause: primary ?? cleanupErrors[0] });
  return result;
};
