import { getOC, isShape3D, measureShapeVolumeProperties, type AnyShape, type Shape3D } from 'replicad';
import { decodeStepSource, type StepSource } from '../model/stepSource';
import { stepLengthUnit } from './kernel.step-units';
import { castOwnedNativeShape } from './kernel.native';

let nextImport = 0;

/** Returns one owned closed solid. No native handle or file path is persisted. */
export function importStepSolid(source: StepSource): Shape3D {
  const bytes = decodeStepSource(source);
  stepLengthUnit(bytes); // Reject missing/ambiguous units and external references before native parsing.
  const oc = getOC(), path = `/solidflow-import-${++nextImport}.step`, reader = new oc.STEPControl_Reader();
  let raw: ReturnType<typeof reader.OneShape> | null = null, shape: AnyShape | null = null;
  try {
    oc.FS.writeFile(path, bytes);
    if (reader.ReadFile(path) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw new Error('STEP: el lector no pudo leer el archivo completo.');
    // OCCT uses millimeters for this explicit target (1 mm), independently of
    // mutable writer globals. The checked inch/meter fixtures exercise scaling.
    reader.SetSystemLengthUnit(1);
    if (reader.SystemLengthUnit() !== 1) throw new Error('STEP: no se pudo fijar la unidad de destino en milímetros.');
    const roots = reader.NbRootsForTransfer();
    if (roots < 1 || reader.TransferRoots() !== roots || reader.NbShapes() < 1) throw new Error('STEP: transferencia de geometría incompleta.');
    raw = reader.OneShape();
    if (raw.IsNull()) throw new Error('STEP: no contiene geometría transferible.');
    const transfer = raw; raw = null; shape = castOwnedNativeShape(transfer);
    if (!isShape3D(shape)) throw new Error('STEP: se requiere un sólido cerrado tridimensional.');
    const solids = shape.solids;
    try {
      if (solids.length !== 1) throw new Error('STEP: se requiere exactamente un sólido cerrado; no se admiten varios sólidos ni superficies abiertas.');
      const shells = new oc.TopExp_Explorer(solids[0].wrapped, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      let count = 0;
      try {
        while (shells.More()) {
          const shell = shells.Current();
          try { if (!oc.BRep_Tool.IsClosed(shell)) throw new Error('STEP: el sólido contiene una envolvente abierta.'); }
          finally { shell.delete(); }
          count++; shells.Next();
        }
        if (!count) throw new Error('STEP: el sólido no tiene una envolvente cerrada.');
      } finally { shells.delete(); }
    }
    finally { solids.forEach(solid => solid.delete()); }
    // ToAvoid SOLID omits all descendants of solids, exposing loose topology.
    for (const kind of ['SHELL', 'FACE', 'WIRE', 'EDGE', 'VERTEX'] as const) {
      const explorer = new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum[`TopAbs_${kind}`], oc.TopAbs_ShapeEnum.TopAbs_SOLID);
      try { if (explorer.More()) throw new Error('STEP: contiene superficies, curvas o puntos sueltos fuera del sólido.'); }
      finally { explorer.delete(); }
    }
    const analyzer = new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false);
    try {
      const mass = measureShapeVolumeProperties(shape);
      try { if (!analyzer.IsValid() || !Number.isFinite(mass.volume) || mass.volume <= 1e-10) throw new Error('STEP: el sólido no es válido o tiene volumen nulo.'); }
      finally { mass.delete(); }
    } finally { analyzer.delete(); }
    const owned = shape; shape = null; return owned;
  } finally {
    shape?.delete(); raw?.delete(); reader.delete();
    try { oc.FS.unlink(path); } catch { /* write/read failures can precede creation */ }
  }
}
