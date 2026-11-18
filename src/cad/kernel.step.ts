import { cast, getOC, isShape3D, measureShapeVolumeProperties, type Shape3D } from 'replicad';
import { decodeStepSource, type StepSource } from '../model/stepSource';
import { stepLengthUnit } from './kernel.step-units';
import { withNativeOwners } from './kernel.native-ownership';

let nextImport = 0;

/** Returns one owned closed solid. No native handle or file path is persisted. */
export function importStepSolid(source: StepSource): Shape3D {
  const bytes = decodeStepSource(source);
  stepLengthUnit(bytes); // Reject missing/ambiguous units and external references before native parsing.
  if (nextImport >= Number.MAX_SAFE_INTEGER) throw new Error('STEP: se agotaron las identidades temporales de importación.');
  const oc = getOC(), path = `/solidflow-import-${++nextImport}.step`;
  if (oc.FS.readdir('/').includes(path.slice(1))) throw new Error('STEP: la ruta temporal de importación ya está ocupada.');
  return withNativeOwners(owners => {
    // Only this newly admitted pathname is ours. Partial writes are cleaned too;
    // failure to query/release it is fatal and withholds the otherwise valid solid.
    owners.own({ delete() { if (oc.FS.readdir('/').includes(path.slice(1))) oc.FS.unlink(path); } });
    const reader = owners.own(new oc.STEPControl_Reader());
    oc.FS.writeFile(path, bytes);
    if (reader.ReadFile(path) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw new Error('STEP: el lector no pudo leer el archivo completo.');
    // OCCT uses millimeters for this explicit target (1 mm), independently of
    // mutable writer globals. The checked inch/meter fixtures exercise scaling.
    reader.SetSystemLengthUnit(1);
    if (reader.SystemLengthUnit() !== 1) throw new Error('STEP: no se pudo fijar la unidad de destino en milímetros.');
    const roots = reader.NbRootsForTransfer();
    if (roots < 1 || reader.TransferRoots() !== roots || reader.NbShapes() < 1) throw new Error('STEP: transferencia de geometría incompleta.');
    const raw = owners.own(reader.OneShape());
    if (raw.IsNull()) throw new Error('STEP: no contiene geometría transferible.');
    // cast returns a separately owned downcast wrapper. Keep the reader's raw
    // wrapper independently owned; do not use a consuming cast helper here.
    const shape = owners.own(cast(raw));
    if (!isShape3D(shape)) throw new Error('STEP: se requiere un sólido cerrado tridimensional.');
    const solids = owners.ownAll(shape.solids);
    if (solids.length !== 1) throw new Error('STEP: se requiere exactamente un sólido cerrado; no se admiten varios sólidos ni superficies abiertas.');
    const shells = owners.own(new oc.TopExp_Explorer(solids[0].wrapped, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    let count = 0;
    while (shells.More()) {
      const shell = owners.own(shells.Current());
      if (!oc.BRep_Tool.IsClosed(shell)) throw new Error('STEP: el sólido contiene una envolvente abierta.');
      count++; shells.Next();
    }
    if (!count) throw new Error('STEP: el sólido no tiene una envolvente cerrada.');
    // ToAvoid SOLID omits all descendants of solids, exposing loose topology.
    for (const kind of ['SHELL', 'FACE', 'WIRE', 'EDGE', 'VERTEX'] as const) {
      const explorer = owners.own(new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum[`TopAbs_${kind}`], oc.TopAbs_ShapeEnum.TopAbs_SOLID));
      if (explorer.More()) throw new Error('STEP: contiene superficies, curvas o puntos sueltos fuera del sólido.');
    }
    const analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
    const mass = owners.own(measureShapeVolumeProperties(shape));
    if (!analyzer.IsValid() || !Number.isFinite(mass.volume) || mass.volume <= 1e-10) throw new Error('STEP: el sólido no es válido o tiene volumen nulo.');
    return shape;
  }, shape => [shape], 'STEP solid import or native/file release failed.');
}
