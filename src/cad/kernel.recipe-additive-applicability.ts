import { cast, getOC, type Shape3D } from 'replicad';
import { maximumNativeShapeTolerance, validateBodyShape } from './kernel.bodies';
import { withNativeOwners } from './kernel.native-ownership';
import { NEXT_CONTACT_DISTANCE_MM } from './kernel.until-next-resolution';

/** Detached observations only. This is not an owner/publication capability. */
export type AdditiveRecipeApplicability =
  | { readonly kind: 'separated'; readonly distanceMm: number; readonly guardMm: number }
  | { readonly kind: 'contact'; readonly evidence: 'native-contact-topology' | 'zero-native-distance' }
  | { readonly kind: 'overlap'; readonly commonVolumeMm3: number };

const topologyKinds = ['COMPSOLID', 'SOLID', 'SHELL', 'FACE', 'WIRE', 'EDGE', 'VERTEX'] as const;

/**
 * Classify the actual placed positive tool against one current detached owner.
 * Empty Common alone is never absence. A completed positive near-distance is
 * indeterminate even when OCCT could tolerance-glue a successful Fuse.
 * Contact remains a candidate: the evaluator must validate its connected union.
 */
export function classifyAdditiveRecipeOwner(owner: Shape3D, tool: Shape3D): AdditiveRecipeApplicability {
  validateBodyShape(owner); validateBodyShape(tool);
  return withNativeOwners(owners => {
    const oc = getOC(), ownerBox = owners.own(owner.boundingBox), toolBox = owners.own(tool.boundingBox);
    const coordinates = [...ownerBox.bounds.flat(), ...toolBox.bounds.flat()];
    if (coordinates.some(value => !Number.isFinite(value))) throw Error('El saliente y sus cuerpos necesitan límites finitos.');
    const scale = Math.max(1, ...coordinates.map(Math.abs));
    const guard = NEXT_CONTACT_DISTANCE_MM + maximumNativeShapeTolerance(owner) + maximumNativeShapeTolerance(tool) + 32 * Number.EPSILON * scale;
    if (!Number.isFinite(guard)) throw Error('La precisión del contacto del saliente no es finita.');
    const argumentsList = owners.own(new oc.NCollection_List_TopoDS_Shape()), tools = owners.own(new oc.NCollection_List_TopoDS_Shape());
    owners.own(argumentsList.Append(owner.wrapped)); owners.own(tools.Append(tool.wrapped));
    const builder = owners.own(new oc.BRepAlgoAPI_Common());
    builder.SetArguments(argumentsList); builder.SetTools(tools); builder.SetNonDestructive(true);
    if (!builder.NonDestructive()) throw Error('No se pudo proteger la geometría al comprobar el contacto del saliente.');
    builder.Build();
    if (!builder.IsDone()) throw Error('No se pudo completar la intersección del saliente con un cuerpo.');
    const raw = owners.own(builder.Shape());
    if (raw.IsNull()) throw Error('Una intersección nula no demuestra separación del saliente.');
    let hasTopology = false, hasContact = false, commonVolume = 0, solidCount = 0;
    for (const kind of topologyKinds) {
      const explorer = owners.own(new oc.TopExp_Explorer(raw, oc.TopAbs_ShapeEnum[`TopAbs_${kind}`], oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
      if (explorer.More()) hasTopology = true;
      if (kind !== 'SOLID') { if (explorer.More() && ['SHELL', 'FACE', 'WIRE', 'EDGE', 'VERTEX'].includes(kind)) hasContact = true; continue; }
      while (explorer.More()) {
        const current = owners.own(explorer.Current()), solid = owners.own(cast(current)).asShape3D();
        validateBodyShape(solid);
        const properties = owners.own(new oc.GProp_GProps());
        oc.BRepGProp.VolumeProperties(current, properties, 1e-10, false, false);
        const value = properties.Mass();
        if (!Number.isFinite(value) || value <= 0) throw Error('La intersección debe contener material cerrado de volumen positivo.');
        commonVolume += value; solidCount++; explorer.Next();
      }
    }
    if (hasTopology) {
      const analyzer = owners.own(new oc.BRepCheck_Analyzer(raw, true, false, false));
      if (!analyzer.IsValid()) throw Error('La intersección del saliente no es una geometría válida.');
      if (solidCount) {
        if (!Number.isFinite(commonVolume)) throw Error('El volumen de intersección del saliente no es finito.');
        return { kind: 'overlap', commonVolumeMm3: commonVolume };
      }
      if (!hasContact) throw Error('La intersección del saliente contiene una topología no admitida.');
      return { kind: 'contact', evidence: 'native-contact-topology' };
    }
    if (raw.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_COMPOUND) throw Error('Sólo un compuesto sin topología puede demostrar una intersección vacía.');
    const query = owners.own(new oc.BRepExtrema_DistShapeShape());
    query.LoadS1(owner.wrapped); query.LoadS2(tool.wrapped); query.Perform();
    if (!query.IsDone() || query.NbSolution() < 1) throw Error('No se pudo completar la distancia entre el saliente y un cuerpo.');
    const distance = query.Value();
    if (!Number.isFinite(distance) || distance < 0) throw Error('La distancia del saliente debe ser finita y no negativa.');
    if (distance > guard) return { kind: 'separated', distanceMm: distance, guardMm: guard };
    if (distance === 0) return { kind: 'contact', evidence: 'zero-native-distance' };
    throw Error('El saliente está demasiado cerca de un cuerpo para determinar su contacto. Revisa la separación.');
  }, undefined, 'Additive recipe applicability or native release failed.');
}
